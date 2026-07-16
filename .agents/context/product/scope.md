---
title: Product scope
summary: What Batutô builds now (v0/v1), what's parked with a trigger condition, and the hard fence it never crosses
category: product
last_updated: 2026-07-15
related:
  - domain/event-lifecycle.md
  - domain/role-hierarchy.md
---

# Product scope

This is what Batutô, specifically, chooses to build — as distinct from `domain/`, which describes how a band works regardless of any app. Scope was worked out via an expand-and-contract pass; see the project's Linear description and milestones for the canonical, evolving version of this list. This document summarizes it for agent context and should be refreshed if the Linear project description changes materially.

## v0 — CORE (target: end of August 2026)

Replace the current spreadsheet/WhatsApp/memory process entirely for at least one full rehearsal cycle and one gig, for the originating Batucada band. If any item here is missing, the app isn't usable as a daily tool yet.

Event creation, recurring events, per-band-template availability polling (including the section-leader selection step for hierarchical-template bands), instrument/section assignment, template-driven minimum-headcount alerts, member roster & profiles, multi-band support, structured musical role hierarchy with template-driven go/no-go authority, section-leader scoped management, event ownership & the rehearsal/gig lifecycle status machine (see `domain/event-lifecycle.md`).

## v1 — NICE TO HAVE (target: end of October 2026)

Turn the v0 spine into a tool the band actually enjoys using day to day. Nothing in this phase touches the fence below.

Registration deadline & headcount confirmation, substitute/guest musician management, calendar view + export, generic role-based permissions (admin/organizer/member/guest — see the open question in `domain/role-hierarchy.md` about coexisting with the musical decision-gates), carpooling/logistics coordination, equipment/gear checklist per event, WhatsApp notification integration, delegated authority (a relay standing in for a conductor — extends the readiness-template system, not a separate mechanism), automated reminders, and per-member autonomy tiers (see `domain/role-hierarchy.md`).

## Maybe-later (parked, with an explicit trigger — not designed away)

- Attendance history & participation stats — *after a full season of event data has accumulated*.
- Setlist/repertoire management per event — *after conductors ask for it explicitly*.
- Role assignment & history — *after the role hierarchy has been used for a full season*.
- Waitlist for full events/sections — *after sections regularly reach capacity*.
- In-app conductor negotiation/selection support — *after the static per-event conductor field (v0) proves limiting in practice*.

## Out — the fence (never in scope)

- A public-facing event page (no login).
- Dues/payment tracking, and more broadly all customer-relationship and invoicing integrations. These are managed entirely outside the app — Batutô only ever reflects that a checkpoint happened (e.g. the gig "Confirmed" flip in `domain/event-lifecycle.md`), it never automates the process behind it.

This fence is a hard constraint, not a current-priority statement — a feature request that would require modeling payments, invoicing, or a public page is out of scope regardless of who asks or how it's framed, unless the fence itself is deliberately revisited as a scope decision.
