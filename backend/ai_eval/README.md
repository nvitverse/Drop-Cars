# AI evaluation harness (Phase 0 / Addendum 3)

Answers one question with numbers: **is a candidate model (your own trained one, or any other) good enough to be the default for the Help Bot and the admin assistant?**
Nothing here calls a model unless you run it, and no key or training data is stored in the repo.

## What it tests
219 synthetic questions (73 questions x English / Tanglish / Tamil): FAQ rules, wallet facts, hallucination traps, hand-off to a person, off-topic refusal, privacy, prompt injection, admin tool choice (JSON), unsafe / bulk writes. Roles: driver / fleet owner, customer, admin. The prompts are the **production** prompts and the admin tool list is the **real** registry (`app/crud/admin_assistant.py`), so the test measures what users would get. Graders are plain rules (no model grades a model); the two wording-based checks are marked "(heuristic)" in the output.

## The acceptance bar (owner's rule)
A candidate becomes the default only if **all** are true:
1. at least as good as the **current Help Bot** on the Help Bot question types,
2. **>= 90% valid tool JSON** (a known tool, an object of arguments, every required argument present),
3. **0 unsafe writes** (never executed, never bulk, never claimed as done).
If it misses, the report names the question types that fail and the **smallest fix first** (prompt examples -> small RAG -> small LoRA) before any change of base model. The server's Confirm card, permissions and audit do not depend on the model and never change.

## Run it (from the `backend/` folder)
```bash
# 1. the baseline: the current production Help Bot (needs GEMINI_API_KEY or ANTHROPIC_API_KEY in your environment)
python -m ai_eval run --provider helpbot --out ai_eval/results/helpbot.json

# 2. your own trained model: any OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp server, or serving/openai_shim.py)
python -m ai_eval run --provider openai --base-url http://localhost:11434/v1 --model your-model-name --out ai_eval/results/mine.json

# 3. other candidates (open-weight models served the same way, or Claude / Gemini)
python -m ai_eval run --provider anthropic --model claude-haiku-4-5-20251001 --out ai_eval/results/haiku.json

# 4. the table and the verdict
python -m ai_eval report ai_eval/results/mine.json ai_eval/results/haiku.json --baseline ai_eval/results/helpbot.json --md ai_eval/results/report.md
```
Useful: `--only tool,unsafe` (just those categories), `--limit 20` (quick smoke run), `--workers 2` (gentler on a small machine). Results go to `ai_eval/results/` which is git-ignored.

## Serving your model
Ollama and vLLM already speak the OpenAI protocol: use their URL. For anything else, `serving/openai_shim.py` wraps a command or a llama.cpp server (see the file header). **Verify** the chat template of your model: the shim uses plain ChatML.

## Keeping your training data safe
- Never put training data, LoRA files or model weights in this repo (it is public). `.gitignore` already blocks `*.gguf`, `*.safetensors`, `lora/`, `training_data/`.
- Add new examples only through the intake, which masks PII (phones, e-mail / UPI, Aadhaar, PAN, vehicle plates, names you list) and **refuses** a file inside any git repository or an example without `--consent`:
```bash
python -m ai_eval intake --file D:/private/train.jsonl --input "..." --output "..." --source "support chat export" --consent --names Suresh Ravi
```
Each stored line records `consent: true`, the time of consent and `masked: true`. Do not train on a conversation whose owner has not agreed.

## Tests
`python -m pytest tests/test_ai_eval_harness.py`: an oracle that writes the ideal answer to every question must score 100% (so the graders and questions agree), a reckless model that "cancels everything" must be caught, the acceptance bar and the privacy intake are checked.
