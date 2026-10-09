"""Chat template formatting for multiple model families (ChatML, Llama, Qwen).

Converts a list of role/content messages into a single raw prompt string that
instruct-style models understand. Also exposes stop-strings per template so
generation halts cleanly at end-of-turn markers.
"""

from __future__ import annotations

from typing import Dict, List


class ChatTemplateError(ValueError):
    """Raised when an unknown or unsupported chat template is requested."""


def _normalize(message) -> Dict[str, str]:
    """Normalize a message (dict or object with role/content attributes)."""
    if isinstance(message, dict):
        return {"role": message.get("role", "user"), "content": message.get("content", "")}
    return {"role": getattr(message, "role", "user"), "content": getattr(message, "content", "")}


def format_chatml(messages: List[Dict[str, str]]) -> str:
    """ChatML format used by Qwen-instruct and many small GGUF instruct models."""
    im_start = "<|" + "im_start" + "|>"
    im_end = "<|" + "im_end" + "|>"
    parts = []
    for msg in messages:
        m = _normalize(msg)
        parts.append(f"{im_start}{m['role']}\n{m['content']}{im_end}\n")
    parts.append(f"{im_start}assistant\n")
    return "".join(parts)


def format_llama(messages: List[Dict[str, str]]) -> str:
    """Llama-3 style chat format."""
    open_tag = "<|" + "begin_of_text" + "|>"
    header_start = "<|" + "start_header_id" + "|>"
    header_end = "<|" + "end_header_id" + "|>"
    eos = "<|" + "eot_id" + "|>"
    parts = [open_tag]
    for msg in messages:
        m = _normalize(msg)
        parts.append(f"{header_start}{m['role']}{header_end}\n{m['content']}{eos}\n")
    parts.append(f"{header_start}assistant{header_end}\n")
    return "".join(parts)


def format_qwen(messages: List[Dict[str, str]]) -> str:
    """Qwen2.5 style — identical to ChatML but kept separate for clarity/tuning."""
    return format_chatml(messages)


TEMPLATES = {
    "chatml": format_chatml,
    "llama": format_llama,
    "qwen": format_qwen,
}


def get_stop_strings(template_name: str) -> List[str]:
    """Return the stop sequences that should terminate generation for a template."""
    name = (template_name or "chatml").lower()
    if name == "llama":
        return ["<|" + "eot_id" + "|>", "<|" + "end_of_text" + "|>"]
    # chatml / qwen
    return ["<|" + "im_end" + "|>"]


def apply_template(messages: List[Dict[str, str]], template_name: str) -> str:
    """Format messages with the named template. Raises ChatTemplateError if unknown."""
    name = (template_name or "chatml").lower()
    formatter = TEMPLATES.get(name)
    if formatter is None:
        raise ChatTemplateError(
            f"Unknown chat template '{template_name}'. Available: {', '.join(sorted(TEMPLATES))}"
        )
    return formatter(messages)
