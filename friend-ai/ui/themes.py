"""Color themes for the FRIEND/CIPHER terminal UI.

Hacker aesthetic: green/cyan/red on a dark terminal background.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Theme:
    """A named set of rich-compatible color styles."""

    name: str
    primary: str        # main accent (matrix green)
    secondary: str      # cyan accent
    error: str          # alerts / failures (red)
    warning: str        # cautions (amber)
    dim: str            # system/quiet text
    user_tag: str       # [YOU]: prompt color
    ai_tag: str         # [CIPHER]: response color
    banner: str         # ASCII art color
    panel_border: str   # panel outlines
    spinner: str        # loading spinner color


HACKER_THEME = Theme(
    name="hacker",
    primary="#00FF41",
    secondary="#00FFFF",
    error="#FF0040",
    warning="#FFB000",
    dim="grey58",
    user_tag="#00FFFF",
    ai_tag="#00FF41",
    banner="#00FF41",
    panel_border="#00FF41",
    spinner="#00FFFF",
)

# Alternative: red-team variant, still dark-terminal friendly.
CRIMSON_THEME = Theme(
    name="crimson",
    primary="#FF0040",
    secondary="#FF7B00",
    error="#FF0040",
    warning="#FFB000",
    dim="grey58",
    user_tag="#00FFFF",
    ai_tag="#FF0040",
    banner="#FF0040",
    panel_border="#FF0040",
    spinner="#FF7B00",
)

THEMES = {
    "hacker": HACKER_THEME,
    "crimson": CRIMSON_THEME,
}


def get_theme(name: str) -> Theme:
    """Return a theme by name, falling back to the default hacker theme."""
    return THEMES.get((name or "hacker").lower(), HACKER_THEME)
