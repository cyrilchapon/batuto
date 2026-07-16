---
title: Engineering conventions
summary: Language rule (French for issues/chat, English everywhere else) and where domain-vs-permission logic must stay separated in code
category: engineering
last_updated: 2026-07-15
related:
  - domain/role-hierarchy.md
---

# Engineering conventions

## Language

- Linear issues and conversations with a human collaborator: French is acceptable.
- Everything else — code, code comments, variable/entity names, technical documents (specs, Linear documents other than issues), diagrams (Mermaid or otherwise): **English, always**.
- When in doubt about a given artifact: if it's neither a Linear issue nor a conversational exchange, it's English.

## Tooling

Biome for linting and formatting, monorepo-wide — a single tool and config, not a Prettier+ESLint split. Don't introduce a second formatter/linter for a sub-package "just this once."

## Domain logic vs. generic permissions — do not conflate

This is a recurring, easy-to-make mistake in this codebase specifically: the musical role hierarchy (`domain/role-hierarchy.md`) and the generic admin/member permission system (v1 scope) are **separate concerns with separate data shapes**. A conductor is not inherently an admin. An admin is not inherently a conductor. Do not model one in terms of the other, and do not build a single unified "permissions" table that tries to cover both — this was flagged early as a key learning from working through the domain model, and it remains an open design question exactly *how* the two coexist (see the open item in `domain/role-hierarchy.md`), not something to resolve unilaterally mid-implementation.

## Gig lifecycle stays thin

The event lifecycle (`domain/event-lifecycle.md`) must not grow quoting, invoicing, or CRM logic. The "Confirmed" checkpoint for gigs is deliberately a dumb manual flag — resist any change that tries to make it "a little smarter." See `product/scope.md` for the hard fence this maps to.

## Readiness/decision logic stays parameterized, not hardcoded

The three decision-mode templates (`domain/readiness-rules.md`) must remain configurable per band/per event-type/per event, resolved through the three-level cascade. Do not hardcode a single band's behavior as "the" behavior anywhere in the codebase, even temporarily for the first real band — the whole point of the cascade is that defaults are just pre-fills, never constraints.
