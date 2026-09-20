import { afterAll, describe, expect, it } from "vitest";
import { db } from "./db.js";

// Proves the Layer 1 migration (BAT-38) is actually applied and that the
// generated client round-trips it: the band-scoped chain
// Band -> Membership -> MemberInstrument -> Pupitre, plus the two distinct
// Membership relations MemberInstrument carries (declared by / validated by).
// This replaces the placeholder round trip BAT-23's hello handler used to do.
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("Layer 1 schema", () => {
  afterAll(async () => {
    // Everything below cascades from these two roots.
    await db.band.deleteMany({ where: { name: `Test band ${suffix}` } });
    await db.user.deleteMany({ where: { email: { endsWith: `${suffix}.test` } } });
    await db.$disconnect();
  });

  it("round-trips a band, its members and their declared instruments", async () => {
    const band = await db.band.create({
      data: {
        name: `Test band ${suffix}`,
        decisionRuleTemplateType: "hierarchical",
        pupitres: { create: { name: "surdo" } },
        inviteCodes: { create: { code: `invite-${suffix}` } },
      },
      include: { pupitres: true, inviteCodes: true },
    });

    const pupitre = band.pupitres.at(0);
    if (!pupitre) {
      throw new Error("expected the nested pupitre create to have returned a row");
    }
    expect(band.inviteCodes).toHaveLength(1);

    const conductor = await db.membership.create({
      data: {
        band: { connect: { id: band.id } },
        user: {
          create: {
            clerkUserId: `user_conductor_${suffix}`,
            name: "Conductor",
            email: `conductor@${suffix}.test`,
          },
        },
        groupRoles: { create: { type: "conductor" } },
      },
      include: { groupRoles: true },
    });

    expect(conductor.groupRoles.map((role) => role.type)).toEqual(["conductor"]);

    const musician = await db.membership.create({
      data: {
        band: { connect: { id: band.id } },
        user: {
          create: {
            clerkUserId: `user_musician_${suffix}`,
            name: "Musician",
            email: `musician@${suffix}.test`,
          },
        },
        memberInstruments: {
          create: {
            pupitre: { connect: { id: pupitre.id } },
            tier: "debutant",
            validated: true,
            validatedAt: new Date(),
            validatedBy: { connect: { id: conductor.id } },
          },
        },
      },
      include: { memberInstruments: { include: { pupitre: true, validatedBy: true } } },
    });

    const instrument = musician.memberInstruments.at(0);
    expect(instrument?.tier).toBe("debutant");
    expect(instrument?.pupitre.name).toBe("surdo");
    expect(instrument?.validatedBy?.id).toBe(conductor.id);
  });

  it("scopes a pupitre name to its own band", async () => {
    const band = await db.band.findFirstOrThrow({ where: { name: `Test band ${suffix}` } });

    await expect(db.pupitre.create({ data: { bandId: band.id, name: "surdo" } })).rejects.toThrow();
  });
});
