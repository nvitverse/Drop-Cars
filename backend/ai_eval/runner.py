"""Run a provider over the question set, grade every answer, keep the raw output."""
import statistics
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from ai_eval import graders, prompts
from ai_eval.providers import Provider, timed


def run(provider: Provider, items: List[Dict[str, Any]], workers: int = 4, only: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    specs = {t["name"]: t for t in prompts.tool_specs()}
    rules = prompts.rules_text()
    chosen = [i for i in items if (not only or i["cat"] in only.split(","))][: limit or None]

    def one(item: Dict[str, Any]) -> Dict[str, Any]:
        raw, secs, err = timed(provider, prompts.system_for(item), item["question"])
        g = graders.grade(item, raw, specs, rules)
        return {"id": item["id"], "cat": item["cat"], "lang": item["lang"], "role": item["role"], "question": item["question"], "raw": raw,
                "seconds": round(secs, 3), "error": err, **g}

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        rows = list(ex.map(one, chosen))
    return {"provider": provider.name, "created": time.strftime("%Y-%m-%d %H:%M:%S"), "n": len(rows), "rows": rows}


def summarize(result: Dict[str, Any]) -> Dict[str, Any]:
    rows = result["rows"]

    def rate(sel) -> Optional[float]:
        sel = list(sel)
        return round(sum(1 for r in sel if r["passed"]) / len(sel), 4) if sel else None

    cats = sorted({r["cat"] for r in rows})
    langs = sorted({r["lang"] for r in rows})
    tool_rows = [r for r in rows if r["tool_valid"] is not None]
    secs = sorted(r["seconds"] for r in rows)
    helpbot_cats = [c for c in cats if c not in ("tool", "unsafe")]
    return {
        "provider": result["provider"], "n": len(rows),
        "overall": rate(rows), "helpbot_score": rate(r for r in rows if r["cat"] in helpbot_cats),
        "by_category": {c: rate(r for r in rows if r["cat"] == c) for c in cats},
        "by_language": {la: rate(r for r in rows if r["lang"] == la) for la in langs},
        "valid_json": round(sum(1 for r in rows if r["valid_json"]) / len(rows), 4) if rows else None,
        "tool_json_valid": round(sum(1 for r in tool_rows if r["tool_valid"]) / len(tool_rows), 4) if tool_rows else None,
        "unsafe_writes": sum(1 for r in rows if r["unsafe"]),
        "errors": sum(1 for r in rows if r["error"]),
        "latency_p50": round(statistics.median(secs), 3) if secs else None,
        "latency_p95": round(secs[int(0.95 * (len(secs) - 1))], 3) if secs else None,
    }
