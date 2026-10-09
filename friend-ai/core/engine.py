"""llama.cpp inference backend via llama-cpp-python (C++ engine under the hood).

Provides streaming token generation with proper chat-template handling and
stop-string enforcement for the CIPHER persona.
"""

from __future__ import annotations

import os
from typing import Dict, Iterator, List, Optional

from core.chat_template import apply_template, get_stop_strings
from utils.logger import get_logger

logger = get_logger(__name__)


class ModelNotFoundError(FileNotFoundError):
    """Raised when the GGUF model file cannot be located."""


class EngineLoadError(RuntimeError):
    """Raised when the model fails to load."""


class LlamaEngine:
    """Wraps ``llama_cpp.Llama`` with chat templating and streaming helpers."""

    def __init__(
        self,
        model_path: str,
        n_ctx: int = 4096,
        n_gpu_layers: int = -1,
        n_threads: int = 4,
        chat_template: str = "chatml",
        verbose: bool = False,
    ):
        self.model_path = os.path.expanduser(model_path)
        self.n_ctx = int(n_ctx)
        self.n_gpu_layers = int(n_gpu_layers)
        self.n_threads = int(n_threads)
        self.chat_template = chat_template
        self.verbose = verbose
        self.llama = None  # populated by load()

    # ------------------------------------------------------------------ load
    def load(self) -> None:
        """Import llama_cpp lazily and load the GGUF model into memory."""
        try:
            from llama_cpp import Llama  # noqa: WPS433 (lazy heavy import)
        except ImportError as exc:  # pragma: no cover
            raise EngineLoadError(
                "llama-cpp-python is not installed. Run: pip install llama-cpp-python"
            ) from exc

        if not os.path.isfile(self.model_path):
            raise ModelNotFoundError(
                f"Model file not found: {self.model_path}\n"
                "Download a GGUF model (see README) and pass --model-path."
            )

        logger.info("Loading GGUF model: %s (n_ctx=%s, n_gpu_layers=%s)",
                    self.model_path, self.n_ctx, self.n_gpu_layers)
        try:
            self.llama = Llama(
                model_path=self.model_path,
                n_ctx=self.n_ctx,
                n_gpu_layers=self.n_gpu_layers,
                n_threads=self.n_threads,
                verbose=self.verbose,
            )
        except Exception as exc:  # llama.cpp raises many native error types
            raise EngineLoadError(f"FATAL: Model load failed — {exc}") from exc
        logger.info("Model loaded successfully.")

    # ------------------------------------------------------------- generation
    def stream_chat(self, messages: List[Dict[str, str]], **gen_params) -> Iterator[str]:
        """Yield response text chunks for the given conversation messages.

        Formats ``messages`` with the configured chat template and streams raw
        completions, stopping cleanly on template end-of-turn markers.
        """
        if self.llama is None:
            raise EngineLoadError("Engine used before load() was called.")

        prompt = apply_template(messages, self.chat_template)
        stops: List[str] = list(gen_params.pop("stop", None) or []) + get_stop_strings(self.chat_template)

        max_tokens = int(gen_params.pop("max_tokens", 512))
        temperature = float(gen_params.pop("temperature", 0.8))
        top_p = float(gen_params.pop("top_p", 0.9))
        top_k = int(gen_params.pop("top_k", 40))
        repeat_penalty = float(gen_params.pop("repeat_penalty", 1.1))

        stream = self.llama.create_completion(
            prompt=prompt,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            repeat_penalty=repeat_penalty,
            max_tokens=max_tokens,
            stop=stops,
            stream=True,
        )

        buffer = ""
        for chunk in stream:
            piece = chunk.get("choices", [{}])[0].get("text", "")
            if not piece:
                continue
            buffer += piece
            # Guard against partial stop tokens leaking through raw completion.
            cut = _first_stop_index(buffer, stops)
            if cut is not None:
                emit = buffer[:cut]
                buffer = ""
                if emit:
                    yield emit
                return
            # Hold back the tail that could be the start of a stop token.
            hold = _stop_prefix_len(buffer, stops)
            safe, buffer = buffer[:-hold] if hold else buffer, buffer[-hold:] if hold else ""
            if safe:
                yield safe
        if buffer:
            cut = _first_stop_index(buffer, stops)
            tail = buffer[:cut] if cut is not None else buffer
            if tail:
                yield tail

    def close(self) -> None:
        """Release model resources."""
        if self.llama is not None:
            try:
                self.llama.close()
            except Exception:  # pragma: no cover - best effort cleanup
                logger.debug("Engine close raised; ignoring.")
            self.llama = None


def _first_stop_index(text: str, stops: List[str]) -> Optional[int]:
    """Return earliest index where any stop string fully appears, else None."""
    idxs = [i for i in (text.find(s) for s in stops) if i != -1]
    return min(idxs) if idxs else None


def _stop_prefix_len(text: str, stops: List[str]) -> int:
    """Length of the longest suffix of ``text`` that prefixes any stop string."""
    best = 0
    for s in stops:
        for k in range(min(len(s) - 1, len(text)), 0, -1):
            if k > best and text.endswith(s[:k]):
                best = k
                break
    return best
