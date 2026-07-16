---
title: Event ownership
summary: The person who creates and tracks an event to validation is often non-musical and always distinct from the musical role hierarchy
category: domain
last_updated: 2026-07-15
related:
  - domain/role-hierarchy.md
  - domain/event-lifecycle.md
---

# Event ownership

Every event (rehearsal or gig) has a **gig-owner** — the person who proposes it, tracks it, and is responsible for it administratively. This is a separate concern from the musical role hierarchy (`role-hierarchy.md`) and is deliberately modeled as such.

## Who the gig-owner typically is

Often the non-profit's president or secretary — not necessarily anyone in the musical hierarchy at all. A gig-owner does not need to be a conductor, section leader, relay, or even a musician in the band.

## What ownership covers vs. what it doesn't

- The gig-owner creates the event, sets its initial parameters (e.g. optional event-level min/max headcount for a hierarchical-template band), and tracks it through its lifecycle.
- The gig-owner is **not** automatically the one who decides musical readiness — that authority belongs to whichever role the band's decision-mode template assigns it to (conductor override, consensual quorum, or role-threshold — see `readiness-rules.md`). A gig-owner can be a bystander to the actual go/no-go decision.
- For gigs specifically, the gig-owner (often a secretary or treasurer) is the one who flips the manual "Confirmed" checkpoint — a business-side action, entirely separate from the musical roster confirmation earlier in the same event's lifecycle. See `event-lifecycle.md`.

## Why this separation matters

Collapsing ownership into the musical hierarchy (e.g. assuming "the conductor manages the event") breaks down as soon as a band's secretary — who plays no instrument at all — is the one actually creating and chasing gigs. Keeping the two concerns distinct in the data model (an explicit owner reference on the event, independent of any `GroupRole`) is what makes that arrangement representable at all.
