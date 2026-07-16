---
title: Data modeling convention
summary: The data-model-diagram skill is agnostic — feed it Batutô's domain docs and current schema explicitly, and treat the Linear "Data model" document as the output's source of truth, not a local file
category: product
last_updated: 2026-07-15
related:
  - domain/multi-band.md
  - domain/role-hierarchy.md
  - domain/readiness-rules.md
  - domain/event-lifecycle.md
  - meta/skills-provenance.md
---

# Data modeling convention

Batutô's data model (entities, relationships, ER diagrams) is designed and evolved using the `data-model-diagram:data-model-diagram` skill — installed via the `skills` CLI (see `meta/skills-provenance.md`) and, like the screen-drafting skills, published as a generic tool. It knows how to run a modeling conversation and produce a Mermaid ER diagram from whatever entities/relationships/decisions it's given — it knows nothing about Batutô specifically. This document is the wiring that fills that gap.

## What to feed the skill

Before or while using this skill for Batutô, supply it with the actual domain constraints — don't let it default to a generic CRUD shape:

- **The current schema**, from the Linear project document ["Data model — v0 CORE (Layer 1 + Layer 2)"](https://linear.app/cyc-personal/document/data-model-v0-core-layer-1-layer-2-9f90bb8097c7) — this is the canonical source of truth for what's already modeled (Layer 1: identity & band membership; Layer 2: event loop). Don't start a modeling pass from a blank slate if this document already covers the entity in question.
- **The relevant domain docs**, as the actual constraints the diagram must respect, not just inspiration:
  - `domain/multi-band.md` — every core entity is band-scoped via an explicit `Membership` pivot, never directly off `User`.
  - `domain/role-hierarchy.md` — group roles are optional and variable-cardinality; never model a fixed shape (e.g. "exactly one conductor").
  - `domain/readiness-rules.md` — the decision-rule cascade is deliberately a bare enum at the current layer (`Band.decision_rule_template_type`), not yet a parameterized shape; don't invent a parameter structure the linked spike hasn't settled.
  - `domain/event-lifecycle.md` — event status values and the gig-only "Confirmed" checkpoint.
  - `domain/event-ownership.md` — the owner reference on `Event` is independent of `GroupRole`.

## Key existing modeling decisions to respect

Carried over from the current schema so they don't get silently redesigned in a future pass:

- `Membership` is the explicit `User` × `Band` pivot; everything band-scoped hangs off it.
- `Pupitre` (section) is a per-band catalog, not a global enum.
- No opaque JSON blobs for not-yet-designed structure (e.g. the readiness-rule parameters) — if a shape isn't settled, it's simply not represented yet, rather than guessed at.
- `MemberInstrument` and `PupitreAssignment` each have two distinct relations to `Membership` (the subject and the actor who declared/confirmed it) — don't collapse these into a single relation.
- Section composition counts and the binôme pairing rule are explicitly **derived, never persisted** — don't add columns for them.

## Where the output goes

Update the Linear document directly (via `Linear:save_document` against the existing document ID, not a new one) rather than saving the generated Mermaid as a local file in the repo — this keeps one source of truth for the schema instead of a diagram drifting in the repo separately from the description in Linear. If a genuinely new layer is being designed (e.g. the Layer 3 decision-rule cascade once its shape is settled), that's a new Linear document, following the same project-attachment rules in `engineering/overview/linear-workspace.md` (UUID, not slug).

After a schema change lands this way, run `knowledge-update` to check whether any `domain/` document's data-model notes (e.g. the "Data model note" in `readiness-rules.md`) need a matching update.
