# Feature: Tools (Shell / Git / Filesystem)

**Status:** ✅ Complete

## 1. What is this feature?

Tools are what let AshOS's agents actually *do* things in the real
world, instead of just producing text. Three ship by default: **Shell**
(run any command), **Git** (clone/commit/branch/merge/status/diff/log/push),
and **Fs** (read/write/list files). Every dangerous action (shell commands,
git pushes/resets) is gated through the Permission Manager, which can
block or prompt before anything destructive runs.

**Business value:** this is the difference between "an AI that talks
about code" and "an AI that writes the file, runs the tests, and commits
the change." Tools are also the safety layer — you decide up front which
dangerous command patterns require your explicit approval.

## 2. Who is this for?

- **Anyone letting AshOS actually modify their project**, not just chat
  about it — agents call tools internally when you run a goal.
- **Security-conscious users** who want a record and a gate on
  potentially destructive commands (`rm -rf`, `git push`, `git reset
  --hard`, `docker rm`, etc.) before they execute.

## 3. How to use it

You rarely call tools directly — agents call them on your behalf when
you run a goal (`ash run "..."`) or a workflow step (`"uses": "tool:git"`).
But you can check their health and see what's available:

**Check tool health:**
```bash
ash doctor
```
Reports whether `bash` and `git` binaries are reachable.

**See registered tools and their actions:**
```bash
curl http://localhost:4700/tools
```

**Use a tool directly in a workflow step** (see
`examples/workflows/research-and-build.json`):
```json
{ "id": "status", "uses": "tool:git", "action": "status", "params": {} }
```

**When a dangerous command comes up**, you'll be prompted to allow-once,
always-allow, or deny — decisions persist to `.ashos/permissions.json` so
you're not re-asked for the same pattern every time.

## 4. Example walkthrough

You ask AshOS to fix a bug and commit the result:

1. `ash run "fix the null-check bug in src/parser.ts and commit it"`
2. The Code agent uses the **Fs** tool to read/write the file.
3. The Testing agent uses the **Shell** tool to run `npm test` (this is
   also the Verification Gate firing — see that feature's doc).
4. The Git agent uses the **Git** tool to commit. Because `git commit` on
   its own isn't in the dangerous-pattern list, it runs without a
   prompt — but if the task ever tried `git push` or `git reset --hard`,
   you'd be asked first.

## 5. Tips & limitations

- **Fs** has no permission gate — its actions (read/write/list files) are
  treated as non-destructive by design.
- **Shell** and **Git** route every command through
  `PermissionManager.check()` — see `kernel/permission-manager.ts`'s
  regex list for exactly what triggers a prompt today: `rm -rf`, `git
  push`, `git reset --hard`, `docker rm/rmi/prune`, `shutdown`, `reboot`,
  `mkfs`, `chmod -R 777`, raw disk writes.
- There's no Docker tool or browser-automation tool yet (see
  `docs/roadmap.md`) — only shell/git/fs ship today. A plugin can add a
  new tool without any kernel changes (`docs/plugin-development.md`).
