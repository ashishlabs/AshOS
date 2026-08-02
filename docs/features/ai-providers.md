# Feature: AI Providers

**Status:** ✅ Complete

## 1. What is this feature?

AshOS doesn't lock you into one AI vendor. It talks to five different AI
backends through one consistent interface — two cloud (Anthropic, OpenAI),
two local (Ollama, LM Studio), and one deterministic offline mock used for
testing and zero-setup evaluation. Every other feature in AshOS (chat,
planning, agents, research) is written against "the active provider," so
switching providers never requires touching any other code.

**Business value:** you're not paying for a cloud API key just to try
AshOS, you're not locked into one vendor's pricing/rate-limits/outages,
and you can run entirely offline/on your own hardware (local-first) for
privacy or cost reasons, escalating to a stronger cloud model only when
you choose to.

## 2. Who is this for?

- **Cost-conscious users** who want to run routine work on a free local
  model (Ollama/LM Studio) and only pay for cloud tokens when it matters.
- **Privacy-conscious users/teams** who don't want project data leaving
  their machine.
- **Anyone evaluating AshOS** — the default `mock` provider means you can
  run every command with zero API keys and zero setup.

## 3. How to use it

**See what's available and what's active:**
```bash
ash provider list
ash status          # shows the currently active provider
```

**Switch providers:**
```bash
ash provider set anthropic     # requires ANTHROPIC_API_KEY
ash provider set openai        # requires OPENAI_API_KEY
ash provider set ollama        # requires a local Ollama server + pulled model
ash provider set lmstudio      # requires a local LM Studio server
ash provider set mock          # default — no setup, deterministic, offline
```

**One-off override without changing config** (useful for scripts/CI):
```bash
ASHOS_PROVIDER=ollama ash run "summarize this repo"
```

**Configure via `.ashos/config.json`** (written by `ash init`/`ash provider set`,
or edit directly):
```json
{
  "provider": "lmstudio",
  "providers": {
    "lmstudio": { "baseUrl": "http://localhost:1234/v1", "model": "qwen/qwen2.5-coder-14b" }
  }
}
```

**Via REST API** (for integrating AshOS into another app):
```bash
curl http://localhost:4700/providers
```

## 4. Example walkthrough

You want to try AshOS without any API keys first, then move to a local
model once you're comfortable with it:

1. `ash init` — defaults to `mock`, works immediately.
2. `ash chat` — talk to it, see how planning/agents behave (responses are
   deterministic echoes, good for understanding the *flow*, not real answers).
3. Install LM Studio, load a model, note its exact model name.
4. `ash provider set lmstudio` and set `providers.lmstudio.model` in
   `.ashos/config.json` to that model name.
5. `ash doctor` — confirms the provider is reachable before you rely on it.
6. `ash run "write a function that validates an email address"` — now
   backed by a real local model.

## 5. Tips & limitations

- The `mock` provider gives structurally correct but content-free
  responses (it echoes your prompt) — good for testing the *pipeline*,
  not for real work.
- `lmstudio`'s model name is **never hardcoded** — you must set
  `providers.lmstudio.model` (or `LMSTUDIO_MODEL` env var) to whatever
  model is actually loaded in your LM Studio instance, or calls will
  fail with a clear "no model configured" error rather than silently
  guessing.
- `anthropic` has no embeddings endpoint — semantic memory search
  (`ash memory list` semantic recall) needs a provider that supports
  `embeddings()` (OpenAI, Ollama, LM Studio, or mock).
- See `docs/provider-guide.md` for how to add a brand-new provider (e.g. Groq, OpenRouter).
