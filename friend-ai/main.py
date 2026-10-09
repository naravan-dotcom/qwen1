#!/usr/bin/env python3
"""FRIEND // CIPHER — CLI AI chatbot entry point.

Usage:
    python main.py --model-path ./models/model.gguf
    python main.py --backend hf --model-path Qwen/Qwen2.5-Coder-7B-Instruct
"""

from __future__ import annotations

import sys

import click
from rich.console import Console
from rich.live import Live
from rich.spinner import Spinner
from rich.text import Text

from core.chat_manager import ChatManager
from core.persona import get_greeting, get_persona_name, get_system_prompt
from ui.terminal import TerminalUI
from ui.themes import get_theme
from utils.helpers import load_config
from utils.logger import get_logger

logger = get_logger("friend.main")

COMMANDS = [
    ("/help", "Show this command list."),
    ("/clear", "Wipe conversation history (burn the logs)."),
    ("/history", "Dump the decrypted conversation log."),
    ("/config", "Show the active runtime configuration."),
    ("/persona", "Show the injected system prompt / persona matrix."),
    ("/quit | /exit", "Sever the connection."),
]

LOAD_STAGES = [
    "Initializing neural link...",
    "Loading model weights...",
    "Establishing secure channel...",
]


def load_engine_with_spinner(ui: TerminalUI, engine):
    """Run engine.load() behind a styled hacker-themed spinner sequence."""
    console = ui.console
    stage_idx = 0

    def frame():
        nonlocal stage_idx
        label = LOAD_STAGES[min(stage_idx, len(LOAD_STAGES) - 1)]
        return Text.assemble(
            (f"  ⟳ {label}", f"bold {ui.theme.spinner}"),
        )

    # Advance the stage labels on a simple counter while loading happens in-line.
    with Live(frame(), console=console, refresh_per_second=10, transient=True) as live:
        def tick():
            nonlocal stage_idx
            stage_idx += 1
            live.update(frame())

        import threading
        stop = threading.Event()

        def ticker():
            while not stop.wait(0.8):
                tick()

        t = threading.Thread(target=ticker, daemon=True)
        t.start()
        try:
            engine.load()
        finally:
            stop.set()
            t.join(timeout=1.0)


class ChatSession:
    """REPL loop wiring engine ↔ chat manager ↔ UI."""

    def __init__(self, engine, chat: ChatManager, ui: TerminalUI, config: dict):
        self.engine = engine
        self.chat = chat
        self.ui = ui
        self.config = config
        self.gen_params = dict(config.get("generation", {}))
        self.persona = get_persona_name()

    # ------------------------------------------------------------------ loop
    def run(self) -> int:
        ui = self.ui
        if ui.theme and self.config.get("ui", {}).get("show_banner", True):
            ui.show_banner(self.persona)
        greeting = get_greeting()
        ui.show_greeting(greeting, self.persona)
        self.chat.add_assistant(greeting)

        interrupted_once = False
        while True:
            try:
                raw = ui.user_input_prompt()
            except KeyboardInterrupt:
                ui.console.print()
                if interrupted_once:
                    ui.system_message("Double interrupt detected. Disconnecting.")
                    return self._shutdown(0)
                interrupted_once = True
                ui.system_message("Ctrl+C again within a session to disconnect. "
                                  "Or type /quit.")
                continue

            if raw is None:  # EOF (Ctrl+D)
                return self._shutdown(0)

            text = raw.strip()
            if not text:
                continue
            interrupted_once = False

            if text.startswith("/"):
                code = self.handle_command(text)
                if code is not None:
                    return self._shutdown(code)
                continue

            self.respond(text)

    # ------------------------------------------------------------- responses
    def respond(self, user_text: str) -> None:
        self.chat.add_user(user_text)
        messages = self.chat.build_messages()
        try:
            stream = self.engine.stream_chat(messages, **self.gen_params)
            reply = self.ui.stream_response(stream, self.persona)
        except KeyboardInterrupt:
            self.ui.console.print()
            self.ui.system_message("Generation aborted mid-stream. Payload truncated.")
            return
        except Exception as exc:  # inference-time failures shouldn't kill the REPL
            logger.exception("Generation failed")
            self.ui.show_error("CONNECTION DISRUPTED", f"{exc}")
            return

        if reply:
            self.chat.add_assistant(reply)

    # -------------------------------------------------------------- commands
    def handle_command(self, text: str):
        """Return an exit code, or None to keep looping."""
        cmd, _, arg = text.partition(" ")
        cmd = cmd.lower()
        ui = self.ui

        if cmd in ("/quit", "/exit"):
            ui.farewell(self.persona)
            return 0
        if cmd == "/clear":
            self.chat.clear()
            ui.system_message("Logs burned. Memory wiped. We never spoke.")
            return None
        if cmd == "/history":
            ui.show_history(self.chat.history, self.persona)
            return None
        if cmd == "/config":
            ui.show_config(self.config)
            return None
        if cmd == "/persona":
            ui.show_persona(get_system_prompt(), self.persona)
            return None
        if cmd == "/help":
            ui.show_help(COMMANDS)
            return None

        ui.show_warning(f"Unknown command '{cmd}'. Type /help for the protocol list.")
        return None

    def _shutdown(self, code: int) -> int:
        try:
            self.engine.close()
        except Exception:
            pass
        return code


# ---------------------------------------------------------------------- CLI
@click.command(context_settings={"help_option_names": ["-h", "--help"]})
@click.option("--model-path", "model_path", default=None,
              help="Path to a GGUF model file (llama backend) or HF model id (hf backend).")
@click.option("--backend", type=click.Choice(["llama", "hf"], case_sensitive=False),
              default=None, help="Inference backend: llama (llama.cpp) or hf (transformers).")
@click.option("--config", "config_path", default=None, help="Path to config.yaml.")
@click.option("--chat-template", type=click.Choice(["chatml", "llama", "qwen"],
              case_sensitive=False), default=None, help="Chat template for the model.")
@click.option("--temperature", type=float, default=None, help="Sampling temperature.")
@click.option("--top-p", type=float, default=None, help="Nucleus sampling top_p.")
@click.option("--top-k", type=int, default=None, help="Top-k sampling.")
@click.option("--max-tokens", type=int, default=None, help="Max tokens per response.")
@click.option("--repeat-penalty", type=float, default=None, help="Repetition penalty.")
@click.option("--n-gpu-layers", type=int, default=None,
              help="Layers offloaded to GPU (-1 = all, 0 = CPU only).")
@click.option("--n-ctx", type=int, default=None, help="Context window size.")
@click.option("--typing-speed", type=float, default=None,
              help="Seconds per character in the typing animation (0 = instant).")
@click.option("--theme", type=click.Choice(["hacker", "crimson"], case_sensitive=False),
              default=None, help="UI color theme.")
@click.option("--no-banner", is_flag=True, default=False, help="Skip the startup banner.")
def cli(model_path, backend, config_path, chat_template, temperature, top_p, top_k,
        max_tokens, repeat_penalty, n_gpu_layers, n_ctx, typing_speed, theme, no_banner):
    """FRIEND // CIPHER — zero-trust terminal chat operator."""
    # 1. Config: YAML defaults ← CLI overrides
    try:
        config = load_config(config_path)
    except Exception as exc:
        Console(stderr=True).print(f"[red]Config load failed:[/red] {exc}")
        sys.exit(1)

    m, g, u, c = (config.setdefault(k, {}) for k in ("model", "generation", "ui", "chat"))
    if model_path:
        m["path"] = model_path
    if chat_template:
        m["chat_template"] = chat_template.lower()
    if n_gpu_layers is not None:
        m["n_gpu_layers"] = n_gpu_layers
    if n_ctx is not None:
        m["n_ctx"] = n_ctx
    for key, val in (("temperature", temperature), ("top_p", top_p), ("top_k", top_k),
                     ("max_tokens", max_tokens), ("repeat_penalty", repeat_penalty)):
        if val is not None:
            g[key] = val
    if typing_speed is not None:
        u["typing_speed"] = typing_speed
    if theme:
        u["theme"] = theme.lower()
    if no_banner:
        u["show_banner"] = False
    backend = (backend or "llama").lower()

    # 2. UI
    ui = TerminalUI(theme=get_theme(u.get("theme", "hacker")),
                    typing_speed=u.get("typing_speed", 0.015))

    # 3. Engine
    if backend == "hf":
        from core.engine_hf import HFEngine
        engine = HFEngine(
            model_id=m["path"],
            chat_template=m.get("chat_template", "chatml"),
        )
    else:
        from core.engine import LlamaEngine
        engine = LlamaEngine(
            model_path=m["path"],
            n_ctx=m.get("n_ctx", 4096),
            n_gpu_layers=m.get("n_gpu_layers", -1),
            n_threads=m.get("n_threads", 4),
            chat_template=m.get("chat_template", "chatml"),
        )

    try:
        load_engine_with_spinner(ui, engine)
    except Exception as exc:
        ui.show_error("FATAL: Model load failed", str(exc))
        ui.system_message("Check --model-path and that your dependency for "
                          f"the '{backend}' backend is installed.")
        sys.exit(1)

    # 4. Chat manager + persona injection
    chat = ChatManager(max_history=c.get("max_history", 50),
                       system_prompt_enabled=c.get("system_prompt_enabled", True))
    chat.set_system_prompt(get_system_prompt())

    # 5. REPL
    session = ChatSession(engine=engine, chat=chat, ui=ui, config=config)
    try:
        sys.exit(session.run())
    except KeyboardInterrupt:
        ui.console.print()
        ui.system_message("Signal received. Channel closed.")
        sys.exit(130)


if __name__ == "__main__":
    cli()
