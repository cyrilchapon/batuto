---
title: Data model implementation (packages/db)
summary: How the Linear data-model document is translated into Prisma — naming, uuid(7) ids, where constraints live, and what the schema deliberately does not enforce
category: engineering
last_updated: 2026-09-21
related:
  - engineering/overview/conventions.md
  - product/data-modeling-convention.md
  - engineering/modules/database-migrations.md
  - domain/multi-band.md
  - domain/role-hierarchy.md
  - domain/readiness-rules.md
  - engineering/overview/quality-gates.md
  - engineering/overview/infra-and-envs.md
---

# Data model implementation (`packages/db`)

The canonical description of *what* is modeled lives in the Linear project document ["Data model — v0 CORE (Layer 1 + Layer 2)"](https://linear.app/cyc-personal/document/data-model-v0-core-layer-1-layer-2-9f90bb8097c7), and the process for evolving it is [data-modeling-convention.md](../../product/data-modeling-convention.md). This document covers only the other half: how that model is expressed in `packages/db/prisma/schema.prisma`, and which invariants the database does and does not enforce.

Layer 1 (`User`, `Band`, `Membership`, `GroupRole`, `Pupitre`, `MemberInstrument`, `InviteCode`) landed with [BAT-38](https://linear.app/cyc-personal/issue/BAT-38/data-model-layer-1-identity-bands-memberships-pupitres) as the repo's first real schema, across three migrations on top of the `HelloWorld` bootstrap placeholder. A fourth added `PupitreLeader` with [BAT-47](https://linear.app/cyc-personal/issue/BAT-47/data-model-role-de-pupitre-chef-de-pupitre-referent) — a gap found while implementing BAT-38, not a design change. How migrations themselves are written and validated is [database-migrations.md](database-migrations.md).

## Schema conventions

These were settled while translating Layer 1 and apply to every subsequent layer:

- **Prisma-default naming, no `@map`/`@@map`.** PascalCase models, camelCase fields, and the resulting PascalCase/camelCase table and column names in Postgres. The Linear document's ER diagrams use `snake_case` — that is diagram notation, not a mapping instruction.
- **`String @id @default(uuid(7))` for every primary key.** The document specifies UUIDs; v7 is used over v4 for index locality, since every one of these tables is written in roughly chronological order.
- **`createdAt` / `updatedAt` on every model**, uniformly, including the effectively-immutable ones (`GroupRole`, `InviteCode`) — uniform beats per-model judgment here.
- **Enum values are copied verbatim from the document** (`hierarchical`, `non_autonome`, …) rather than re-cased to a Prisma house style, so the schema and the spec can be diffed by eye.
- **No `@default` on `Band.decisionRuleTemplateType`.** Picking one would hardcode one band's behavior as "the" behavior, which [readiness-rules.md](../../domain/readiness-rules.md) rules out explicitly. The value is chosen at band creation.
- **`onDelete: Cascade` down the band-scoped chain**, with one exception: `MemberInstrument.validatedBy` is `SetNull`, since losing the validator's membership must not delete the validated instrument.

## Constraints the ER diagram can't express

An ER diagram carries entities and relations; uniqueness and indexing are implementation decisions made here. Layer 1 adds:

- `User.clerkUserId` and `User.email` unique. Clerk owns identity and enforces both upstream (see [auth.md](auth.md)); the database constraint is there to catch a sync bug rather than to define the rule.
- One `Membership` per `(userId, bandId)`, one `Pupitre` per `(bandId, name)`, one `MemberInstrument` per `(membershipId, pupitreId)`.
- One `GroupRole` per `(membershipId, type)`, and one `PupitreLeader` per `(membershipId, pupitreId)` — both bound *duplication*, not cardinality. A band may still have zero, one, or several conductors, and a pupitre zero, one, or several leaders, which [role-hierarchy.md](../../domain/role-hierarchy.md) requires.
- Indexes on the band-scoped foreign keys that get queried directly (`Membership.bandId`, `InviteCode.bandId`, `MemberInstrument.pupitreId` / `validatedById`, `PupitreLeader.pupitreId`). The other direction — "which pupitres does this member lead", the query [BAT-45](https://linear.app/cyc-personal/issue/BAT-45/section-leader-selection-step-available-selected) is built on — rides the `(membershipId, pupitreId)` unique index's leading column and needs no index of its own.

## Band scoping is enforced by the database

Nothing may pair a `Membership` in band A with a `Pupitre` — or a validator — in band B. That is enforced, not merely expected of callers. `Membership` and `Pupitre` each carry an `@@unique([id, bandId])`, and all three foreign keys out of `MemberInstrument` are composite, routing through a single denormalised `bandId` column on that table:

```prisma
membership  Membership  @relation("MemberInstrumentMember", fields: [membershipId, bandId], references: [id, bandId], onDelete: Cascade)
pupitre     Pupitre     @relation(fields: [pupitreId, bandId], references: [id, bandId], onDelete: Cascade)
validatedBy Membership? @relation("MemberInstrumentValidator", fields: [validatedById, bandId], references: [id, bandId], onDelete: SetNull)
```

`PupitreLeader` is the second instance and the cheap one: both of its relations are required, so the two composite keys cascade and none of the `SetNull` trouble below applies.

The redundant column is the point, not a concession, and the reasoning generalises well beyond bands — it is written up as a standing principle in [conventions.md](../overview/conventions.md#scoping-keys-travel-through-relations--integrity-over-normalization). Expect to do the same in Layer 2, where `AvailabilityResponse` and `PupitreAssignment` each reference an event, a membership and a pupitre that must all agree on their band.

An optional composite foreign key behaves correctly without extra machinery: Postgres's default `MATCH SIMPLE` skips the check entirely when any of its columns is NULL, so `validatedById IS NULL` means "no validator", not a violation.

### The one thing Prisma can't emit

`prisma validate` warns that `SetNull` is questionable when a referenced field is required, and it is right: the SQL Prisma generates is a bare `ON DELETE SET NULL`, which would try to clear `bandId` too and fail against its `NOT NULL`. Postgres 15+ accepts a column list, so `20260920071200_pupitres_and_member_instruments/migration.sql` hand-writes:

```sql
ON DELETE SET NULL ("validatedById")
```

Only the validator is cleared when their membership is deleted; the instrument and its band survive. `check:schema` stays green — `migrate diff` does not distinguish the column list from a bare `SET NULL` — which cuts both ways: regenerating that migration would silently drop the column list and nothing mechanical would object. The "keeps a validated instrument, minus its validator" case in `apps/api/src/db.test.ts` is what actually catches it.

Hand-editing is not a workaround around Prisma so much as the path Prisma itself prescribes for anything its schema language cannot express (`prisma migrate dev --create-only`, then edit, then apply — see [Customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)). This was checked rather than assumed, in September 2026 against Prisma 7.8:

- [#8264](https://github.com/prisma/prisma/issues/8264) (open since July 2021) — `SetNull` on a composite key nulls every column, including one that is required. Exactly this case.
- [#8403](https://github.com/prisma/prisma/issues/8403) (open since July 2021) — the same thing on the client side, for `disconnect`. See the gotcha below.
- [#16439](https://github.com/prisma/prisma/issues/16439) (closed, 4.7.0) — all that changed is that PostgreSQL now *warns* instead of refusing the schema. It lets you declare the intent; it does not emit the right SQL.
- [#3388](https://github.com/prisma/prisma/issues/3388) (open since December 2019) — CHECK constraints, same story, labelled "has-stopgap".

**No plugin fixes this, and it isn't for lack of looking.** Prisma's two extension points — client extensions and generators — act on queries and on generated artifacts; neither can touch the SQL Prisma Migrate emits, so a third-party package has nowhere to hook in. ZenStack, the main community layer over Prisma, inherits the limitation and prescribes the same hand-edit. Verified directly against Prisma 7.8: `@@check` is rejected (`Attribute not known`), and there is no per-column argument on `onDelete` (`No such argument`).

### Gotcha: clear a validator through the scalar, never `disconnect`

`validatedBy: { disconnect: true }` throws a null-constraint violation, because Prisma nulls every column of the composite relation — `bandId` included. That is [#8403](https://github.com/prisma/prisma/issues/8403), reproduced on this schema. The supported way to un-validate an instrument is the scalar:

```ts
db.memberInstrument.update({
  where: { id },
  data: { validated: false, validatedById: null, validatedAt: null },
});
```

`bandId` is left alone and the write succeeds. Worth knowing before [BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api) implements validation withdrawal; `db.test.ts` locks the supported path in.

## A pupitre-scoped role is a model, not another enum value

`GroupRole` is `conductor | relay` and stays that way. Those are *group* roles, held across a whole band, hanging off a `Membership` alone — which is exactly why the *chef de pupitre* (*référent*) could not join them: that role leads one section, and the enum has nowhere to record which. `PupitreLeader` is therefore its own `Membership` × `Pupitre` model, not a third enum value ([BAT-47](https://linear.app/cyc-personal/issue/BAT-47/data-model-role-de-pupitre-chef-de-pupitre-referent)).

It carries no `type` column, and shouldn't grow one speculatively: there is exactly one pupitre-scoped role today. A second one is what would turn this into `GroupRole`'s shape, with a `Pupitre` attached.

Cardinality is free in both directions — a pupitre may have no leader, one, or several; a member may lead several pupitres — per [role-hierarchy.md](../../domain/role-hierarchy.md), which rules out any model assuming a fixed shape. The `(membershipId, pupitreId)` unique key bounds duplication only, and `db.test.ts` asserts both directions rather than leaving that to the reader.

**Mind the vocabulary clash**, which `role-hierarchy.md` flags explicitly: `MemberInstrumentTier.referent` is an autonomy level on one instrument and carries no authority whatsoever. It is not this role, and neither implies the other.

### Who may validate a `MemberInstrument`, settled

With this model in place, validation authority stops being "any `Membership` in the band" and becomes derivable: **a validator must hold a `GroupRole` in the band — `conductor` or `relay` — or lead that instrument's pupitre.**

`relay` counts deliberately, and this widens the domain doc's shorthand — [role-hierarchy.md](../../domain/role-hierarchy.md) says tiers are "validated by a section leader or conductor". Taken literally that leaves a band running on relay authority with no conductor, which the same document describes as real, unable to validate anything: the assumption it rules out, arrived at from the other direction. Widening was the safer reading of the two, but it is a call made here rather than a domain fact, and narrowing it back is a one-line change in the handler.

No key or CHECK can carry this: it spans rows (it asks what roles another membership holds) and is conditional on `validated`. So it is the handler's, and [BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api) is where it lands — with a test standing in for the constraint that cannot exist, as [conventions.md](../overview/conventions.md#scoping-keys-travel-through-relations--integrity-over-normalization) requires whenever an invariant falls back to application code.

## What the schema deliberately does not enforce

- **Validation authority.** Nothing stops `MemberInstrument.validatedById` from being any membership in the band, its own `membershipId` included — the composite key constrains the validator to the same *band* and nothing more, and no CHECK compares the two columns (verified against a live database). The rule that fills that gap is the authority check above, and it is the handler's on purpose.

  **"Not yourself" is not a rule of its own**, which is the part worth not re-deriving. A blanket `CHECK ("validatedById" IS NULL OR "validatedById" <> "membershipId")` was weighed and rejected on BAT-38: in a band whose only conductor also plays, it leaves that member's own instrument permanently unvalidatable — the same assumption [role-hierarchy.md](../../domain/role-hierarchy.md) rules out when it says no model may assume every band has a conductor. BAT-47 resolved it the way that document predicted: the authority check subsumes it. A member with no authority cannot validate anyone's declaration, their own included; a sole conductor who plays can validate their own, because they genuinely *are* the authority the field records. Both fall out of one rule, and neither needs a second.

  The asymmetry also runs the other way from how it first looks: relaxing a constraint later is a migration against a table with rows, while adding one later is a migration against contents you already know.

  **The check [BAT-42](https://linear.app/cyc-personal/issue/BAT-42/band-membership-and-roster-api) needs is conditional**, not a bare column comparison: it applies only where `validated` is true. A member editing their own declaration while it is still unvalidated is not validating anything, and a rule written against `validatedById` alone blocks a legitimate action.

## The bootstrap placeholder was removed forward, not erased

BAT-38 dropped `HelloWorld` with a migration that drops the table, leaving `20260716145002_init` exactly as it was. Rewriting history would have been tempting — no environment holds data worth keeping yet, and it would have left one clean initial migration — but it breaks every database that already recorded the deleted migration, and the discipline is worth more than the tidiness. See [database-migrations.md](database-migrations.md) for the rule and for what "append-only" costs and buys.

## Verifying a schema change

`check:schema` and `check:migrations` are the two gates, both run in CI against ephemeral Neon branches — see [quality-gates.md](../overview/quality-gates.md) and [infra-and-envs.md](../overview/infra-and-envs.md). Locally, `check:schema` only needs a `SHADOW_DATABASE_URL` pointing at a structurally empty database; it replays the whole migration directory into it and diffs the result against `schema.prisma`.

`apps/api/src/db.test.ts` complements those: a round trip through the real generated client (band → membership → member instrument → pupitre, plus both of `MemberInstrument`'s relations to `Membership`, and a member leading a pupitre), followed by writes that *should* be refused — a membership paired with another band's pupitre, a pupitre paired with another band's membership, a foreign validator, a foreign section leader in both directions, and duplicates of a pupitre name and of a leadership. It replaces the placeholder round trip the `hello` handler used to do, and it is the reason `apps/api` still depends on `@batuto/db` before the first real API procedures land.

Two of its assertions look like over-specification and are not. A negative case names the constraint that rejected the row, because a case meant to exercise one foreign key passes just as happily when another fires first — and where both relations of a row feed the same `bandId`, which key that is depends on which relation the client resolved it from. Reaching a specific one takes an unchecked create pinning `bandId` directly. The other is the free-cardinality pair on `PupitreLeader`: several leaders on one pupitre, several pupitres for one leader. Nothing in the schema forbids either, so nothing but a test notices if a later "tidy-up" unique key does.

Run it through turbo (`yarn turbo run test`), not `yarn workspace @batuto/api test`: `apps/api` imports `@batuto/db`'s built `dist/`, so a direct invocation happily tests a stale client against a freshly migrated database and reports failures that do not exist.
