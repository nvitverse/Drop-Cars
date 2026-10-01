"""Admin permission check shared by the assistant's read tools, action tools and 'what needs attention'.

Owner passes everything; a Staff admin needs the key in `permissions`. A tuple means "any of these".
(Same rule as require_payment_release_permission / require_tax_accounts_permission in api/routes/admin.py.)
"""
from typing import Optional, Tuple, Union

Perm = Union[None, str, Tuple[str, ...]]


def has_permission(admin, key: Perm) -> bool:
    if key is None:
        return True
    if (getattr(admin, "role", "") or "").lower() == "owner":
        return True
    have = set(getattr(admin, "permissions", None) or [])
    keys = (key,) if isinstance(key, str) else tuple(key)
    return any(k in have for k in keys)
