---
title: Database migration doctrine
summary: Migrations are append-only and small — one logical change per migration, additive before a deploy and destructive after it, generated from the schema, and any hand-written SQL kept alive by a register plus a test
category: engineering
last_updated: 2026-09-20
related:
  - engineering/modules/data-model.md
  - engineering/overview/quality-gates.md
  - engineering/overview/infra-and-envs.md
---

# Database migration doctrine

How `packages/db/prisma/migrations` is allowed to change. [data-model.md](data-model.md) covers *what* is modeled; this covers the mechanics of getting a change into the database safely. These rules apply from the first real migration onward — there is no "it's early, nobody has data yet" exception, because the point of the discipline is that it never has to be switched on.

## Append-only. Always.

**Never edit, rename, reorder or delete a migration that has been pushed.** A migration directory is an immutable record of something that has already run somewhere. Changing one means every database that recorded it — a teammate's laptop, the shared dev branch, CI's clone, production — either fails its next `prisma migrate deploy` outright (the applied migration is no longer in the directory) or silently diverges (the checksum no longer matches what was applied).

To undo something a pushed migration did, **write a new migration that undoes it**. That is true even for a placeholder: BAT-38 removed the `HelloWorld` bootstrap model with a migration that drops the table, keeping `20260716145002_init` untouched, rather than deleting the init migration and starting over. Verified against a database holding only the original init: the new migrations apply on top with no reset.

The only edit a pushed migration ever legitimately receives is none. If a migration is wrong, the fix is forward.

**Where the line actually falls:** a migration becomes immutable once it has reached somewhere that records having applied it — `dev`, any deployed environment, or a colleague's database. On an unmerged feature branch that nothing has deployed, a migration is still a draft: regenerate or rewrite it freely while the shape is still under review, and rebase the branch rather than stacking a corrective migration onto a design nobody has run. Pushing a branch is not what freezes it; merging it, or anyone applying it, is.

## One logical change per migration

Prefer several small migrations over one large one, generated **incrementally**: change a coherent slice of `schema.prisma`, generate the migration for that slice, then move on to the next slice. Layer 1 landed as three migrations — drop the placeholder, then identity/bands/memberships/invite codes, then pupitres and member instruments — rather than one 150-line create.

A "logical change" is one thing a reviewer can hold in their head and one thing that can fail on its own: a table and its indexes, a column plus its backfill, a constraint. Not "everything this ticket touches". Resist the opposite extreme too — splitting a table away from the index that makes it usable buys nothing and produces a migration that is meaningless in isolation.

This matters most when something goes wrong in a deployed environment: `prisma migrate deploy` stops at the first failing migration and leaves the earlier ones applied. Small migrations mean the failure point is unambiguous and the recovery is a single forward fix.

## Generate migrations, don't hand-write them

Edit `schema.prisma`, then let Prisma produce the SQL:

- **Locally, with a database:** `yarn workspace @batuto/db migrate:dev`, which generates and applies in one step.
- **Without a database to migrate against** (a CI runner, a container, a review session): `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`, pointed at an empty `SHADOW_DATABASE_URL`. This produces exactly what `migrate:dev` would, without touching a real database.

Then **read the generated SQL before committing it**. Generation is not review: Prisma will happily generate a column drop, a table rewrite, or a `NOT NULL` addition with no default that cannot succeed against existing rows.

## Hand-written SQL, and the register that keeps it alive

Some things Prisma's schema language cannot express — CHECK constraints, triggers, partial indexes, data backfills, and the odd SQL feature its emitter predates. Writing those by hand is Prisma's own prescribed path, not a hack around it: [Customizing migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations) says to generate with `prisma migrate dev --create-only`, edit, then apply (the `migrate diff --script` route above is its no-database equivalent).

The danger is not writing it. The danger is **losing it six months later**, because `prisma migrate diff` cannot see it: `check:schema` is equally green with or without the hand-written part, so regenerating a migration silently drops it and no gate objects. Three rules, and they are not optional:

1. **Edit the generated file, never author a whole migration by hand.** Append the statement at the end, under a comment saying what it does and *why Prisma cannot*.
2. **Pair it with a test that fails if it disappears.** Not a test of the happy path — a test that exercises precisely the behaviour the statement provides. This is the only real guard; treat an unguarded hand-written statement as already lost.
3. **Add a row to the register below, in the same commit.** A regeneration of any migration listed here has to re-apply its hand-written part by hand.

### Register of hand-written SQL

| Migration | Statement | Why Prisma can't | Guarded by |
|---|---|---|---|
| `20260920071200_pupitres_and_member_instruments` | `ON DELETE SET NULL ("validatedById")` on `MemberInstrument_validatedById_bandId_fkey` | Prisma emits a bare `ON DELETE SET NULL`, which would also clear the required `bandId` and fail at runtime. Postgres 15+ takes a column list; Prisma has no syntax for it ([#8264](https://github.com/prisma/prisma/issues/8264), open since 2021) | `apps/api/src/db.test.ts` — "keeps a validated instrument, minus its validator, when the validator leaves" |

When a row's upstream issue is finally fixed, that is the moment to delete the hand-written statement, the row, and probably the test's comment — not before, and not silently.

### A database-level fix stays at the database level

Worth being explicit, because it is easy to assume otherwise: a referential action is only consulted when the **database** changes a referenced row — here, when a `Membership` is deleted. It does nothing for an equivalent operation the *client* performs itself.

Concretely, `validatedBy: { disconnect: true }` still fails against this schema even with the column-list `SET NULL` in place, because Prisma plans the disconnect as a write that nulls every column of the composite relation, `bandId` included, and rejects it before any SQL reaches Postgres ([#8403](https://github.com/prisma/prisma/issues/8403)). The cascade and the disconnect are two different layers; fixing one says nothing about the other. Verified on the current schema:

```
1. client-side disconnect  -> Null constraint violation
2. delete the validator's membership -> survives, validatedById null, bandId intact
```

The client-side equivalent has to be written as a scalar update — see [data-model.md](data-model.md#gotcha-clear-a-validator-through-the-scalar-never-disconnect).

## Additive migrations before a deploy, destructive ones after

`_reusable-deploy.yml` runs `release` (the migrations) and only then `deploy-api`/`deploy-web`, both `needs: release`. So for a window of roughly a minute, **the schema is new while the code serving traffic is still old**. Which direction is safe depends entirely on what the migration does:

- **Additive** — a new table, a new nullable column — is safe in that order, and is why the fixed ordering works at all. The old code simply ignores what it doesn't know about.
- **Destructive** — a `DROP TABLE`, a dropped or renamed column, a new `NOT NULL` without a default — breaks the old code for the length of that window, because it is still reading or writing what the migration just took away.

The rule: **a destructive migration has to reach production only after the code that stopped needing the thing is live.** In practice that means two releases — ship the code change, let it deploy, then drop in a follow-up — because the pipeline has no post-deploy migration step to put it in.

Note that this cuts both ways, and the additive case is safe by luck rather than by design: a migration adding a `NOT NULL` column with no default fails against the old code writing rows without it, in the same window and for the same reason. The ordering is fixed; only the kinds of change that happen to fit it are safe.

### The one conscious exception so far

BAT-38 shipped `20260920071000_drop_hello_world_placeholder` — a `DROP TABLE` — in the same PR as the code that stopped using it. Merging it makes `dev`'s home page 500 for about 69 seconds, since the live release's `/hello` handler writes to that table and the home-page loader calls it on every render.

Taken knowingly: the window is on staging, there is no production branch yet (`main` does not exist), and the review-app path is unaffected because it deploys against a PR clone. The alternative — keeping `model HelloWorld` in `schema.prisma` so the migration history stays drift-free, then a second PR to remove both — was judged more moving parts than the risk warranted at this stage, and it would have merged a PR contradicting its own ticket's definition of done.

**That trade expires with `main`.** Once a production branch exists, "accept the window" is no longer available and this doctrine is the only answer, until the pipeline grows a post-deploy migration step — tracked as [BAT-48](https://linear.app/cyc-personal/issue/BAT-48/deploy-pipeline-etape-de-migration-post-deploiement).

## Write migrations that can run against real rows

An empty database is the easy case. Every migration has to survive a table that already has data in it:

- Adding a `NOT NULL` column needs a default, or a three-step sequence (add nullable → backfill → enforce).
- Renaming is a destructive drop-and-create unless expressed as add → backfill → drop, across separate migrations and usually separate deploys.
- A newly added `UNIQUE` constraint fails on existing duplicates. Know whether duplicates exist before adding it.

`check:migrations` in CI exists precisely for this: it deploys against an ephemeral clone of the *data-bearing* shared dev branch, not an empty database. A migration that passes `check:schema` and fails `check:migrations` is a migration that would have broken a real environment.

## Verify before pushing

Both database gates run in CI (see [quality-gates.md](../overview/quality-gates.md) and [infra-and-envs.md](../overview/infra-and-envs.md)), and both can be run locally first:

- **`check:schema`** — replays the whole migration directory into an empty shadow database and diffs the result against `schema.prisma`. Catches the classic mistake: editing the schema and forgetting the migration, or vice versa. Needs only an empty `SHADOW_DATABASE_URL`.
- **`check:migrations`** — `migrate deploy` against a real clone. Catches what an empty database cannot.

Beyond the gates, exercise anything the schema cannot state. Composite keys, CHECK constraints and cascade behaviour are only claims until a test tries to violate them — `apps/api/src/db.test.ts` does exactly that for Layer 1's band scoping, and a negative test there asserts that the *database* rejected the write, not that Prisma refused to build the query.

## Naming

`YYYYMMDDHHMMSS_snake_case_description`, which is what Prisma generates. Name it after the change, not the ticket: `drop_hello_world_placeholder`, not `bat_38_part_1`. The timestamp prefix is the ordering — never renumber it to "tidy up" a sequence.
