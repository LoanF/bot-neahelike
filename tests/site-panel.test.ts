import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";

const settings = (salonLogs?: string) =>
  ({
    guildId: "100000000000000001",
    config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
    modules: new Map(salonLogs ? [["site", { enabled: true, levelId: null, settings: { salonLogs } }]] : []),
    messages: new Map(),
  }) as unknown as GuildSettings;

function components(payload: Payload) {
  return (payload.components ?? []).map(item => item.toJSON().components).flat() as { custom_id?: string; label?: string; url?: string; disabled?: boolean; default_values?: { id: string }[] }[];
}

describe("panneaux du site", async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://localhost/inutilise",
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test",
    DISCORD_ROLE_ATTENTE_WL: "700000000000000001",
    DISCORD_ROLE_WL: "700000000000000002",
  });
  const { candidatureComponents, siteView } = await import("@/modules/site/panel");
  const ranks = { admin: ["710000000000000001"], recruteur: [] };

  it("/site : salon actuel présélectionné, rôles des rangs et du parcours", () => {
    const payload = siteView({ settings: settings("600000000000000001"), owner: "300000000000000001" }, ranks);
    const fields = Object.fromEntries((payload.embeds![0]!.toJSON().fields ?? []).map(field => [field.name, field.value]));
    expect(fields).toMatchObject({ "Salon de logs staff": "<#600000000000000001>", "Rang admin": "<@&710000000000000001>", "Rang recruteur": "*Non configuré*" });
    expect(fields.Parcours).toContain("<@&700000000000000002>");
    const items = components(payload);
    expect(items[0]).toMatchObject({ custom_id: "sit:300000000000000001:salon", default_values: [{ id: "600000000000000001" }] });
    expect(items.find(item => item.label === "Retirer le salon")?.disabled).toBe(false);
    expect(items.find(item => item.label === "Ouvrir le site")?.url).toBe("https://example.test");
    expect(items.find(item => item.label === "Resynchroniser")?.custom_id).toBe("sit:300000000000000001:resync");
  });

  it("/site sans salon : rien de présélectionné, retrait grisé, ligne de confirmation", () => {
    const payload = siteView({ settings: settings(), owner: "300000000000000001", notice: "Salon de logs staff retiré." }, ranks);
    expect(payload.content).toContain("Salon de logs staff retiré.");
    const items = components(payload);
    expect(items[0]!.default_values).toBeUndefined();
    expect(items.find(item => item.label === "Retirer le salon")?.disabled).toBe(true);
  });

  it("/candidature : portail, actualiser et aide ; pas de portail une fois whitelisté", () => {
    const labels = (whitelisted: boolean) => candidatureComponents("300000000000000001", whitelisted).flatMap(item => item.toJSON().components.map(component => ("label" in component ? component.label : "")));
    expect(labels(false)).toEqual(["Ouvrir le portail", "Actualiser", "Comment ça marche"]);
    expect(labels(true)).toEqual(["Actualiser", "Comment ça marche"]);
    const ids = candidatureComponents("300000000000000001", false)[0]!.toJSON().components.flatMap(component => ("custom_id" in component ? [component.custom_id] : []));
    expect(ids).toEqual(["cdt:300000000000000001:actualiser", "cdt:300000000000000001:aide"]);
  });
});
