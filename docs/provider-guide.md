# Provider Guide

AshOS ships four providers out of the box, all implementing the same
`AIProvider` interface (`providers/types.ts`):

| Provider | Backend | Notes |
|---|---|---|
| `mock` | none (deterministic, offline) | Default provider. Used in tests and for zero-setup evaluation. |
| `anthropic` | Anthropic Messages API | Requires `ANTHROPIC_API_KEY`. No embeddings endpoint. |
| `openai` | OpenAI Chat Completions + Embeddings API | Requires `OPENAI_API_KEY`. |
| `ollama` | Local Ollama server | Requires `OLLAMA_BASE_URL` (default `http://localhost:11434`) and a pulled model. Also compatible with LM Studio's Ollama-style API. |

## Switching providers

Via CLI:

```
ash provider list
ash provider set anthropic
```

Via env var (overrides config on process start):

```
ASHOS_PROVIDER=ollama ash run "..."
```

Via `.ashos/config.json` (written by `ash init` / `ash provider set`):

```json
{ "provider": "openai", "providers": { "openai": { "apiKey": "...", "model": "gpt-4o-mini" } } }
```

No planner, agent, tool, or workflow code references a concrete provider
class — everything goes through `ProviderRegistry.active()`.

## Adding a new provider

1. Implement `AIProvider` in a new file (see `providers/ollama-provider.ts`
   for a minimal example using raw `fetch`, no SDK dependency).
2. Register it either directly in `providers/registry.ts` (for a provider
   that ships with core) or via a plugin's `host.providers.registerFactory`
   (for a provider shipped as a plugin — e.g. Groq, OpenRouter, LM Studio).
3. Add a `providers/<name>.test.ts` covering `chat()` at minimum.

Groq, OpenRouter, and local GGUF runners are natural next providers and
fit this same pattern (see `docs/roadmap.md`).
