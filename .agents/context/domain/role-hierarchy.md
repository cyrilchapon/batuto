---
title: Musical role hierarchy
summary: Conductor/section-leader/relay/musician is band-membership-scoped, optional, and variable in cardinality — never a fixed shape
category: domain
last_updated: 2026-07-15
related:
  - domain/event-ownership.md
  - domain/readiness-rules.md
  - domain/multi-band.md
---

# Musical role hierarchy

A band's real structure — who conducts, who leads a section, who plays — is core domain logic in Batutô, not a generic permissions layer wearing band-specific labels. This document describes that structure as it exists in the real world, independent of how it's persisted or exposed in the UI.

## The roles

- **Conductor (chef)** — the person with final musical/decision authority during an event, where the band has one at all.
- **Section leader (référent, per *pupitre*)** — leads and validates members within one section/instrument group.
- **Relay** — a standing-in or secondary authority role, distinct from conductor.
- **Musician** — a member playing an instrument, with no group-role authority.

These are **group roles** (tied to a person's membership in a specific band) and are entirely separate from **event ownership** (see `event-ownership.md`) and from generic admin/member permissions. A conductor is not automatically an admin; an admin is not automatically a conductor. Conflating these two concerns was identified early as a modeling mistake to avoid.

## Optional and variable — by design

Nothing about this hierarchy should assume a fixed shape. Real bands vary:

- **No conductor at all** — a small artistic ensemble may have no one with decision-making authority; per-song "conductors" there are musical roles only, not authority roles.
- **Multiple conductors** — a kids' band may have three conductors, any one of whom is sufficient to run a rehearsal.
- **Two relays and nothing else** — some bands run without a conductor role, on relay authority alone.
- **Per-event conductor assignment from a pool** — rather than one fixed person always holding the conductor role for a band, a given event can have a conductor chosen from a pool of eligible people. In v0 this assignment is a static field set at event creation and editable afterward — no in-app negotiation or availability-based conductor selection yet (that's parked, see "Maybe-later" in `readiness-rules.md`).

Any data model or permission check that assumes "a band has exactly one conductor" or "every band has a conductor" is wrong.

## Autonomy tiers (per member, per section)

Independent of group role, each member has an **autonomy tier per instrument/section** they play (Débutant / Musicien non-autonome / Musicien autonome / Référent) — a static attribute, validated by a section leader or conductor. This is distinct from group role: a "Référent" tier on an instrument is not the same thing as the *référent* group role, though the terms overlap in everyday band language. Tiers feed a **pairing rule** (a beginner must be paired with at least one autonomous musician; a non-autonomous musician must be paired with at least one other non-autonomous musician) that is always computed dynamically per event, never stored as a static fact about the member.

This tier system is v1 scope (Nice-to-have), layered onto the same section-leader selection step that exists in v0 — it weights who counts toward section readiness, it doesn't introduce a new selection mechanism.

## What this is not

- Not a generic RBAC/permissions system — see `product/scope.md` and `engineering/overview/conventions.md` for how the two are meant to coexist without becoming competing authorization systems (this coexistence is itself still an open design question as of v1 planning).
- Not fixed cardinality — never hardcode "one conductor," "one relay," etc.
