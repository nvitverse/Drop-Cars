"""Admin-editable app content: the Driver App's first-login cards, its Terms & Conditions and the extra knowledge the Help Bot
is given. Stored in platform_settings (key `app_content_<name>`), defaults in app/utils/app_content_defaults.py.

  GET  /api/public/app-content/{key}?lang=ta   -> what the app shows (one language, live numbers filled in)
  GET  /api/admin/app-content/{key}            -> everything, all languages (for the Admin App editor)
  PUT  /api/admin/app-content/{key}            -> save (owner / manager only)
  POST /api/admin/app-content/{key}/reset      -> go back to the built-in text
"""
import copy
import json
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db
from app.models.platform_setting import PlatformSetting
from app.utils.app_content_defaults import DEFAULTS, LANGS

router = APIRouter(tags=["AppContent"])

KEYS = ("driver_onboarding", "driver_terms", "driver_fee_info", "bot_knowledge")
ICONS = {"check-circle", "file-text", "map-pin", "clock", "indian-rupee", "shield", "shield-check", "users", "alert-triangle",
         "car", "phone", "star", "lock", "route", "heart", "navigation", "wallet", "bell", "camera", "id-card"}
COLORS = {"emerald", "blue", "purple", "red", "indigo", "amber", "teal", "rose"}
MAX_STEPS = 14
MAX_FIELD = 4000
MAX_TERMS = 30000


def _db_key(key: str) -> str:
    return f"app_content_{key}"


def _check_key(key: str) -> None:
    if key not in KEYS:
        raise HTTPException(status_code=404, detail="Unknown content")


def load_content(db: Session, key: str) -> Dict[str, Any]:
    """Stored (edited) content, else the built-in default."""
    row = db.query(PlatformSetting).filter(PlatformSetting.key == _db_key(key)).first()
    if row and row.value:
        try:
            data = json.loads(row.value)
            if isinstance(data, dict):
                return data
        except ValueError:
            pass
    return copy.deepcopy(DEFAULTS[key])


def _placeholders(db: Session) -> Dict[str, str]:
    from app.utils.commission import get_fee_settings

    def _s(k: str, d: str) -> str:
        row = db.query(PlatformSetting).filter(PlatformSetting.key == k).first()
        return str(row.value) if row and row.value else d

    fees = get_fee_settings(db)
    return {
        "commission_min": str(fees.get("commission_min", 200)),
        "convenience_fee": str(fees.get("convenience_fee", 30)),
        "min_driver_hold": str(fees.get("min_driver_hold", 500)),
        "support_phone": _s("support_phone", "+91 72002 17986"),
        "support_email": _s("support_email", "support@dropcars.com"),
    }


def fill(text: str, values: Dict[str, str]) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: values.get(m.group(1), m.group(0)), text or "")


def _pick(d: Any, lang: str) -> str:
    if isinstance(d, dict):
        return str(d.get(lang) or d.get("en") or "")
    return str(d or "")


def _public_base(request: Request) -> str:
    base = str(request.base_url).rstrip("/")
    # Cloud Run terminates TLS before the app, so the request looks like http - links must be https
    if base.startswith("http://") and "localhost" not in base and "127.0.0.1" not in base:
        base = "https://" + base[len("http://"):]
    return base


@router.get("/public/app-content/{key}")
def public_content(key: str, request: Request, response: Response, lang: str = Query("en"), db: Session = Depends(get_db)):
    _check_key(key)
    if key == "bot_knowledge":
        raise HTTPException(status_code=404, detail="Unknown content")
    lang = lang if lang in LANGS else "en"
    ph = _placeholders(db)
    data = load_content(db, key)
    response.headers["Cache-Control"] = "public, max-age=300"
    if key == "driver_onboarding":
        return {
            "version": int(data.get("version", 1)),
            "steps": [
                {
                    "icon": s.get("icon", "shield"), "color": s.get("color", "indigo"),
                    "title": fill(_pick(s.get("title"), lang), ph),
                    "subtitle": fill(_pick(s.get("subtitle"), lang), ph),
                    "description": fill(_pick(s.get("description"), lang), ph),
                }
                for s in (data.get("steps") or [])
            ],
        }
    body_src = data.get("body") or {}
    used = lang if body_src.get(lang) else "en"
    return {
        "version": int(data.get("version", 1)),
        "title": _pick(data.get("title"), lang),
        "body": fill(_pick(body_src, lang), ph),
        "summary": fill(_pick(data.get("summary"), lang), ph),
        "full_url": f"{_public_base(request)}/api/public/terms/driver?lang={lang}",
        "lang_used": used,
    }


def _terms_html(title: str, version: int, body: str, lang: str) -> str:
    import html as _h
    parts = []
    for para in [p.strip() for p in body.split("\n\n") if p.strip()]:
        first, _, rest = para.partition("\n")
        if re.match(r"^\d+\.\s+", first):
            parts.append("<h2>" + _h.escape(first) + "</h2>")
            if rest.strip():
                parts.append("<p>" + _h.escape(rest.strip()).replace("\n", "<br>") + "</p>")
        else:
            parts.append("<p>" + _h.escape(para).replace("\n", "<br>") + "</p>")
    css = (
        ":root{--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--brand:#4f46e5;--bg:#f8fafc}"
        "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Noto Sans Tamil','Noto Sans Telugu','Noto Sans Kannada','Noto Sans Devanagari',sans-serif}"
        ".wrap{max-width:780px;margin:0 auto;padding:22px 18px 60px}"
        ".top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}"
        ".brand{font-weight:800;font-size:20px}.brand span{color:var(--brand)}"
        ".ver{color:var(--muted);font-size:13px}"
        "h1{font-size:26px;line-height:1.25;margin:14px 0 4px}"
        "h2{font-size:18px;margin:28px 0 6px;padding-top:14px;border-top:1px solid var(--line)}"
        "p{margin:8px 0;color:#1e293b}"
        ".langs a{margin-right:12px;color:var(--brand);text-decoration:none;font-size:14px}"
    )
    langs = '<a href="?lang=en">English</a><a href="?lang=ta">தமிழ்</a><a href="?lang=te">తెలుగు</a><a href="?lang=kn">ಕನ್ನಡ</a><a href="?lang=hi">हिन्दी</a>'
    return (
        '<!doctype html><html lang="' + _h.escape(lang) + '"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">'
        "<title>" + _h.escape(title) + " | Drop Cars</title><style>" + css + "</style></head><body><div class=\"wrap\">"
        '<div class="top"><div class="brand">Drop <span>Cars</span></div><div class="ver">Version ' + str(version) + "</div></div>"
        '<div class="langs">' + langs + "</div><h1>" + _h.escape(title) + "</h1>" + "".join(parts) + "</div></body></html>"
    )


@router.get("/public/terms/driver", response_class=HTMLResponse)
def public_terms_page(lang: str = Query("en"), db: Session = Depends(get_db)):
    """The full Terms & Conditions as a plain web page (linked from the Driver App). Always shows the admin-edited text."""
    lang = lang if lang in LANGS else "en"
    data = load_content(db, "driver_terms")
    body_src = data.get("body") or {}
    body = fill(_pick(body_src, lang), _placeholders(db))
    title = _pick(data.get("title"), lang) or "Terms and Conditions"
    return HTMLResponse(_terms_html(title, int(data.get("version", 1)), body, lang if body_src.get(lang) else "en"),
                        headers={"Cache-Control": "public, max-age=300"})


@router.get("/admin/app-content/{key}")
def admin_get(key: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    _check_key(key)
    row = db.query(PlatformSetting).filter(PlatformSetting.key == _db_key(key)).first()
    return {
        "key": key, "content": load_content(db, key), "is_default": not (row and row.value),
        "langs": list(LANGS), "icons": sorted(ICONS), "colors": sorted(COLORS),
        "placeholders": sorted(_placeholders(db).keys()),
        "can_edit": _can_edit(current_admin),
    }


def _can_edit(admin) -> bool:
    role = (getattr(admin, "role", "") or "").lower()
    if role in ("manager", "owner", "founder"):
        return True
    perms = [str(p).lower() for p in (getattr(admin, "permissions", []) or [])]
    return any(p in perms for p in ("manager", "owner", "founder"))


def _clean_lang_map(v: Any, limit: int) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if isinstance(v, dict):
        for lg in LANGS:
            t = v.get(lg)
            if isinstance(t, str) and t.strip():
                out[lg] = t.strip()[:limit]
    return out


class ContentIn(BaseModel):
    content: Dict[str, Any]
    bump_version: bool = False   # True = drivers see the cards / terms again (re-acceptance)


@router.put("/admin/app-content/{key}")
def admin_put(key: str, body: ContentIn, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    _check_key(key)
    if not _can_edit(current_admin):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can edit app content.")
    old = load_content(db, key)
    version = int(old.get("version", 1)) + (1 if body.bump_version else 0)
    c = body.content or {}

    if key == "driver_onboarding":
        steps = c.get("steps")
        if not isinstance(steps, list) or not (1 <= len(steps) <= MAX_STEPS):
            raise HTTPException(status_code=400, detail=f"Add between 1 and {MAX_STEPS} cards.")
        clean_steps = []
        for i, s in enumerate(steps):
            if not isinstance(s, dict):
                raise HTTPException(status_code=400, detail=f"Card {i + 1} is not valid.")
            title = _clean_lang_map(s.get("title"), 120)
            if not title.get("en"):
                raise HTTPException(status_code=400, detail=f"Card {i + 1} needs an English title.")
            clean_steps.append({
                "icon": s.get("icon") if s.get("icon") in ICONS else "shield",
                "color": s.get("color") if s.get("color") in COLORS else "indigo",
                "title": title,
                "subtitle": _clean_lang_map(s.get("subtitle"), 200),
                "description": _clean_lang_map(s.get("description"), MAX_FIELD),
            })
        new = {"version": version, "steps": clean_steps}
    elif key in ("driver_terms", "driver_fee_info"):
        body_map = _clean_lang_map(c.get("body"), MAX_TERMS)
        if not body_map.get("en"):
            raise HTTPException(status_code=400, detail="The English text is required.")
        new = {"version": version, "title": _clean_lang_map(c.get("title"), 120) or old.get("title") or {"en": "Terms and Conditions"}, "body": body_map,
               "summary": _clean_lang_map(c.get("summary"), 4000) or old.get("summary") or {}}
    else:  # bot_knowledge
        text = str(c.get("text") or "").strip()[:8000]
        new = {"version": version, "text": text}

    row = db.query(PlatformSetting).filter(PlatformSetting.key == _db_key(key)).first()
    payload = json.dumps(new, ensure_ascii=False)
    if row:
        row.value = payload
    else:
        db.add(PlatformSetting(key=_db_key(key), value=payload))
    db.commit()
    return {"saved": True, "version": version}


@router.post("/admin/app-content/{key}/reset")
def admin_reset(key: str, db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    _check_key(key)
    if not _can_edit(current_admin):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can edit app content.")
    row = db.query(PlatformSetting).filter(PlatformSetting.key == _db_key(key)).first()
    if row:
        db.delete(row)
        db.commit()
    return {"reset": True}
