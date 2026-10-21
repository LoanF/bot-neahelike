import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  allows,
  describeResolved,
  ladder,
  memberWeight,
  move,
  resolveRequirement,
  weightsFor,
  type MemberAccess,
  type PermissionLevel,
} from "@/core/permissions";

const levels: PermissionLevel[] = [
  { id: "joueur", name: "Joueur", weight: 10, roleIds: ["r-heliken"] },
  { id: "staff", name: "Staff", weight: 50, roleIds: ["r-staff", "r-modo"] },
  { id: "admin", name: "Admin", weight: 100, roleIds: ["r-admin"] },
];

const MANAGE = PermissionFlagsBits.ManageGuild;

function member(roles: string[], permissions: bigint[] = [], administrator = false): MemberAccess {
  return { weight: memberWeight(levels, roles), administrator, hasPermission: permission => permissions.includes(permission) };
}

describe("memberWeight", () => {
  it("vaut 0 sans aucun rôle lié", () => {
    expect(memberWeight(levels, ["r-autre"])).toBe(0);
  });

  it("prend l'accès le plus haut parmi les rôles du membre, plusieurs rôles par accès", () => {
    expect(memberWeight(levels, ["r-heliken", "r-modo"])).toBe(50);
    expect(memberWeight(levels, ["r-staff"])).toBe(50);
  });
});

describe("resolveRequirement", () => {
  it("demande la permission Discord par défaut sans réglage", () => {
    expect(resolveRequirement(levels, { defaultPermission: MANAGE })).toEqual({ kind: "permission", permission: MANAGE });
    expect(resolveRequirement(levels, { defaultPermission: null })).toEqual({ kind: "everyone" });
  });

  it("applique l'accès du module, puis celui de la commande en priorité", () => {
    expect(resolveRequirement(levels, { defaultPermission: MANAGE, moduleLevelId: "admin" })).toMatchObject({ kind: "level", level: { id: "admin" } });
    expect(resolveRequirement(levels, { defaultPermission: MANAGE, moduleLevelId: "admin", override: { levelId: "joueur" } })).toMatchObject({
      kind: "level",
      level: { id: "joueur" },
    });
  });

  it("ouvre à tous, sauf une commande protégée qui garde sa permission par défaut", () => {
    expect(resolveRequirement(levels, { defaultPermission: MANAGE, override: { levelId: null } })).toEqual({ kind: "everyone" });
    expect(resolveRequirement(levels, { defaultPermission: MANAGE, protected: true, override: { levelId: null } })).toEqual({
      kind: "permission",
      permission: MANAGE,
    });
  });

  it("ignore un accès supprimé", () => {
    expect(resolveRequirement(levels, { defaultPermission: MANAGE, moduleLevelId: "disparu", override: { levelId: "disparu" } })).toEqual({
      kind: "permission",
      permission: MANAGE,
    });
  });
});

describe("allows", () => {
  const staffOnly = resolveRequirement(levels, { defaultPermission: MANAGE, override: { levelId: "staff" } });

  it("un accès supérieur hérite des droits des accès inférieurs", () => {
    expect(allows(staffOnly, member(["r-admin"]))).toBe(true);
    expect(allows(staffOnly, member(["r-modo"]))).toBe(true);
    expect(allows(staffOnly, member(["r-heliken"]))).toBe(false);
  });

  it("suit la permission Discord quand aucun accès n'est réglé", () => {
    const byDefault = resolveRequirement(levels, { defaultPermission: MANAGE });
    expect(allows(byDefault, member([], [MANAGE]))).toBe(true);
    expect(allows(byDefault, member(["r-admin"]))).toBe(false);
  });

  it("laisse toujours passer les administrateurs Discord", () => {
    expect(allows(staffOnly, member([], [], true))).toBe(true);
  });
});

describe("describeResolved", () => {
  it("écrit l'exigence en clair", () => {
    expect(describeResolved({ kind: "everyone" })).toBe("Tout le monde");
    expect(describeResolved({ kind: "level", level: levels[1]! })).toBe("Accès Staff et au-dessus");
    expect(describeResolved({ kind: "permission", permission: MANAGE })).toBe("Permission Discord « Gérer le serveur »");
  });
});

describe("échelle des accès", () => {
  it("se lit du plus haut au plus bas", () => {
    expect(ladder(levels).map(level => level.name)).toEqual(["Admin", "Staff", "Joueur"]);
  });

  it("monte et descend d'un cran, sans sortir de l'échelle", () => {
    const order = ["admin", "staff", "joueur"];
    expect(move(order, "joueur", "monter")).toEqual(["admin", "joueur", "staff"]);
    expect(move(order, "admin", "descendre")).toEqual(["staff", "admin", "joueur"]);
    expect(move(order, "admin", "monter")).toEqual(order);
    expect(move(order, "joueur", "descendre")).toEqual(order);
  });

  it("renumérote les poids en gardant l'ordre", () => {
    expect([...weightsFor(["a", "b", "c"]).entries()]).toEqual([
      ["a", 30],
      ["b", 20],
      ["c", 10],
    ]);
  });
});
