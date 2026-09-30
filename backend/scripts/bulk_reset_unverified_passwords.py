"""
Bulk reset password script for users WITHOUT verified email:
Every user who has NO email or email_verified != True will have their password set to the LAST 6 DIGITS of their primary mobile number.

Usage:
  python scripts/bulk_reset_unverified_passwords.py          # DRY RUN: counts, preview, changes nothing
  python scripts/bulk_reset_unverified_passwords.py --apply  # ACTUALLY RESET with automatic JSON backup
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime
from passlib.context import CryptContext
from sqlalchemy import create_engine, text

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DB_HOST = os.getenv("DB_HOST", "34.126.214.99")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "drop-cars")
DB_USER = os.getenv("DB_USER", "drop-cars")
DB_PASS = os.getenv("DB_PASSWORD", "Dropcars3456!2026backenduser")

url = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(url)


def last6(number):
    digits = re.sub(r"\D", "", number or "")
    return digits[-6:] if len(digits) >= 6 else None


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def process_table(conn, table_name, apply=False, backup_data=None):
    print(f"\n==================== TABLE: {table_name} ====================")
    # Check columns
    cols = [c[0] for c in conn.execute(text(f"""
        SELECT column_name FROM information_schema.columns 
        WHERE table_schema='drop-cars' AND table_name='{table_name}'
    """)).fetchall()]
    
    has_plain_col = "plain_password" in cols
    has_email_col = "email" in cols
    has_verified_col = "email_verified" in cols

    # Query all records
    records = conn.execute(text(f'SELECT id, primary_number, hashed_password, {("email" if has_email_col else "NULL as email")}, {("email_verified" if has_verified_col else "NULL as email_verified")} FROM "drop-cars".{table_name}')).fetchall()
    
    total = len(records)
    with_verified_email = []
    skipped_no_digits = []
    to_reset = []

    for r in records:
        r_id, phone, old_hash, email, email_verified = r[0], r[1], r[2], r[3], r[4]
        
        # User has verified email -> PROTECT (DO NOT TOUCH)
        if email and str(email).strip() and (email_verified is True):
            with_verified_email.append((r_id, phone, email))
            continue
        # Also protect if email exists (even if unverified flag is None, let's check user intent)
        if email and str(email).strip() and "@" in str(email):
            with_verified_email.append((r_id, phone, email))
            continue

        p_last6 = last6(phone)
        if not p_last6:
            skipped_no_digits.append((r_id, phone))
            continue

        to_reset.append({
            "id": r_id,
            "phone": phone,
            "last6": p_last6,
            "old_hash": old_hash
        })

    print(f"Total records: {total}")
    print(f"Protected (has email/verified): {len(with_verified_email)}")
    print(f"Skipped (< 6 digits in phone): {len(skipped_no_digits)}")
    print(f"Eligible to Reset (No email -> Last 6 digits): {len(to_reset)}")

    if to_reset:
        print("\nSample to reset (first 5):")
        for item in to_reset[:5]:
            print(f"  ID: {item['id']} | Phone: {item['phone']} -> New Password: {item['last6']}")

    if with_verified_email:
        print("\nSample protected accounts (first 3):")
        for item in with_verified_email[:3]:
            print(f"  [PROTECTED] ID: {item[0]} | Phone: {item[1]} | Email: {item[2]}")

    if apply and to_reset:
        if backup_data is not None:
            backup_data[table_name] = {str(item["id"]): item["old_hash"] for item in to_reset}

        print(f"\nApplying reset for {len(to_reset)} records in {table_name}...")
        for item in to_reset:
            new_hash = get_password_hash(item["last6"])
            if has_plain_col:
                conn.execute(text(f"""
                    UPDATE "drop-cars".{table_name}
                    SET hashed_password = :h, plain_password = :p
                    WHERE id = :id
                """), {"h": new_hash, "p": item["last6"], "id": item["id"]})
            else:
                conn.execute(text(f"""
                    UPDATE "drop-cars".{table_name}
                    SET hashed_password = :h
                    WHERE id = :id
                """), {"h": new_hash, "id": item["id"]})
        print(f"-> SUCCESS: Reset {len(to_reset)} records in {table_name}.")

    return len(to_reset)


def main():
    parser = argparse.ArgumentParser(description="Bulk reset passwords for users without email.")
    parser.add_argument("--apply", action="store_true", help="Apply changes to the live database (default is dry run).")
    parser.add_argument("--backup-dir", default=r"c:\Users\Administrator\Desktop\dropcars-review\backend\scripts", help="Directory to save backup json.")
    args = parser.parse_args()

    tables_to_process = ["vehicle_owner", "car_driver", "vendor", "customer"]
    
    with engine.begin() as conn:
        backup_data = {}
        total_reset = 0
        for t in tables_to_process:
            count = process_table(conn, t, apply=args.apply, backup_data=backup_data)
            total_reset += count

        if not args.apply:
            print(f"\n=======================================================")
            print(f"DRY RUN SUMMARY: Total {total_reset} accounts across all tables will be reset.")
            print("Nothing was changed. Run with --apply to execute.")
            print(f"=======================================================")
        else:
            # Write backup file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = os.path.join(args.backup_dir, f"bulk_password_reset_backup_{timestamp}.json")
            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(backup_data, f, indent=2)
            print(f"\n=======================================================")
            print(f"APPLIED SUCCESSFULLY: {total_reset} accounts reset.")
            print(f"Backup file saved to: {backup_path}")
            print(f"=======================================================")


if __name__ == "__main__":
    main()
