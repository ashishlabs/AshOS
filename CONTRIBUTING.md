# Contributing to AshOS

AshOS is built to be modular and plugin-based — most new capabilities
(providers, tools, agents) should ship as additions to their respective
package or as a plugin under `plugins/`, not as changes to `kernel/`.

## Getting started

```
npm install
cp .env.example .env
npm run typecheck
npm test
npm run cli -- status
```

## Development workflow

1. Pick up an item from `docs/roadmap.md` or open an issue.
2. Add or extend a provider/tool/agent/plugin following `docs/plugin-development.md` and `docs/provider-guide.md`.
3. Write tests alongside the code (`*.test.ts` next to the source file); run `npm test`.
4. Run `npm run typecheck` before opening a PR.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Code style

- TypeScript, strict mode. No `any` unless justified with a comment.
- Prefer composition over inheritance; `BaseAgent` is the one exception, kept for the shared event-emitting boilerplate.
- Every `Tool` implementation must declare accurate `capabilities()`, `requirements()`, `permissions()`, and a working `healthCheck()`.
- Anything that shells out to a destructive command must go through `PermissionManager`.

## Reporting issues

Open a GitHub issue with reproduction steps. For security issues, please
avoid filing a public issue with exploit details — describe the class of
issue and we'll follow up privately.
