import { describe, expect, it } from "vitest";
import { journeyFromRoles } from "@/modules/site/ranks";

const roles = { aspirant: "aspirant", helikeen: "helikeen" };

describe("journeyFromRoles", () => {
  it("lit l'étape du parcours whitelist, le rôle de citoyen l'emportant", () => {
    expect(journeyFromRoles(["helikeen", "aspirant"], roles)).toBe("whiteliste");
    expect(journeyFromRoles(["aspirant"], roles)).toBe("attente-vocal");
    expect(journeyFromRoles(["autre"], roles)).toBe("aucune");
    expect(journeyFromRoles(["aspirant"], {})).toBe("aucune");
  });
});
