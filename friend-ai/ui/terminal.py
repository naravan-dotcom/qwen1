"""Rich-based terminal UI: banner, streaming typing animation, panels, prompts."""

from __future__ import annotations

import time
from typing import Iterable, List, Optional

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.text import Text

from ui.themes import Theme, get_theme

# --------------------------------------------------------------------- banner
BANNER_ART = r"""
  _______  _______  ___   _  _______  ___      ___   ______   _______ 
 |       ||       ||   | | ||       ||   |    /   | /      | |       |
 |   _   ||   _   ||   |_| ||    ___||   |   / /| ||  ,    ||   _   |
 |  | |  ||  | |  ||      ||   |___ |   |  / ___ ||  |     ||  | |  |
 |  |_|  ||  |_|  ||  _    ||    ___)|  _|_/ /  | ||  |_   ||  |_|  |
 |       ||       || | |   ||   |___ |   |  /   | ||       ||       |
 |_______||_______||__|  |__|_______||___| /____|_||_____|__|_______|
        _____ ___ ____  ____  _____ _    _  _____ _______ ____  _   _ 
       / ____|_ _/ ___||  _ \|  ___| |  | |/ ____|__   __/ __ \| \ | |
      | (___  | \___ \| |_) | |_  | |  | | (___    | | | |  | |  \| |
       \___ \ | | ___) |  _ <|  _| | |  | |\___ \   | | | |  | | . ` |
       ____) || |___ /| |_) | |_| | |__| |____) |  | | | |__| | |\  |
      |_____/___|_____|____/|____/ \____/|_____/   |_|  \____/|_| \_|
"""


class TerminalUI:
    """All terminal presentation concerns live here."""

    def __init__(self, theme: Optional[Theme] = None, typing_speed: float = 0.015):
        self.theme = theme or get_theme("hacker")
        self.typing_speed = max(0.0, float(typing_speed))
        self.console = Console(highlight=False, soft_wrap=False)

    # --------------------------------------------------------------- display
    def show_banner(self, persona_name: str = "CIPHER") -> None:
        self.console.print(Text(BANNER_ART, style=f"bold {self.theme.banner}"))
        self.console.print(
            Panel(
                Text.assemble(
                    ("SECURE CHANNEL :: ", f"bold {self.theme.secondary}"),
                    (f"FRIEND COLLECTIVE // OPERATOR [{persona_name}]",
                     f"bold {self.theme.primary}"),
                ),
                border_style=self.theme.panel_border,
                padding=(0, 2),
            )
        )

    def show_greeting(self, greeting: str, persona_name: str) -> None:
        tag = Text(f"[{persona_name}]: ", style=f"bold {self.theme.ai_tag}")
        body = Text(greeting, style=self.theme.primary)
        self.console.print(Panel(tag + body, border_style=self.theme.panel_border,
                                 title="INCOMING TRANSMISSION",
                                 title_align="left"))

    def system_message(self, message: str) -> None:
        """Dim italic system notice."""
        self.console.print(Text(f"  » {message}", style=f"italic {self.theme.dim}"))

    def user_input_prompt(self) -> Optional[str]:
        """Prompt for user input; returns None on EOF. KeyboardInterrupt bubbles up."""
        try:
            self.console.print(Text("[YOU]: ", style=f"bold {self.theme.user_tag}"), end="")
            return input()
        except EOFError:
            return None

    # -------------------------------------------------------------- streaming
    def stream_response(self, chunks: Iterable[str], persona_name: str,
                        render_markdown: bool = True) -> str:
        """Consume token chunks with a char-by-char typing animation.

        Returns the full accumulated text. Honors Ctrl+C by draining early —
        the caller catches KeyboardInterrupt around this method.
        """
        tag_style = f"bold {self.theme.ai_tag}"
        body_style = self.theme.primary
        self.console.print(Text(f"[{persona_name}]: ", style=tag_style), end="")

        collected: List[str] = []
        line_buf = Text()

        for chunk in chunks:
            collected.append(chunk)
            for ch in chunk:
                if ch == "\n":
                    self.console.print(line_buf)
                    line_buf = Text()
                else:
                    line_buf.append(ch, style=body_style)
                if self.typing_speed:
                    time.sleep(self.typing_speed)
        if line_buf:
            self.console.print(line_buf)
        full_text = "".join(collected)
        self.console.print()  # breathing room after the response

        if render_markdown and ("```" in full_text or "**" in full_text):
            self.console.print(Markdown(full_text), style=body_style)
            self.console.print()
        return full_text

    # ----------------------------------------------------------------- errors
    def show_error(self, title: str, message: str) -> None:
        self.console.print(
            Panel(
                Text(message, style=self.theme.error),
                title=f"[bold]{title}[/bold]",
                title_align="left",
                border_style=self.theme.error,
            )
        )

    def show_warning(self, message: str) -> None:
        self.console.print(Text(f"  ! {message}", style=f"bold {self.theme.warning}"))

    # ---------------------------------------------------------------- tables
    def show_history(self, messages, persona_name: str) -> None:
        if not messages:
            self.system_message("No transmissions on record. Channel is clean.")
            return
        lines: List[Text] = []
        for msg in messages:
            if msg.role == "user":
                who = Text(f"[YOU] {msg.formatted_time()} ▸ ",
                           style=f"bold {self.theme.user_tag}")
                body = Text(msg.content, style="white")
            else:
                who = Text(f"[{persona_name}] {msg.formatted_time()} ▸ ",
                           style=f"bold {self.theme.ai_tag}")
                body = Text(msg.content, style=self.theme.primary)
            lines.append(who + body)
        self.console.print(
            Panel(Text("\n\n").join(lines) if lines else Text(""),
                  title="DECRYPTED LOG", title_align="left",
                  border_style=self.theme.secondary)
        )

    def show_config(self, config: dict) -> None:
        from utils.helpers import flatten_config
        rows = flatten_config(config)
        table_lines = [
            Text.assemble(
                (f"{key:<28}", self.theme.secondary),
                ("=", self.theme.dim),
                (f" {value}", self.theme.primary),
            )
            for key, value in rows
        ]
        body = Text("\n").join(table_lines)
        self.console.print(Panel(body, title="RUNTIME CONFIG", title_align="left",
                                 border_style=self.theme.secondary))

    def show_persona(self, prompt: str, persona_name: str) -> None:
        preview = prompt if len(prompt) <= 2000 else prompt[:2000] + "\n... [truncated]"
        self.console.print(
            Panel(
                Text(preview, style=self.theme.dim),
                title=f"ACTIVE PERSONA MATRIX :: {persona_name}",
                title_align="left",
                border_style=self.theme.panel_border,
            )
        )

    def show_help(self, commands: List[tuple]) -> None:
        lines = [
            Text.assemble((cmd.ljust(12), f"bold {self.theme.secondary}"),
                          ("— ", self.theme.dim), (desc, self.theme.primary))
            for cmd, desc in commands
        ]
        self.console.print(Panel(Text("\n").join(lines), title="COMMAND PROTOCOL",
                                 title_align="left", border_style=self.theme.secondary))

    def farewell(self, persona_name: str) -> None:
        self.console.print(
            Text(f"\n[{persona_name}]: ", style=f"bold {self.theme.ai_tag}")
            + Text("Channel burned. Don't leave traces.", style=self.theme.dim)
        )
