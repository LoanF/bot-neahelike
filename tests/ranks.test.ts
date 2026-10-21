import { describe, expect, it } from "vitest";
import { journeyFromRoles, rankFromRoles } from "@/modules/site/ranks";

const ranks = { staff: ["conseiller", "technopoios"], recruteur: ["epistate"] };

describe("rankFromRoles", () => {
  it("un seul rôle de la liste staff suffit", () => {
    expect(rankFromRoles(["technopoios"], ranks)).toBe("staff");
    expect(rankFromRoles(["conseiller", "autre"], ranks)).toBe("staff");
  });

  it("staff l'emporte sur recruteur", () => {
    expect(rankFromRoles(["epistate", "conseiller"], ranks)).toBe("staff");
  });

  it("recruteur, sinon joueur", () => {
    expect(rankFromRoles(["epistate"], ranks)).toBe("recruteur");
    expect(rankFromRoles(["autre"], ranks)).toBe("joueur");
    expect(rankFromRoles([], ranks)).toBe("joueur");
  });
});

describe("journeyFromRoles", () => {
  const roles = { aspirant: "attente-wl", helikeen: "magistrat" };

  it("lit l'étape du parcours", () => {
    expect(journeyFromRoles(["magistrat"], roles)).toBe("whiteliste");
    expect(journeyFromRoles(["attente-wl"], roles)).toBe("attente-vocal");
    expect(journeyFromRoles(["magistrat", "attente-wl"], roles)).toBe("whiteliste");
    expect(journeyFromRoles([], roles)).toBe("aucune");
  });

  it("ignore les rôles non configurés", () => {
    expect(journeyFromRoles(["attente-wl"], {})).toBe("aucune");
  });
});
