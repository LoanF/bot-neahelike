import { describe, expect, it } from "vitest";
import { EVERYONE, describeWeight, memberWeight, requiredWeight, type PermissionLevel } from "@/core/permissions";

const levels: PermissionLevel[] = [
  { id: "joueur", name: "Joueur", weight: 10, roleIds: ["r-heliken"] },
  { id: "staff", name: "Staff", weight: 50, roleIds: ["r-staff", "r-modo"] },
  { id: "admin", name: "Admin", weight: 100, roleIds: ["r-admin"] },
];

describe("memberWeight", () => {
  it("vaut 0 sans aucun rôle lié", () => {
    expect(memberWeight(levels, ["r-autre"], false)).toBe(EVERYONE);
  });

  it("prend le niveau le plus élevé parmi les rôles du membre", () => {
    expect(memberWeight(levels, ["r-heliken", "r-modo"], false)).toBe(50);
  });

  it("accepte plusieurs rôles pour un même niveau", () => {
    expect(memberWeight(levels, ["r-staff"], false)).toBe(50);
    expect(memberWeight(levels, ["r-modo"], false)).toBe(50);
  });

  it("donne tous les droits aux administrateurs Discord", () => {
    expect(memberWeight(levels, [], true)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("héritage", () => {
  it("un Admin peut utiliser une commande Staff, un Staff une commande Joueur", () => {
    const admin = memberWeight(levels, ["r-admin"], false);
    const staff = memberWeight(levels, ["r-staff"], false);
    expect(admin >= requiredWeight(levels, { defaultWeight: 50 })).toBe(true);
    expect(staff >= requiredWeight(levels, { defaultWeight: 10 })).toBe(true);
    expect(staff >= requiredWeight(levels, { defaultWeight: 100 })).toBe(false);
  });
});

describe("requiredWeight", () => {
  it("utilise la valeur par défaut sans réglage", () => {
    expect(requiredWeight(levels, { defaultWeight: 50 })).toBe(50);
  });

  it("applique le niveau du module", () => {
    expect(requiredWeight(levels, { defaultWeight: 50, moduleLevelId: "admin" })).toBe(100);
  });

  it("le réglage de la commande l'emporte sur le module", () => {
    expect(requiredWeight(levels, { defaultWeight: 50, moduleLevelId: "admin", override: { levelId: "joueur" } })).toBe(10);
  });

  it("ouvre la commande à tous quand le réglage vaut « tout le monde »", () => {
    expect(requiredWeight(levels, { defaultWeight: 50, override: { levelId: null } })).toBe(EVERYONE);
  });

  it("revient à la valeur par défaut si le niveau a été supprimé", () => {
    expect(requiredWeight(levels, { defaultWeight: 50, moduleLevelId: "supprime" })).toBe(50);
  });

  it("n'ouvre jamais une commande protégée à tous", () => {
    expect(requiredWeight(levels, { defaultWeight: 100, protected: true, override: { levelId: null } })).toBe(100);
  });
});

describe("describeWeight", () => {
  it("nomme le niveau correspondant", () => {
    expect(describeWeight(levels, 50)).toBe("Staff");
    expect(describeWeight(levels, EVERYONE)).toBe("Tout le monde");
    expect(describeWeight(levels, 30)).toBe("Staff (poids 30)");
    expect(describeWeight(levels, 500)).toBe("Administrateurs Discord (poids 500)");
  });
});
