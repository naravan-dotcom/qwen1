"""Logging setup — quiet console, optional rotating debug file."""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_configured = False


def setup_logging(level: int = logging.INFO, log_file: str | os.PathLike | None = None) -> None:
    """Configure root logging once. Console stays minimal; details go to file."""
    global _configured
    if _configured:
        return

    root = logging.getLogger()
    root.setLevel(level)

    # Keep stdout clean for the rich UI — logs go to a file by default.
    if log_file is None:
        log_file = Path(__file__).resolve().parent.parent / "logs" / "friend-ai.log"
    log_path = Path(log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        log_path, maxBytes=1_000_000, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(_LOG_FORMAT))
    root.addHandler(file_handler)

    # Null handler so "no handlers" warnings never leak to the terminal.
    root.addHandler(logging.NullHandler())
    _configured = True


def get_logger(name: str) -> logging.Logger:
    """Return a namespaced logger, ensuring logging has been initialized."""
    setup_logging()
    return logging.getLogger(name if name.startswith("friend") else f"friend.{name}")
