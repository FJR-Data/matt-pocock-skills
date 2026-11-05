---
"mattpocock-skills": patch
---

`setup-matt-pocock-skills` now offers a **GitHub (REST only)** issue tracker, whose template drives every operation through `gh api` REST calls with the repo named explicitly. Setup proposes it when `gh` can't reach GitHub's GraphQL API: Claude Code cloud sessions refuse GraphQL with HTTP 403, which breaks `gh issue`, `gh pr`, `gh repo view` and `gh label`. Re-run `/setup-matt-pocock-skills` in a repo you use from cloud sessions to switch.
