---
title: Readiness rules
summary: The three decision-mode templates (hierarchical, consensual, threshold) and the band → band+type → event config cascade that resolves which one applies
category: domain
last_updated: 2026-07-15
related:
  - domain/role-hierarchy.md
  - domain/event-lifecycle.md
  - domain/multi-band.md
---

# Readiness rules

Every band decides "we're on" differently. This is the single most complex piece of Batutô's domain model — resolved as a spike (see the originating issue linked below), and treated here as settled, with explicitly called-out open edges.

Originating design work: [BAT-1 — Spike: band decision-mode & readiness-rule templates](https://linear.app/cyc-personal/issue/BAT-1/spike-band-decision-mode-and-readiness-rule-templates).

## The three reference behaviors that shaped this model

These are real bands, used to validate that the model generalizes rather than fitting one organization's habits:

- **Hierarchical delegation** — a secretary proposes a gig; a conductor is assigned *per event* from a pool of eligible conductors/relays (not a fixed band-level identity); the conductor breaks down headcount per section; section leaders each select a subset of available musicians against their section's min/max; the conductor holds final go/no-go override across the whole composed roster.
- **Consensual quorum** — no conductor or leader with authority at all (per-song "conductors" there are musical roles, not decision roles); a poll runs against pre-agreed dates, and once a threshold of yes-votes is reached, the rehearsal auto-confirms mechanically, with no approval step.
- **Role-threshold with exceptions** — fixed minimum presence per role and/or per section (e.g. at least one of three conductors, at least one kid per section), with a manual exception path for edge cases.

## The model: parameterized templates, not a generic rule engine

Three template **types**, each parameterized — deliberately not a fully generic, band-authored rule engine (that remains a long-term "maybe later," not near-term scope):

1. **Hierarchical delegation** — assigned conductor (from an eligible pool, per event); event-level min/max headcount, splittable per section; section-leader selection step (available → selected) against section min/max; conductor final override.
2. **Consensual quorum** — no authority role; a threshold (fixed count or percentage) auto-confirms readiness once met.
3. **Role-threshold with exceptions** — fixed minimum presence per role and/or per section, plus a manual exception/override mechanism (exact shape still open — see below).

## The three-level configuration cascade

**Band default → band + event-type default → per-event override.**

- A band has a default decision-mode template.
- That default can be refined per event type (rehearsal vs. gig commonly need different defaults).
- The event's own configuration is always the actual source of truth — band and band+type defaults only pre-fill it, they never constrain it after the fact.

This directly supports "special gigs" (relaxed rules for one specific event) and "special rehearsals" (stricter rules for one specific event) without any special-casing in code — it's the same cascade resolving to a different final value, not a different code path.

## Universal override

Regardless of which template is active, **every computed transition remains manually forceable** on top of it. The template computes the default path to readiness; a human with authority can always force a transition (e.g. force "roster confirmed" without meeting the threshold, dropping an entire section for one event) or force-cancel from any state. See `event-lifecycle.md` for how this interacts with the event state machine. *Who* is authorized to force which transition is a distinct, still-open question (see "Still open" below).

## v0 scope boundary (deliberately simplified)

- The section-leader selection step (available → selected) is modeled in v0, but **without** autonomy-tier weighting — tier-weighted pairing (see `role-hierarchy.md`) is v1, layered onto the same mechanism, not a redesign of it.
- Per-event conductor assignment is a **static field** in v0, set at event creation and editable later. No in-app negotiation or availability-based conductor selection workflow — that stays outside the app (WhatsApp, verbal) for now.

## Data model note

At the v0 data-model layer, `Band.decision_rule_template_type` is currently a bare enum (`hierarchical | consensual | threshold`) with no parameters — the full parameter shape (min/max, thresholds, exception rules) belongs to a later layer not yet built out, deliberately deferred rather than guessed at with an opaque JSON blob. See the project's "Data model — v0 CORE" Linear document for the current schema.

## Maybe-later (parked, not designed in v0/v1)

- In-app conductor negotiation/selection support (conductor availability, pairing/beginner nuance for conductor/relay assignment itself).
- Fully configurable, band-authored templates beyond the three fixed parameterized types.

## Still open

- Exact shape of the exception mechanism for the role-threshold template.
- The authorization matrix — who can force which lifecycle transition, per template type and per role (conductor, section leader, gig-owner, admin). Explicitly parked as its own follow-up, to be scoped alongside the role/permission work, not blocking the rest of v0.
