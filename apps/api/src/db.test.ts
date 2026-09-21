import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db.js";

// Proves the Layer 1 migrations are applied and that the generated client
// round-trips them — including the composite-key band scoping, which is the
// one invariant a reviewer cannot check by reading schema.prisma alone.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const bandName = (label: string) => `Test band ${label} ${suffix}`;

// Prisma error codes: P2002 is a unique violation, P2003 a foreign key one.
// https://www.prisma.io/docs/orm/reference/error-reference
type ConstraintCode = "P2002" | "P2003";

// A rejection only means something here if the *expected* constraint produced
// it. Accepting any database error is not enough: a case meant to exercise a
// foreign key stays green when some other constraint rejects the row first,
// which is exactly how the cross-band validator case below used to pass
// without ever reaching the composite FK it exists to test.
const expectRejectedByDatabase = async (
  query: Promise<unknown>,
  code: ConstraintCode,
  detail: string,
) => {
  const error = await query.then(
    () => null,
    (caught: unknown) => caught,
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).name).toBe("PrismaClientKnownRequestError");
  expect((error as { code?: string }).code).toBe(code);
  // Naming the constraint is the whole point: without it a case meant to
  // exercise one foreign key passes just as happily when a different one
  // rejects the row first.
  expect((error as Error).message).toContain(detail);
};

type Fixture = {
  bandId: string;
  pupitreId: string;
  conductorId: string;
  musicianId: string;
};

const createMember = (label: string, bandId: string) =>
  db.membership.create({
    data: {
      band: { connect: { id: bandId } },
      user: {
        create: {
          clerkUserId: `user_${label}_${suffix}`,
          name: label,
          email: `${label}@${suffix}.test`,
        },
      },
    },
  });

const setUpBand = async (label: string, pupitreName: string): Promise<Fixture> => {
  const band = await db.band.create({
    data: {
      name: bandName(label),
      decisionRuleTemplateType: "hierarchical",
      pupitres: { create: { name: pupitreName } },
      inviteCodes: { create: { code: `invite-${label}-${suffix}` } },
    },
    include: { pupitres: true, inviteCodes: true },
  });

  const pupitre = band.pupitres.at(0);
  if (!pupitre) {
    throw new Error("expected the nested pupitre create to have returned a row");
  }
  expect(band.inviteCodes).toHaveLength(1);

  const conductor = await createMember(`conductor-${label}`, band.id);
  const musician = await createMember(`musician-${label}`, band.id);

  return {
    bandId: band.id,
    pupitreId: pupitre.id,
    conductorId: conductor.id,
    musicianId: musician.id,
  };
};

let a: Fixture;
let b: Fixture;

describe("Layer 1 schema", () => {
  beforeAll(async () => {
    a = await setUpBand("a", "surdo");
    b = await setUpBand("b", "caixa");
  });

  afterAll(async () => {
    // Memberships, pupitres and instruments all cascade from these two.
    await db.band.deleteMany({ where: { name: { in: [bandName("a"), bandName("b")] } } });
    await db.user.deleteMany({ where: { email: { endsWith: `${suffix}.test` } } });
    await db.$disconnect();
  });

  it("round-trips a declared instrument and the member who validated it", async () => {
    const instrument = await db.memberInstrument.create({
      data: {
        tier: "debutant",
        validated: true,
        validatedAt: new Date(),
        membership: { connect: { id: a.musicianId } },
        pupitre: { connect: { id: a.pupitreId } },
        validatedBy: { connect: { id: a.conductorId } },
      },
      include: { pupitre: true, validatedBy: true },
    });

    expect(instrument.bandId).toBe(a.bandId);
    expect(instrument.tier).toBe("debutant");
    expect(instrument.pupitre.name).toBe("surdo");
    expect(instrument.validatedBy?.id).toBe(a.conductorId);
  });

  it("keeps a validated instrument, minus its validator, when the validator leaves", async () => {
    const leaver = await createMember("leaver-a", a.bandId);
    const instrument = await db.memberInstrument.create({
      data: {
        tier: "autonome",
        validated: true,
        membership: { connect: { id: a.conductorId } },
        pupitre: { connect: { id: a.pupitreId } },
        validatedBy: { connect: { id: leaver.id } },
      },
    });

    await db.membership.delete({ where: { id: leaver.id } });

    const kept = await db.memberInstrument.findUniqueOrThrow({ where: { id: instrument.id } });
    expect(kept.validated).toBe(true);
    expect(kept.validatedById).toBeNull();
    // The band column is shared with the two required relations, so clearing
    // the validator must leave it alone — see the migration's hand-written
    // column-list SET NULL.
    expect(kept.bandId).toBe(a.bandId);
  });

  // prisma/prisma#8403: `disconnect` on a composite relation nulls every one of
  // its columns, bandId included, so clearing a validator has to go through the
  // scalar. Locking the supported path in, since it is not the obvious one.
  it("clears a validator through the scalar, leaving the band intact", async () => {
    const validator = await createMember("clearer-a", a.bandId);
    const declarer = await createMember("declarer-a", a.bandId);
    const instrument = await db.memberInstrument.create({
      data: {
        tier: "non_autonome",
        validated: true,
        membership: { connect: { id: declarer.id } },
        pupitre: { connect: { id: a.pupitreId } },
        validatedBy: { connect: { id: validator.id } },
      },
    });

    const cleared = await db.memberInstrument.update({
      where: { id: instrument.id },
      data: { validated: false, validatedById: null, validatedAt: null },
    });

    expect(cleared.validatedById).toBeNull();
    expect(cleared.bandId).toBe(a.bandId);

    await db.memberInstrument.delete({ where: { id: instrument.id } });
  });

  it("scopes a pupitre name to its own band", async () => {
    // Band a already has a "surdo"; a second one in the same band is a duplicate.
    await expectRejectedByDatabase(
      db.pupitre.create({ data: { bandId: a.bandId, name: "surdo" } }),
      "P2002",
      '(`"bandId"`, `name`)',
    );

    // The same name in another band is fine — pupitres are a per-band catalog.
    const elsewhere = await db.pupitre.create({ data: { bandId: b.bandId, name: "surdo" } });
    expect(elsewhere.bandId).toBe(b.bandId);
  });

  describe("pupitre leadership", () => {
    it("lets a pupitre have several leaders, and a member lead several pupitres", async () => {
      // Free cardinality in both directions is the domain requirement here —
      // role-hierarchy.md rules out any model that assumes a fixed shape, and
      // the unique key on (membershipId, pupitreId) must bound duplication
      // only. A dedicated pair of pupitres keeps the counts below independent
      // of what the other cases create.
      const caixa = await db.pupitre.create({ data: { bandId: a.bandId, name: "caixa-leaders" } });
      const repique = await db.pupitre.create({
        data: { bandId: a.bandId, name: "repique-leaders" },
      });
      const one = await createMember("leader-one-a", a.bandId);
      const two = await createMember("leader-two-a", a.bandId);

      const led = await db.pupitreLeader.create({
        data: {
          membership: { connect: { id: one.id } },
          pupitre: { connect: { id: caixa.id } },
        },
        include: { pupitre: true },
      });
      expect(led.bandId).toBe(a.bandId);
      expect(led.pupitre.name).toBe("caixa-leaders");

      await db.pupitreLeader.create({
        data: { membership: { connect: { id: two.id } }, pupitre: { connect: { id: caixa.id } } },
      });
      await db.pupitreLeader.create({
        data: { membership: { connect: { id: one.id } }, pupitre: { connect: { id: repique.id } } },
      });

      expect(await db.pupitreLeader.count({ where: { pupitreId: caixa.id } })).toBe(2);
      expect(await db.pupitreLeader.count({ where: { membershipId: one.id } })).toBe(2);
    });

    it("refuses to record the same member leading the same pupitre twice", async () => {
      const pupitre = await db.pupitre.create({ data: { bandId: a.bandId, name: "surdo-twice" } });
      const member = await createMember("leader-twice-a", a.bandId);
      const data = {
        membership: { connect: { id: member.id } },
        pupitre: { connect: { id: pupitre.id } },
      };

      await db.pupitreLeader.create({ data });
      await expectRejectedByDatabase(
        db.pupitreLeader.create({ data }),
        "P2002",
        '(`"membershipId"`, `"pupitreId"`)',
      );
    });

    it("drops the leadership, not the pupitre, when the leader leaves the band", async () => {
      const pupitre = await db.pupitre.create({ data: { bandId: a.bandId, name: "surdo-leaver" } });
      const leaver = await createMember("leader-leaver-a", a.bandId);
      const led = await db.pupitreLeader.create({
        data: {
          membership: { connect: { id: leaver.id } },
          pupitre: { connect: { id: pupitre.id } },
        },
      });

      await db.membership.delete({ where: { id: leaver.id } });

      expect(await db.pupitreLeader.findUnique({ where: { id: led.id } })).toBeNull();
      expect(await db.pupitre.findUnique({ where: { id: pupitre.id } })).not.toBeNull();
    });

    it("rejects a member leading another band's pupitre", async () => {
      // Unchecked creates, so each case reaches the key it is named after:
      // with nested connects both relations feed the one shared bandId, and
      // whichever the client resolves it from decides which key fires.
      await expectRejectedByDatabase(
        db.pupitreLeader.create({
          data: { bandId: a.bandId, membershipId: a.musicianId, pupitreId: b.pupitreId },
        }),
        "P2003",
        "PupitreLeader_pupitreId_bandId_fkey",
      );

      await expectRejectedByDatabase(
        db.pupitreLeader.create({
          data: { bandId: a.bandId, membershipId: b.musicianId, pupitreId: a.pupitreId },
        }),
        "P2003",
        "PupitreLeader_membershipId_bandId_fkey",
      );
    });
  });

  describe("band scoping is enforced by the database, not just by callers", () => {
    it("rejects an instrument pairing a membership with another band's pupitre", async () => {
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            membership: { connect: { id: a.musicianId } },
            pupitre: { connect: { id: b.pupitreId } },
          },
        }),
        "P2003",
        "MemberInstrument_membershipId_bandId_fkey",
      );
    });

    it("rejects an instrument pairing a pupitre with another band's membership", async () => {
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            membership: { connect: { id: b.musicianId } },
            pupitre: { connect: { id: a.pupitreId } },
          },
        }),
        "P2003",
        "MemberInstrument_membershipId_bandId_fkey",
      );
    });

    it("rejects a validator from another band", async () => {
      const declarer = await createMember("cross-band-validator-a", a.bandId);

      // Built with nested connects, this is caught by the *membership* key
      // rather than the validator's: all three relations share bandId, and
      // Prisma resolves it from the validator's connect — so the row claims
      // band b while its membership is in band a, and
      // MemberInstrument_membershipId_bandId_fkey fires first. Correct
      // outcome, different constraint.
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            validated: true,
            membership: { connect: { id: declarer.id } },
            pupitre: { connect: { id: a.pupitreId } },
            validatedBy: { connect: { id: b.conductorId } },
          },
        }),
        "P2003",
        "MemberInstrument_membershipId_bandId_fkey",
      );

      // Reaching the validator's own key takes an unchecked create, which pins
      // bandId directly instead of letting the validator's connect decide it.
      // This is the case that fails if that key is ever regenerated to a
      // single column.
      await expectRejectedByDatabase(
        db.memberInstrument.create({
          data: {
            tier: "debutant",
            validated: true,
            bandId: a.bandId,
            membershipId: declarer.id,
            pupitreId: a.pupitreId,
            validatedById: b.conductorId,
          },
        }),
        "P2003",
        "MemberInstrument_validatedById_bandId_fkey",
      );
    });
  });
});
