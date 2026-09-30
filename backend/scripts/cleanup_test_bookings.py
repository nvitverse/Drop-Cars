"""Remove TEST bookings from the database (dry-run by default).

    python scripts/cleanup_test_bookings.py --ids 287,288,290                    # dry run: list what would go
    python scripts/cleanup_test_bookings.py --ids 287,288,290 --confirm          # delete those bookings
    python scripts/cleanup_test_bookings.py --since 2026-08-01 --customer-name test --confirm

Point it at the real database with the usual env overrides (DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD) - the
password is never stored in this file.

How it works: every table that references `orders` (found from the database's own foreign keys, so nothing is forgotten) is
cleaned first, then the order rows. Money history is kept: wallet-ledger tables only get their `order_id` cleared (NULL), the
rows themselves stay. Everything runs in ONE transaction - if anything fails, nothing at all is deleted.

Bookings that already moved money (wallet_ledger entries carrying their id) are LISTED but skipped unless --include-money is
given. wallet_ledger rows (no foreign key) are never deleted, and wallet BALANCES are never changed - fix a balance by hand if a
test trip moved real money.
"""
import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text  # noqa: E402
from app.database.session import SessionLocal  # noqa: E402


def fk_children(db, table):
    """(child_table, child_column, parent_column, child_column_is_nullable) for every single-column FK pointing at `table`."""
    return db.execute(text("""
        SELECT cl.relname, att.attname, pa.attname, NOT att.attnotnull
        FROM pg_constraint c
        JOIN pg_class cl ON cl.oid = c.conrelid
        JOIN pg_class pcl ON pcl.oid = c.confrelid
        JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
        JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
        WHERE c.contype = 'f' AND pcl.relname = :t AND array_length(c.conkey, 1) = 1 AND cl.relname <> :t
    """), {"t": table}).fetchall()


def primary_key(db, table):
    return db.execute(text("""
        SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = CAST(:t AS regclass) AND i.indisprimary LIMIT 1
    """), {"t": f'"{table}"'}).scalar()


def plan_for(db, table, key_col, values, steps, seen):
    """Append (action, table, column, values) steps - children before parents."""
    if not values:
        return
    for child, ccol, pcol, nullable in fk_children(db, table):
        # values of the referenced column for our rows (usually the primary key)
        if pcol != key_col:
            rows = db.execute(text(f'SELECT DISTINCT "{pcol}" FROM "{table}" WHERE "{key_col}" = ANY(:v)'), {"v": list(values)}).fetchall()
            ref_vals = {r[0] for r in rows if r[0] is not None}
        else:
            ref_vals = set(values)
        if not ref_vals or (child, ccol) in seen:
            continue
        cpk = primary_key(db, child)
        found = db.execute(text(f'SELECT "{cpk or ccol}" FROM "{child}" WHERE "{ccol}" = ANY(:v)'), {"v": list(ref_vals)}).fetchall()
        child_ids = {r[0] for r in found}
        if not child_ids:
            continue
        seen.add((child, ccol))
        if nullable and "ledger" in child:
            steps.append(("NULL", child, ccol, ref_vals, len(child_ids)))       # keep the money history, just detach it
        else:
            plan_for(db, child, cpk or ccol, child_ids, steps, seen)
            steps.append(("DELETE", child, ccol, ref_vals, len(child_ids)))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ids", help="comma separated order ids")
    p.add_argument("--since", help="YYYY-MM-DD: bookings created on/after this date")
    p.add_argument("--customer-name", help="substring match on customer name (case-insensitive)")
    p.add_argument("--include-money", action="store_true", help="also delete bookings that have wallet_ledger entries")
    p.add_argument("--confirm", action="store_true", help="actually delete (default is a dry run)")
    a = p.parse_args()
    if not (a.ids or a.since or a.customer_name):
        p.error("give at least one of --ids / --since / --customer-name")

    db = SessionLocal()
    try:
        where, params = [], {}
        if a.ids:
            where.append("o.id = ANY(:ids)")
            params["ids"] = [int(x) for x in a.ids.split(",") if x.strip()]
        if a.since:
            where.append("o.created_at >= :since")
            params["since"] = datetime.fromisoformat(a.since)
        if a.customer_name:
            where.append("o.customer_name ILIKE :cn")
            params["cn"] = f"%{a.customer_name}%"
        rows = db.execute(text(
            "SELECT o.id, o.customer_name, o.trip_status, o.created_at, "
            "(SELECT COUNT(*) FROM wallet_ledger w WHERE w.reference_id = o.id::text) AS money "
            "FROM orders o WHERE " + " AND ".join(where) + " ORDER BY o.id"), params).fetchall()
        print(f"{len(rows)} booking(s) match:")
        deletable = []
        for r in rows:
            skip = r.money and not a.include_money
            print(f"  #{r.id:<6} {str(r.trip_status):<10} {str(r.created_at)[:16]}  {r.customer_name}  ledger entries: {r.money}{'  -> SKIPPED (has money movements)' if skip else ''}")
            if not skip:
                deletable.append(r.id)

        steps = []
        plan_for(db, "orders", "id", set(deletable), steps, set())
        print("\nWhat would be touched:")
        for action, table, col, vals, n in steps:
            print(f"  {action:6s} {table}.{col}  ({n} row(s))")
        print(f"  DELETE orders  ({len(deletable)} row(s))")

        if not a.confirm:
            print(f"\nDRY RUN - {len(deletable)} would be deleted. Re-run with --confirm to delete.")
            db.rollback()
            return
        if not deletable:
            print("Nothing to delete.")
            return

        # one transaction: any error rolls everything back
        for action, table, col, vals, n in steps:
            if action == "NULL":
                db.execute(text(f'UPDATE "{table}" SET "{col}" = NULL WHERE "{col}" = ANY(:v)'), {"v": list(vals)})
            else:
                db.execute(text(f'DELETE FROM "{table}" WHERE "{col}" = ANY(:v)'), {"v": list(vals)})
        src = db.execute(text("SELECT source, source_order_id FROM orders WHERE id = ANY(:ids)"), {"ids": deletable}).fetchall()
        db.execute(text("DELETE FROM orders WHERE id = ANY(:ids)"), {"ids": deletable})
        new_ids = [r.source_order_id for r in src if str(r.source).endswith("NEW_ORDERS")]
        hourly_ids = [r.source_order_id for r in src if str(r.source).endswith("HOURLY_RENTAL")]
        if new_ids:
            db.execute(text("DELETE FROM new_orders WHERE order_id = ANY(:n)"), {"n": new_ids})
        if hourly_ids:
            db.execute(text("DELETE FROM hourly_rental WHERE id = ANY(:h)"), {"h": hourly_ids})
        db.commit()
        print(f"\nDeleted {len(deletable)} booking(s).")
    except Exception:
        db.rollback()
        print("\nFAILED - rolled back, NOTHING was deleted.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
