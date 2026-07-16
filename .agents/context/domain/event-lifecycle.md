---
title: Event lifecycle
summary: Rehearsal and gig state machines share a spine and diverge only after roster confirmation, with every transition manually forceable
category: domain
last_updated: 2026-07-15
related:
  - domain/readiness-rules.md
  - domain/event-ownership.md
---

# Event lifecycle

Originating design work: [BAT-3 — Spike: rehearsal & gig lifecycle state machine](https://linear.app/cyc-personal/issue/BAT-3/spike-rehearsal-and-gig-lifecycle-state-machine).

## Resolved lifecycles

**Rehearsal:** Proposed → Collecting → Roster confirmed → Completed

**Gig:** Proposed → Collecting → Roster confirmed → Confirmed → Completed

Both share the same front end and diverge only after Roster confirmed: rehearsals go straight to Completed; gigs get one additional manual, business-side checkpoint.

## State definitions

- **Proposed** — event created; the decision-mode template is resolved (band default → band+type default → per-event override, see `readiness-rules.md`).
- **Collecting** — availability is open. For the hierarchical template, this includes the section-leader selection step. Readiness is a *live computed flag* during this state (an in-tension indicator), not a separate lifecycle state of its own.
- **Roster confirmed** — reached per the resolved template: an explicit conductor action for hierarchical delegation; automatic once the threshold is met for consensual quorum or role-threshold.
- **Confirmed** *(gig only)* — a manual, business-side checkpoint, set by hand (typically by the secretary or treasurer). This deliberately abstracts away the entire external quote/customer process — the app never models quote states, just this one flip. This matches the project's hard boundary: no invoicing or customer-relationship logic, ever (see `product/scope.md`).
- **Completed** — the event happened.
- **Cancelled** — reachable from any state, by force.

## Cross-cutting rules

- **Every transition is forceable**, not just the computed default. A human with authority can force "Roster confirmed" even without meeting the template's thresholds, or force-cancel from any state. The readiness template computes the default path; override is always available on top of it.
- **Who is authorized to force which transition is explicitly still open** — see "Still open" below. This is not a gap in this document; it's a genuinely unresolved design question, flagged rather than guessed at.
- **Auto-cancel deadlines are not universal.** Where they exist, they're an optional parameter on the same per-band/per-type/per-event template configuration described in `readiness-rules.md` — never a fixed, app-wide rule.

## Explicit non-goal

The gig "Confirmed" checkpoint must stay a dumb manual flip. It is easy to scope-creep into "just a small quoting feature" — resist this. It is deliberately a human action referencing a process that happens entirely outside the app.

## Still open

- **Authorization matrix**: who can force which transition, per template type (hierarchical / consensual / threshold) and per role (conductor, section leader, gig-owner, admin). Scoped as its own follow-up issue, intended to be resolved alongside the role/permission work rather than guessed at here.
