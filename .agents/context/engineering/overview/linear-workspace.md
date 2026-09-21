---
title: Linear workspace reference
summary: Team/project/milestone UUIDs for Batutô, the rule that UUIDs — never slugs — must be used when attaching issues, and the issue-state doctrine every agent follows while working a ticket
category: engineering
last_updated: 2026-09-20
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

## Issue states — move the ticket, don't just do the work

The board is how a human sees what is happening without reading a transcript. An agent that does a ticket's work without touching its state leaves the board lying, so **moving the ticket is part of the task, not paperwork around it**.

The split is clean: **an agent owns the states before a pull request exists, and the GitHub automation owns the ones after.**

### Yours to set

- **`In Progress`** — set it **immediately before starting**, not after finishing and not halfway through. If work has begun, the board says so. This applies to any ticket being worked, including one picked up mid-conversation.
- **`Todo`** — means "to be done very soon". Use it deliberately to stage what comes next: when a ticket is identified as the next thing to pick up, or when a newly created ticket unblocks something already in flight, move it out of `Backlog` so the board shows the short-term queue rather than one undifferentiated pile.
- **`Backlog`** — everything else. A new ticket lands here unless there is a reason to stage it.

A ticket that turns out to be blocked stays `In Progress` only if it is genuinely still being worked — otherwise say so and move it back, rather than leaving a stalled ticket looking active.

### The automation's, not yours

- **`In Review`** — set on pull-request open, within seconds of it.
- **`Done`** — set on merge into `dev`, which is also the staging deploy. So `Done` here means **deployed to staging**, not merely merged, and not "shipped to users" — there is no production branch yet (see [infra-and-envs.md](infra-and-envs.md)).

Never set these by hand, and **never report either from memory of your own last write** — re-read the issue. BAT-38 sat in `In Review` for a whole working session while being described as `In Progress`, because its own last known state was the one the agent had written rather than the one the automation had since applied.

## Conventions when creating issues

- Attach every new issue to **both** the project UUID and the correct milestone UUID from the table above — not just one.
- Prefer editing an issue's existing "Spec détaillée" native Linear document over creating a second one, if one already exists for that screen/topic (see `product/screen-doc-convention.md`).

## Prerequisite

These identifiers are only actionable if a Linear MCP connector is available in the current session. In Claude Code, this means the Linear MCP server must be configured for the session/project; in claude.ai it's the built-in Linear connector. If no Linear tool is available, say so rather than guessing at issue IDs or fabricating a URL.
