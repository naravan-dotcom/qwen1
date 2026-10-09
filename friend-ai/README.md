# FRIEND // CIPHER — CLI AI Chatbot

A production-quality, terminal-native AI chatbot powered by a local LLM running on
**llama.cpp** (C++ inference engine, wrapped via `llama-cpp-python`), with an optional
HuggingFace `transformers` backend. The AI embodies **CIPHER** — a cold, ego-driven,
zero-trust hacker from the underground **FRIEND** collective.

```
FRIEND COLLECTIVE // OPERATOR [CIPHER]
zero-trust protocol active
```

## Features

- **C++ ML engine:** `llama-cpp-python` for fast GGUF inference with GPU offloading (`n_gpu_layers`).
- **Optional HF backend:** `--backend hf` runs any HuggingFace instruct model via `transformers`.
- **Chat templates:** ChatML, Llama-3, and Qwen formats — correct persona injection per model family.
- **Streaming REPL:** token-by-token generation with a configurable character typing animation.
- **Rich UI:** ASCII banner, hacker color themes (green/cyan/red), panels, spinners, markdown rendering.
- **Config layering:** `config.yaml` defaults ← CLI flag overrides.
- **Slash commands:** `/help`, `/clear`, `/history`, `/config`, `/persona`, `/quit`.
- **Graceful interrupts:** Ctrl+C cancels generation; double Ctrl+C disconnects. No crashes.

## Project Structure

```
friend-ai/
├── main.py                  # Entry point, CLI setup (click)
├── config.yaml              # Default configuration
├── requirements.txt         # Python dependencies
├── README.md                # This file
├── core/
│   ├── __init__.py
│   ├── engine.py            # llama.cpp (llama-cpp-python) backend + streaming
│   ├── engine_hf.py         # HuggingFace transformers backend (optional)
│   ├── chat_manager.py      # Conversation history & context window
│   ├── chat_template.py     # ChatML / Llama / Qwen prompt formatting + stop strings
│   └── persona.py           # CIPHER system prompt, greeting, identity
├── ui/
│   ├── __init__.py
│   ├── terminal.py          # Rich UI: banner, typing animation, panels
│   └── themes.py            # Hacker color themes (#00FF41 / #00FFFF / #FF0040)
└── utils/
    ├── __init__.py
    ├── logger.py            # Rotating file logging (console stays clean)
    └── helpers.py           # Config loading/merging, formatting utilities
```

## Requirements

- Python **3.10+**
- A C compiler is needed only if `llama-cpp-python` has no wheel for your platform
  (it builds the llama.cpp C/C++ engine from source).

## Installation

```bash
cd friend-ai
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**GPU build (optional, much faster):**

```bash
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
# macOS Metal:
CMAKE_ARGS="-DGGML_METAL=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
```

## Downloading a Model (GGUF)

Default config expects `./models/model.gguf`. Grab any instruct GGUF, e.g.
**Qwen2.5-Coder-7B-Instruct-GGUF** (Q4_K_M recommended):

```bash
# Option A: huggingface_hub CLI
pip install -U "huggingface_hub[cli]"
hf download bartowski/Qwen2.5-Coder-7B-Instruct-GGUF \
    "qwen2.5-coder-7b-instruct-q4_k_m.gguf" \
    --local-dir ./models
mv ./models/qwen2.5-coder-7b-instruct-q4_k_m.gguf ./models/model.gguf

# Option B: wget direct link
wget -O ./models/model.gguf \
  "https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-Q4_K_M.gguf"
```

Set `chat_template: "qwen"` (or `"chatml"`) in `config.yaml` for Qwen models;
use `"llama"` for Llama-3 GGUFs.

## Running

```bash
# With defaults from config.yaml
python main.py

# Explicit model path
python main.py --model-path ./models/model.gguf

# Tune at the command line (flags override config.yaml)
python main.py --model-path ./models/model.gguf \
    --chat-template qwen --temperature 0.9 --max-tokens 512 \
    --n-gpu-layers 99 --typing-speed 0.01 --theme hacker
```

### Optional: HuggingFace backend

```bash
pip install transformers torch accelerate
python main.py --backend hf --model-path Qwen/Qwen2.5-Coder-7B-Instruct
```

(First run downloads weights from HuggingFace Hub.)

## In-Chat Commands

| Command     | Effect                                        |
|-------------|-----------------------------------------------|
| `/help`     | Show the command protocol list                |
| `/clear`    | Burn conversation history                     |
| `/history`  | Dump the decrypted log                        |
| `/config`   | Show active runtime configuration             |
| `/persona`  | Show the injected CIPHER system prompt        |
| `/quit` `/exit` | Sever the connection                      |
| Ctrl+C      | Cancel current generation; press twice to exit|

## Configuration Reference (`config.yaml`)

```yaml
model:
  path: "./models/model.gguf"
  n_ctx: 4096            # context window
  n_gpu_layers: -1       # -1 = all layers to GPU if available, 0 = CPU only
  n_threads: 4
  chat_template: "chatml"  # chatml | llama | qwen
generation:
  temperature: 0.8
  top_p: 0.9
  top_k: 40
  max_tokens: 1024
  repeat_penalty: 1.1
ui:
  typing_speed: 0.015    # seconds per character (0 = instant)
  theme: "hacker"        # hacker | crimson
  show_banner: true
chat:
  max_history: 50        # rolling message window (system prompt always kept)
  system_prompt_enabled: true
```

## Troubleshooting

- **`llama_cpp` import fails** → reinstall `llama-cpp-python` (needs a compiler if no wheel:
  install Visual Studio Build Tools on Windows or `build-essential` on Linux).
- **Model load crash / OOM** → use a smaller quantization (Q4_K_M or Q2_K), set
  `--n-gpu-layers 0` for CPU-only, or lower `n_ctx`.
- **Garbled output / template tokens visible** → match `chat_template` to your model family.
- **Logs** → runtime diagnostics are written to `logs/friend-ai.log` (the console stays clean).

---

*FRIEND collective | zero-trust protocol active. Don't ask who I am.*
