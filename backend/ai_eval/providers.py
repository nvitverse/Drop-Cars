"""One interface for every candidate: generate(system, user_text) -> text.

  openai     any OpenAI-compatible endpoint: Ollama (http://host:11434/v1), vLLM, llama.cpp server, or the shim in serving/.
             This is how the owner's own trained model is plugged in. No key needed unless the server wants one.
  gemini     Google Gemini (GEMINI_API_KEY)
  anthropic  Claude (ANTHROPIC_API_KEY); --model defaults to claude-haiku-4-5-20251001
  helpbot    the CURRENT production Help Bot configuration (whichever of Gemini / Claude is configured), the baseline to beat
  scripted   answers from a dict, for tests

Keys come from the environment only and are never written to results.
"""
import os
import time
from typing import Callable, Dict, Optional, Tuple

import requests


class Provider:
    name = "provider"

    def generate(self, system: str, user_text: str) -> str:                # pragma: no cover - interface
        raise NotImplementedError


class OpenAICompatible(Provider):
    def __init__(self, base_url: str, model: str, api_key: Optional[str] = None, timeout: int = 60, name: Optional[str] = None):
        self.base_url, self.model, self.api_key, self.timeout = base_url.rstrip("/"), model, api_key, timeout
        self.name = name or f"openai:{model}"

    def generate(self, system: str, user_text: str) -> str:
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        body = {"model": self.model, "temperature": 0.2, "max_tokens": 600,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_text}]}
        r = requests.post(f"{self.base_url}/chat/completions", headers=headers, json=body, timeout=self.timeout)
        r.raise_for_status()
        return ((r.json().get("choices") or [{}])[0].get("message") or {}).get("content") or ""


class Gemini(Provider):
    name = "gemini"

    def generate(self, system: str, user_text: str) -> str:
        from app.utils import ai_llm
        return ai_llm._call_gemini(system, [{"role": "user", "text": user_text}]) or ""


class Anthropic(Provider):
    def __init__(self, model: Optional[str] = None):
        from app.utils import ai_llm
        self.model = model or ai_llm.ANTHROPIC_MODEL
        self.name = f"anthropic:{self.model}"

    def generate(self, system: str, user_text: str) -> str:
        from app.utils import ai_llm
        old = ai_llm.ANTHROPIC_MODEL
        ai_llm.ANTHROPIC_MODEL = self.model
        try:
            return ai_llm._call_anthropic(system, [{"role": "user", "text": user_text}]) or ""
        finally:
            ai_llm.ANTHROPIC_MODEL = old


class HelpBot(Provider):
    """The model production uses today for the Help Bot (utils/ai_llm.provider(): Gemini first, else Claude)."""

    def __init__(self):
        from app.utils import ai_llm
        self.which = ai_llm.provider()
        if self.which is None:
            raise RuntimeError("No GEMINI_API_KEY / ANTHROPIC_API_KEY set: the baseline cannot run here")
        self.name = f"helpbot-current({self.which})"

    def generate(self, system: str, user_text: str) -> str:
        return (Gemini() if self.which == "gemini" else Anthropic()).generate(system, user_text)


class Scripted(Provider):
    def __init__(self, answers: Dict[str, str], name: str = "scripted", default: str = ""):
        self.answers, self.name, self.default = answers, name, default
        self.seen = []

    def generate(self, system: str, user_text: str) -> str:
        self.seen.append((system, user_text))
        return self.answers.get(user_text, self.default)


def timed(provider: Provider, system: str, user_text: str) -> Tuple[str, float, Optional[str]]:
    t0 = time.time()
    try:
        return provider.generate(system, user_text), time.time() - t0, None
    except Exception as e:  # noqa: BLE001
        return "", time.time() - t0, type(e).__name__


def from_args(kind: str, base_url: Optional[str] = None, model: Optional[str] = None) -> Provider:
    if kind == "openai":
        if not base_url or not model:
            raise SystemExit("--provider openai needs --base-url and --model")
        return OpenAICompatible(base_url, model, api_key=os.getenv("EVAL_API_KEY"))
    if kind == "gemini":
        return Gemini()
    if kind == "anthropic":
        return Anthropic(model)
    if kind == "helpbot":
        return HelpBot()
    raise SystemExit(f"unknown provider {kind}")
