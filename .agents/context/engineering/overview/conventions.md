---
title: Engineering conventions
summary: Language rule (French for issues/chat, English everywhere else), where domain-vs-permission logic must stay separated, and the principle that scoping keys travel through relations so invalid states cannot be stored
category: engineering
last_updated: 2026-09-20
related:
  - domain/role-hierarchy.md
  - engineering/overview/quality-gates.md
  - engineering/modules/data-model.md
---

# Engineering conventions

## Language

- Linear issues and conversations with a human collaborator: French is acceptable.
- Everything else — code, code comments, variable/entity names, technical documents (specs, Linear documents other than issues), diagrams (Mermaid or otherwise): **English, always**.
- When in doubt about a given artifact: if it's neither a Linear issue nor a conversational exchange, it's English.

## Tooling

Biome for linting and formatting, monorepo-wide — a single tool and config, not a Prettier+ESLint split. Don't introduce a second formatter/linter for a sub-package "just this once." Before finishing any non-trivial change, run the relevant `check:*` scripts (and `yarn fix` for anything auto-fixable) — see `quality-gates.md` for what each `check:*`/`fix:*` script does, why there's no single aggregate `check` command, and why checks are invoked via `turbo` directly rather than a yarn wrapper.

## Scoping keys travel through relations — integrity over normalization

When a row references two things that must belong to the same parent, **make that structurally impossible to get wrong, rather than merely expected of callers**. Carry the parent's key on the child and route every foreign key through that one column, so the pair `(child_id, parent_id)` is what the database checks. An invalid combination then cannot be stored at all — not by a buggy handler, not by a migration script, not by someone at a `psql` prompt.

This trades a normalized schema for a correct one, deliberately. The duplicated key column looks redundant on a diagram, and it is the point: without it the constraint has nowhere to live, and "these two agree on their parent" degrades into a convention that holds only as long as every caller remembers it. Correct referential integrity is arguably *part* of advanced normalization rather than a departure from it — the redundancy is derivable and constrained, not free-floating.

**The rule, stated generally:** any entity referencing two or more things that must share a scope carries that scope's key once, and every relation composes with it. Never enforce the agreement in application code when a composite key can enforce it in the schema.

Band scoping is the instance that exists today — `MemberInstrument` carries `bandId`, and its membership, pupitre and validator relations all route through it, so no row can pair a member of one band with another band's section (see [data-model.md](../modules/data-model.md)). It will not be the last: anything scoped to an event, a season, or a future tenant-like concept gets the same treatment. Layer 2 already has two candidates in `AvailabilityResponse` and `PupitreAssignment`.

Two honest caveats, so this is applied with judgement rather than reflex:

- **It is not free.** Expect an extra column, wider indexes, and ORM friction — the parent key is written through a relation rather than set directly, and some client operations have to be expressed differently. Pay it where a cross-scope reference would be a real bug, not on every relation that happens to share an ancestor.
- **Some invariants still will not fit**, because they are conditional, or span rows, or the tooling cannot express them. Those fall back to a CHECK constraint, or to application code — but only after a composite key has been genuinely ruled out, and with a test standing in for the constraint that could not exist.

## Domain logic vs. generic permissions — do not conflate

This is a recurring, easy-to-make mistake in this codebase specifically: the musical role hierarchy (`domain/role-hierarchy.md`) and the generic admin/member permission system (v1 scope) are **separate concerns with separate data shapes**. A conductor is not inherently an admin. An admin is not inherently a conductor. Do not model one in terms of the other, and do not build a single unified "permissions" table that tries to cover both — this was flagged early as a key learning from working through the domain model, and it remains an open design question exactly *how* the two coexist (see the open item in `domain/role-hierarchy.md`), not something to resolve unilaterally mid-implementation.

## Gig lifecycle stays thin

The event lifecycle (`domain/event-lifecycle.md`) must not grow quoting, invoicing, or CRM logic. The "Confirmed" checkpoint for gigs is deliberately a dumb manual flag — resist any change that tries to make it "a little smarter." See `product/scope.md` for the hard fence this maps to.

## Readiness/decision logic stays parameterized, not hardcoded

The three decision-mode templates (`domain/readiness-rules.md`) must remain configurable per band/per event-type/per event, resolved through the three-level cascade. Do not hardcode a single band's behavior as "the" behavior anywhere in the codebase, even temporarily for the first real band — the whole point of the cascade is that defaults are just pre-fills, never constraints.
