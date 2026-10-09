"""Core package for the FRIEND/CIPHER chatbot engine and conversation logic."""

from core.chat_manager import ChatManager, ChatMessage
from core.persona import get_greeting, get_persona_name, get_system_prompt

__all__ = [
    "ChatManager",
    "ChatMessage",
    "get_greeting",
    "get_persona_name",
    "get_system_prompt",
]
