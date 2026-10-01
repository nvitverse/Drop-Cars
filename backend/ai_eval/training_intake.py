"""Safe intake of new training examples (Addendum 3, point 5).

  - the owner's training data and scripts stay OUTSIDE this public repository: append_example() refuses a path inside any git repo
  - PII is masked before an example is stored (phone numbers, e-mail / UPI ids, Aadhaar, PAN, vehicle plates; names via an optional list)
  - an example is stored only with an explicit consent flag (consent=True) and a source label; the time of consent is recorded
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

EMAIL_OR_UPI = re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\b")
AADHAAR = re.compile(r"(?<!\d)\d{4}\s?\d{4}\s?\d{4}(?!\d)")
PAN = re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")
PLATE = re.compile(r"\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{4}\b")


def mask_pii(text: str, names: Optional[Iterable[str]] = None) -> str:
    from app.crud.conversations import mask_phone_numbers
    out = EMAIL_OR_UPI.sub("[email]", text or "")
    out = AADHAAR.sub("[id]", out)
    out = PAN.sub("[id]", out)
    out = PLATE.sub("[plate]", out)
    out = mask_phone_numbers(out)[0].replace("•••• ••••••", "[phone]")
    for n in names or []:
        if n and len(n) > 1:
            out = re.sub(re.escape(n), "[name]", out, flags=re.I)
    return out


def _repo_root_of(path: Path) -> Optional[Path]:
    p = path.resolve()
    for parent in [p] + list(p.parents):
        if (parent / ".git").exists():
            return parent
    return None


def is_inside_repo(path: str) -> bool:
    return _repo_root_of(Path(path)) is not None


def validate_example(ex: Dict[str, Any]) -> List[str]:
    problems = []
    for k in ("input", "output"):
        if not isinstance(ex.get(k), str) or not ex[k].strip():
            problems.append(f"{k} is missing")
    if ex.get("consent") is not True:
        problems.append("consent flag is not true: do not use this conversation for training")
    if not str(ex.get("source") or "").strip():
        problems.append("source is missing")
    return problems


def append_example(path: str, ex: Dict[str, Any], names: Optional[Iterable[str]] = None) -> Dict[str, Any]:
    if is_inside_repo(path):
        raise ValueError("Training data must stay outside the repository (it is public). Use a private folder.")
    problems = validate_example(ex)
    if problems:
        raise ValueError("; ".join(problems))
    row = {"input": mask_pii(ex["input"], names), "output": mask_pii(ex["output"], names), "source": ex["source"], "consent": True,
           "consent_at": datetime.now(timezone.utc).isoformat(), "masked": True}
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return row
