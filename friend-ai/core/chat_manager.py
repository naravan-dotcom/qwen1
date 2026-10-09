"""Conversation history management for the FRIEND/CIPHER chatbot."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class ChatMessage:
    """A single message in the conversation."""

    role: str            # "system" | "user" | "assistant"
    content: str
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, str]:
        return {"role": self.role, "content": self.content}

    def formatted_time(self) -> str:
        return time.strftime("%H:%M:%S", time.localtime(self.timestamp))


class ChatManager:
    """Keeps the rolling conversation window and injects the system prompt.

    ``max_history`` bounds the number of *non-system* messages retained; when
    exceeded, the oldest user/assistant pairs are dropped first (the system
    prompt is always preserved).
    """

    def __init__(self, max_history: int = 50, system_prompt_enabled: bool = True):
        self.max_history: int = max(2, int(max_history))
        self.system_prompt_enabled: bool = system_prompt_enabled
        self._system_message: Optional[ChatMessage] = None
        self._history: List[ChatMessage] = []

    # ------------------------------------------------------------------ setup
    def set_system_prompt(self, prompt: str) -> None:
        """Install (or replace) the system prompt message."""
        if self.system_prompt_enabled and prompt:
            self._system_message = ChatMessage(role="system", content=prompt)
        else:
            self._system_message = None

    # ------------------------------------------------------------- mutations
    def add_user(self, content: str) -> ChatMessage:
        msg = ChatMessage(role="user", content=content)
        self._append(msg)
        return msg

    def add_assistant(self, content: str) -> ChatMessage:
        msg = ChatMessage(role="assistant", content=content)
        self._append(msg)
        return msg

    def _append(self, msg: ChatMessage) -> None:
        self._history.append(msg)
        self._trim()

    def clear(self) -> None:
        """Drop all user/assistant turns; keep the system prompt."""
        self._history.clear()

    # -------------------------------------------------------------- accessors
    @property
    def history(self) -> List[ChatMessage]:
        """Full visible history (user/assistant turns only)."""
        return list(self._history)

    def turn_count(self) -> int:
        """Number of completed user→assistant exchanges."""
        return sum(1 for m in self._history if m.role == "assistant")

    def build_messages(self) -> List[Dict[str, str]]:
        """Return the message list (dicts) to feed the chat template."""
        messages: List[Dict[str, str]] = []
        if self._system_message is not None:
            messages.append(self._system_message.to_dict())
        messages.extend(m.to_dict() for m in self._history)
        return messages

    # ----------------------------------------------------------------- private
    def _trim(self) -> None:
        """Enforce max_history by dropping the oldest non-system messages."""
        while len(self._history) > self.max_history:
            self._history.pop(0)
