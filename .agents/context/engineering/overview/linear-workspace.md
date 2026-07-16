---
title: Linear workspace reference
summary: Team/project/milestone UUIDs for Batutô, and the rule that UUIDs — never slugs — must be used when attaching issues to a project or milestone
category: engineering
last_updated: 2026-07-15
related:
  - product/scope.md
---

# Linear workspace reference

This is operational reference for any agent (chat or Claude Code) creating or updating Linear issues/documents for this project. It exists here, outside conversational memory, specifically so a Claude Code session — which has no access to prior chat history — doesn't have to rediscover these IDs or relearn the gotcha below the hard way.

## Critical rule: always pass UUIDs, never slugs

**When attaching an issue or document to a project or milestone, always pass the UUID, never the human-readable slug.** Passing the slug is silently ignored by Linear's API rather than erroring — the issue gets created but ends up orphaned (not actually attached to the project/milestone), and this is easy to miss until a later audit. This has happened before on this project. Always use the UUIDs below, not the `batuto-app`-style slug.

## Identifiers

| Entity | Value |
|---|---|
| Team | "Batutô" — ID `ab252724-5bd1-4416-8f4e-1053d1a41832`, key `BAT` |
| Project | "Batutô App" — **UUID `4c38011f-87ac-443e-9694-595728c415bb`** (slug `batuto-app` — do not use for attachment) |
| Milestone: Bootstrap | UUID `9cc3b861-fbca-4abb-9646-991840c9cdcd` (target: 2026-07-31) |
| Milestone: v0 — CORE | UUID `4d899ce5-1fd4-4865-ad70-ed5a123df9d9` (target: 2026-08-31) |
| Milestone: v1 — NICE TO HAVE | UUID `3c32b1d4-2cad-4fd9-bc13-cf4ebe54fedc` (target: 2026-10-31) |

If any of these IDs no longer resolve (e.g. a milestone was renamed or recreated), treat that as a signal to re-fetch and update this table via `knowledge-update`, not to guess a replacement.

## Conventions when creating issues

- Attach every new issue to **both** the project UUID and the correct milestone UUID from the table above — not just one.
- Prefer editing an issue's existing "Spec détaillée" native Linear document over creating a second one, if one already exists for that screen/topic (see `product/screen-doc-convention.md`).

## Prerequisite

These identifiers are only actionable if a Linear MCP connector is available in the current session. In Claude Code, this means the Linear MCP server must be configured for the session/project; in claude.ai it's the built-in Linear connector. If no Linear tool is available, say so rather than guessing at issue IDs or fabricating a URL.
