"""Every `from app.x import Y` in the backend must name something that exists. A wrong name inside a function only fails when that endpoint is used
(the Chats 'AI Drafting' button, the vendor Cancel, the Owner's Remove account ...), so this walks all of them once."""
import ast
import importlib
import os

APP = os.path.join(os.path.dirname(__file__), "..", "app")
# dead file nobody imports (it points at models that no longer exist)
IGNORE = {os.path.normpath(os.path.join(APP, "utils", "expiry_checker.py"))}


def test_every_app_import_resolves():
    wanted = {}
    for root, _, files in os.walk(APP):
        if "__pycache__" in root:
            continue
        for f in files:
            if not f.endswith(".py"):
                continue
            path = os.path.normpath(os.path.join(root, f))
            if path in IGNORE:
                continue
            tree = ast.parse(open(path, encoding="utf-8-sig").read())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app") and node.level == 0:
                    for a in node.names:
                        if a.name != "*":
                            wanted.setdefault(node.module, set()).add((a.name, f"{f}:{node.lineno}"))
    problems = []
    for mod_name, names in sorted(wanted.items()):
        try:
            mod = importlib.import_module(mod_name)
        except Exception as e:      # noqa: BLE001
            problems.append(f"{mod_name} does not import: {type(e).__name__}: {str(e)[:80]}")
            continue
        for name, where in sorted(names):
            if hasattr(mod, name):
                continue
            try:
                importlib.import_module(f"{mod_name}.{name}")
            except Exception:       # noqa: BLE001
                problems.append(f"{where}: cannot import {name} from {mod_name}")
    assert not problems, "\n".join(problems)


def test_owner_can_remove_a_duplicate_customer_vendor_and_fleet_owner(pg_session):
    """The Remove-account screen failed on its very first line (wrong model names) for every account type."""
    import uuid
    from types import SimpleNamespace
    from app.api.routes.admin import admin_remove_account
    from app.models.customer import CustomerCredentials
    from app.models.vendor import VendorCredentials
    from app.models.vehicle_owner import VehicleOwnerCredentials
    db = pg_session
    owner = SimpleNamespace(id=uuid.uuid4(), username="owner", role="Owner")
    for cls, kind in ((CustomerCredentials, "customer"), (VendorCredentials, "vendor"), (VehicleOwnerCredentials, "vehicle_owner")):
        row = cls(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
        db.add(row)
        db.flush()
        rid = str(row.id)
        out = admin_remove_account(rid, account_type=kind, db=db, current_admin=owner)
        assert out["id"] == rid, kind
        assert db.query(cls).filter(cls.id == row.id).first() is None, kind


def test_chats_ai_draft_works_for_an_owner_thread_a_driver_thread_and_an_odd_key(pg_session, monkeypatch):
    import uuid
    from types import SimpleNamespace
    from app.api.routes import support
    from app.models.support_message import SupportMessage
    from app.models.vehicle_owner import VehicleOwnerCredentials
    db = pg_session
    monkeypatch.setattr("app.utils.ai_llm.draft_replies", lambda db_, thread_key, sender_role, messages, facts: [f"hi {facts['name']}"])
    owner = VehicleOwnerCredentials(primary_number="8" + str(uuid.uuid4().int)[:9], hashed_password="x")
    db.add(owner)
    db.flush()
    for key in (str(owner.id), str(uuid.uuid4()), "not-a-uuid"):
        db.add(SupportMessage(thread_key=key, thread_role="OWNER", thread_name="Sameer", sender_side="USER", sender_name="Sameer", text="Need help with my login"))
    db.flush()
    admin = SimpleNamespace(id=uuid.uuid4(), username="a", role="Owner")
    for key in (str(owner.id), "not-a-uuid"):
        out = support.draft_support_thread_reply(key, db=db, current_admin=admin)
        assert out["drafts"] and out["thread_key"] == key
    out = support.draft_support_thread_reply(str(owner.id), db=db, current_admin=admin)
    assert out["drafts"] == ["hi Sameer"]            # the name falls back to the thread name when there is no owner profile yet
