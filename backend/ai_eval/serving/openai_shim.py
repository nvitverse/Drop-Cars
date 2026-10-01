"""A tiny OpenAI-compatible server around ANY local model, for when the model is not already served by Ollama / vLLM / llama.cpp
(those three already speak this protocol: point `--base-url` straight at them and skip this file).

    pip install fastapi uvicorn          (already in requirements.txt)
    SHIM_BACKEND=command SHIM_COMMAND="python my_model_cli.py" uvicorn ai_eval.serving.openai_shim:app --port 8001
    python -m ai_eval run --provider openai --base-url http://localhost:8001/v1 --model local --out results/local.json

  SHIM_BACKEND=command    runs SHIM_COMMAND once per request; the chat messages arrive as JSON on stdin, the answer is read from stdout
  SHIM_BACKEND=llamacpp   forwards to a llama.cpp server at SHIM_URL (/completion) using a ChatML prompt  (Verify against your model's template)

This file only forwards text. It never logs prompts or answers, and holds no key.
"""
import json
import os
import shlex
import subprocess
import time
import uuid
from typing import Any, Dict, List

import requests
from fastapi import FastAPI, HTTPException

app = FastAPI(title="OpenAI-compatible shim")


def _chatml(messages: List[Dict[str, str]]) -> str:
    parts = [f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>" for m in messages]
    return "\n".join(parts) + "\n<|im_start|>assistant\n"


def generate(messages: List[Dict[str, str]]) -> str:
    backend = os.getenv("SHIM_BACKEND", "command")
    if backend == "command":
        cmd = os.getenv("SHIM_COMMAND")
        if not cmd:
            raise HTTPException(status_code=500, detail="SHIM_COMMAND is not set")
        out = subprocess.run(shlex.split(cmd), input=json.dumps(messages), capture_output=True, text=True, timeout=120)
        if out.returncode != 0:
            raise HTTPException(status_code=502, detail="the model command failed")
        return out.stdout.strip()
    if backend == "llamacpp":
        r = requests.post(os.getenv("SHIM_URL", "http://localhost:8080").rstrip("/") + "/completion",
                          json={"prompt": _chatml(messages), "n_predict": 600, "temperature": 0.2, "stop": ["<|im_end|>"]}, timeout=120)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail="the llama.cpp server failed")
        return (r.json().get("content") or "").strip()
    raise HTTPException(status_code=500, detail=f"unknown SHIM_BACKEND {backend}")


@app.post("/v1/chat/completions")
def chat_completions(body: Dict[str, Any]):
    messages = body.get("messages") or []
    if not messages:
        raise HTTPException(status_code=400, detail="messages are required")
    text = generate([{"role": m.get("role", "user"), "content": str(m.get("content", ""))} for m in messages])
    return {"id": f"chatcmpl-{uuid.uuid4().hex[:12]}", "object": "chat.completion", "created": int(time.time()), "model": body.get("model", "local"),
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}]}
