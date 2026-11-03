# Issue tracker: GitHub (REST via `gh api`)

Issues and specs for this repo live as GitHub issues on `FJR-Data/matt-pocock-skills`. Drive every operation through `gh api` against the REST endpoints below.

Don't use `gh issue`, `gh pr`, or `gh repo view`: they go through GitHub's GraphQL API, which Claude Code cloud sessions refuse with HTTP 403. `gh api` REST calls work in cloud sessions and locally alike.

Every command names the repo explicitly. This repo is a fork of `mattpocock/skills`: never file into the upstream.

Write multi-line bodies to a temp file outside the repo and pass it with `-F body=@<file>`.

## Conventions

- **Check the repo**: `gh api repos/FJR-Data/matt-pocock-skills --jq '{full_name, has_issues}'`. `has_issues` must be `true` before the first write of a session.
- **Create an issue**: `gh api repos/FJR-Data/matt-pocock-skills/issues -f title="..." -F body=@<file> -f 'labels[]=<label>'`. Repeat `-f 'labels[]=...'` per label. The response's `.number` is the issue number and `.id` its database id.
- **Read an issue**: `gh api repos/FJR-Data/matt-pocock-skills/issues/<n> --jq '{number, title, body, state, labels: [.labels[].name]}'`, then `gh api repos/FJR-Data/matt-pocock-skills/issues/<n>/comments --jq '[.[].body]'`.
- **List issues**: `gh api --paginate 'repos/FJR-Data/matt-pocock-skills/issues?state=open&per_page=100' --jq '.[] | select(.pull_request | not) | {number, title, labels: [.labels[].name]}'`. Add `&labels=<label>` to filter. The endpoint also returns PRs; the `select` drops them.
- **Edit an issue body**: `gh api -X PATCH repos/FJR-Data/matt-pocock-skills/issues/<n> -F body=@<file>`.
- **Make an issue a sub-issue of a parent**: `gh api -X POST repos/FJR-Data/matt-pocock-skills/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`, where `<child-db-id>` is the child's numeric database id (`gh api repos/FJR-Data/matt-pocock-skills/issues/<n> --jq .id`), not its `#number`. List a parent's children with `gh api 'repos/FJR-Data/matt-pocock-skills/issues/<parent>/sub_issues?per_page=100'`. Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh api -X POST repos/FJR-Data/matt-pocock-skills/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` (database id, as above). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Count open blockers**: `gh api repos/FJR-Data/matt-pocock-skills/issues/<n> --jq .issue_dependencies_summary.blocked_by` (open blockers only; 0 means startable).
- **Comment on an issue**: `gh api repos/FJR-Data/matt-pocock-skills/issues/<n>/comments -F body=@<file>`.
- **Apply / remove labels**: `gh api repos/FJR-Data/matt-pocock-skills/issues/<n>/labels -f 'labels[]=<label>'` / `gh api -X DELETE repos/FJR-Data/matt-pocock-skills/issues/<n>/labels/<label>` (URL-encode the label, e.g. `wayfinder%3Amap`).
- **Create a label**: check with `gh api repos/FJR-Data/matt-pocock-skills/labels/<label>` (404 means missing), then `gh api repos/FJR-Data/matt-pocock-skills/labels -f name=<label> -f color=<hex-without-#>`.
- **Close**: post the explanation as a comment, then `gh api -X PATCH repos/FJR-Data/matt-pocock-skills/issues/<n> -f state=closed -f state_reason=completed` (`not_planned` for rejections).

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues. PRs share the issue endpoints for comments and labels:

- **Read a PR**: `gh api repos/FJR-Data/matt-pocock-skills/pulls/<n> --jq '{number, title, body, state, author: .user.login}'`, its comments as in **Read an issue**, and its diff with `gh api repos/FJR-Data/matt-pocock-skills/pulls/<n> -H 'Accept: application/vnd.github.diff'`.
- **List external PRs for triage**: `gh api --paginate 'repos/FJR-Data/matt-pocock-skills/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label**: the issue commands above, with the PR number.
- **Close**: `gh api -X PATCH repos/FJR-Data/matt-pocock-skills/pulls/<n> -f state=closed`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: `gh api repos/FJR-Data/matt-pocock-skills/issues/42` answers for both, and a `pull_request` key in the response marks a PR.

## When a skill says "publish to the issue tracker"

Create a GitHub issue, as in **Create an issue** above.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets. Create each `wayfinder:*` label once if it's missing (see **Create a label**).

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create it as in **Create an issue** with `-f 'labels[]=wayfinder:map'`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see **Blocking** under Conventions.
- **Frontier query**: `gh api 'repos/FJR-Data/matt-pocock-skills/issues/<map>/sub_issues?per_page=100' --jq '.[] | select(.state == "open" and (.assignees | length) == 0) | .number'`, in map order; drop any with an open blocker (see **Count open blockers**, or an open issue in the `Blocked by` line). First remaining wins.
- **Claim**: `gh api repos/FJR-Data/matt-pocock-skills/issues/<n>/assignees -f 'assignees[]=<login>'`, the session's first write. REST has no `@me`: get the login with `gh api user --jq .login`.
- **Resolve**: comment the answer (see **Comment on an issue**), close the ticket (see **Close**), then append a context pointer (gist + link) to the map's Decisions-so-far via **Edit an issue body**.
