"""python -m ai_eval <command>   (run from the backend/ folder)

  dataset                       write questions.jsonl (219 synthetic questions: Tamil, Tanglish, English)
  run     --provider P ...      ask every question, grade, save results/<name>.json
  report  A.json [B.json ...]   table + acceptance verdict; --baseline helpbot.json to compare with the current Help Bot
  intake  --file F --input .. --output .. --source .. --consent    mask PII and append one training example to a PRIVATE file
"""
import argparse
import json
import os
import sys
from pathlib import Path

from ai_eval import dataset, providers, report, runner, training_intake

HERE = Path(__file__).parent
QUESTIONS = HERE / "questions.jsonl"


def _load(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="ai_eval")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("dataset")
    r = sub.add_parser("run")
    r.add_argument("--provider", required=True, choices=["openai", "gemini", "anthropic", "helpbot"])
    r.add_argument("--base-url")
    r.add_argument("--model")
    r.add_argument("--only", help="comma separated categories")
    r.add_argument("--limit", type=int)
    r.add_argument("--workers", type=int, default=4)
    r.add_argument("--out", required=True)
    p = sub.add_parser("report")
    p.add_argument("results", nargs="+")
    p.add_argument("--baseline")
    p.add_argument("--md")
    i = sub.add_parser("intake")
    i.add_argument("--file", required=True)
    i.add_argument("--input", required=True)
    i.add_argument("--output", required=True)
    i.add_argument("--source", required=True)
    i.add_argument("--consent", action="store_true")
    i.add_argument("--names", nargs="*", default=[])
    a = ap.parse_args(argv)

    if a.cmd == "dataset":
        print(f"wrote {dataset.write(str(QUESTIONS))} questions to {QUESTIONS}")
        return 0
    if a.cmd == "run":
        prov = providers.from_args(a.provider, a.base_url, a.model)
        res = runner.run(prov, dataset.load(str(QUESTIONS)), a.workers, a.only, a.limit)
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
        print(json.dumps(runner.summarize(res), ensure_ascii=False, indent=1))
        return 0
    if a.cmd == "report":
        results = [_load(x) for x in a.results]
        summaries = [runner.summarize(x) for x in results]
        base = runner.summarize(_load(a.baseline)) if a.baseline else None
        if base:
            summaries = [base] + summaries
        verdicts = {s["provider"]: report.verdict(s, base, x["rows"]) for s, x in zip(summaries[1 if base else 0:], results)}
        md = report.markdown(summaries, verdicts)
        if a.md:
            Path(a.md).write_text(md, encoding="utf-8")
        print(md)
        return 0
    if a.cmd == "intake":
        row = training_intake.append_example(a.file, {"input": a.input, "output": a.output, "source": a.source, "consent": a.consent}, a.names)
        print("stored (masked):", json.dumps(row, ensure_ascii=False))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
