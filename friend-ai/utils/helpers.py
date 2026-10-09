"""Utility helpers: config loading/merging, formatting, misc."""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

DEFAULT_CONFIG: Dict[str, Any] = {
    "model": {
        "path": "./models/model.gguf",
        "n_ctx": 4096,
        "n_gpu_layers": -1,
        "n_threads": 4,
        "chat_template": "chatml",
    },
    "generation": {
        "temperature": 0.8,
        "top_p": 0.9,
        "top_k": 40,
        "max_tokens": 1024,
        "repeat_penalty": 1.1,
    },
    "ui": {
        "typing_speed": 0.015,
        "theme": "hacker",
        "show_banner": True,
    },
    "chat": {
        "max_history": 50,
        "system_prompt_enabled": True,
    },
}


def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Recursively merge ``override`` onto a copy of ``base`` (override wins)."""
    result = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = copy.deepcopy(value)
    return result


def load_config(path: Optional[str] = None) -> Dict[str, Any]:
    """Load YAML config merged over built-in defaults.

    If ``path`` is given it must exist; otherwise the default ``config.yaml``
    next to the project root is used when present.
    """
    candidates = []
    if path:
        candidates.append(Path(path).expanduser())
    else:
        candidates.append(Path.cwd() / "config.yaml")
        candidates.append(Path(__file__).resolve().parent.parent / "config.yaml")

    for candidate in candidates:
        if candidate.is_file():
            with open(candidate, "r", encoding="utf-8") as fh:
                data = yaml.safe_load(fh) or {}
            if not isinstance(data, dict):
                raise ValueError(f"Config root must be a mapping, got {type(data).__name__}.")
            return deep_merge(DEFAULT_CONFIG, data)
        if path:  # explicitly requested but missing → fail loudly
            raise FileNotFoundError(f"Config file not found: {candidate}")
    return copy.deepcopy(DEFAULT_CONFIG)


def flatten_config(config: Dict[str, Any], prefix: str = "") -> list:
    """Flatten nested config into ``[(dotted_key, value), ...]`` for display."""
    items = []
    for key, value in config.items():
        dotted = f"{prefix}{key}"
        if isinstance(value, dict):
            items.extend(flatten_config(value, prefix=f"{dotted}."))
        else:
            items.append((dotted, value))
    return items


def human_bytes(num: float) -> str:
    """Format a byte count as a human-readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(num) < 1024.0:
            return f"{num:3.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} PB"


def truncate(text: str, length: int = 120, suffix: str = "...") -> str:
    """Truncate long text on a word boundary where possible."""
    if len(text) <= length:
        return text
    cut = text[:length].rsplit(" ", 1)[0]
    return (cut or text[:length]) + suffix
