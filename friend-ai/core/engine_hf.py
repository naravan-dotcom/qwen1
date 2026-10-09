"""Alternative inference backend using HuggingFace ``transformers``.

This is optional — it only activates with ``--backend hf`` and requires the
``transformers`` + ``torch`` packages. Streaming uses TextIteratorStreamer on a
worker thread so tokens are yielded as they are generated.
"""

from __future__ import annotations

from typing import Dict, Iterator, List, Optional

from utils.logger import get_logger

logger = get_logger(__name__)


class HFEngineError(RuntimeError):
    """Raised when the transformers backend cannot be initialized or used."""


class HFEngine:
    """HuggingFace transformers chat backend with streaming support."""

    def __init__(
        self,
        model_id: str,
        chat_template: str = "chatml",
        device: Optional[str] = None,
        load_in_4bit: bool = False,
    ):
        self.model_id = model_id
        self.chat_template = chat_template
        self.device = device
        self.load_in_4bit = load_in_4bit
        self.tokenizer = None
        self.model = None
        self._eos_ids: List[int] = []

    def load(self) -> None:
        try:
            import torch  # noqa: WPS433
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:  # pragma: no cover
            raise HFEngineError(
                "The 'hf' backend needs transformers + torch. "
                "Install with: pip install transformers torch accelerate"
            ) from exc

        logger.info("Loading HuggingFace model: %s", self.model_id)
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_id, trust_remote_code=True)
            kwargs = {"trust_remote_code": True}
            if self.load_in_4bit:
                from transformers import BitsAndBytesConfig
                kwargs["quantization_config"] = BitsAndBytesConfig(load_in_4bit=True)
            else:
                kwargs["torch_dtype"] = "auto"
            self.model = AutoModelForCausalLM.from_pretrained(self.model_id, **kwargs)
            if self.device:
                self.model.to(self.device)  # type: ignore[union-attr]
            self.model.eval()  # type: ignore[union-attr]
        except Exception as exc:
            raise HFEngineError(f"FATAL: HF model load failed — {exc}") from exc

        # Ensure a pad token exists (many causal LMs lack one).
        if self.tokenizer.pad_token_id is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self._eos_ids = [self.tokenizer.eos_token_id] if self.tokenizer.eos_token_id else []
        logger.info("HF model loaded.")

    def stream_chat(self, messages: List[Dict[str, str]], **gen_params) -> Iterator[str]:
        """Yield decoded text chunks for the conversation using HF generation."""
        if self.model is None or self.tokenizer is None:
            raise HFEngineError("HFEngine used before load() was called.")

        import torch
        from transformers import TextIteratorStreamer
        from threading import Thread

        input_text = self.tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self.tokenizer(input_text, return_tensors="pt").to(self.model.device)

        streamer = TextIteratorStreamer(self.tokenizer, skip_prompt=True, skip_special_tokens=True)
        thread_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=int(gen_params.pop("max_tokens", 512)),
            do_sample=True,
            temperature=float(gen_params.pop("temperature", 0.8)),
            top_p=float(gen_params.pop("top_p", 0.9)),
            top_k=int(gen_params.pop("top_k", 40)),
            repetition_penalty=float(gen_params.pop("repeat_penalty", 1.1)),
            eos_token_id=self._eos_ids or None,
            pad_token_id=self.tokenizer.pad_token_id,
        )
        thread = Thread(target=self.model.generate, kwargs=thread_kwargs, daemon=True)
        thread.start()

        try:
            for chunk in streamer:
                if chunk:
                    yield chunk
        finally:
            thread.join(timeout=1.0)

    def close(self) -> None:
        """Free GPU/CPU memory held by the model."""
        if self.model is not None:
            del self.model
            self.model = None
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
        self.tokenizer = None
