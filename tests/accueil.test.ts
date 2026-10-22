import type { Guild } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { Registry, setRegistry } from "@/core/registry";
import { modules } from "@/modules";
import { renderWelcomePanel } from "@/modules/accueil/panel";
import { applyMenuChoice, MAX_PANEL_ROLES, roleProblem, toggleRole, welcomeSettings, type RolePanel } from "@/modules/accueil/settings";
import { describeChange, leavePayload, rolePanelPayload, rulesPayload, welcomePayload } from "@/modules/accueil/ui";

setRegistry(new Registry(modules));

const GUILD = "100000000000000001";
const role = (n: number) => `20000000000000000${n}`.slice(0, 18);

function settingsWith(welcome: unknown, messages: [string, string][] = []) {
  return {
    guildId: GUILD,
    config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
    levels: [],
    modules: new Map([["accueil", { enabled: true, levelId: null, settings: welcome }]]),
    commandOverrides: new Map(),
    messages: new Map(messages),
  } as unknown as GuildSettings;
}

const guild = {
  id: GUILD,
  name: "Néa Hélikè",
  channels: { cache: new Map() },
  roles: { cache: new Map([[role(1), { name: "Annonces" }]]) },
} as unknown as Guild;

function checkLimits(payload: Payload) {
  const rows = (payload.components ?? []).map(row => row.toJSON().components);
  const ids = rows.flat().map(component => ("custom_id" in component ? component.custom_id : ""));
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
  expect(rows.length).toBeLessThanOrEqual(5);
  for (const row of rows) expect(row.length).toBeLessThanOrEqual(5);
}

const panel = (patch: Partial<RolePanel> = {}): RolePanel => ({ id: "p1", title: "Notifications", description: "", style: "boutons", unique: false, roleIds: [role(1), role(2), role(3)], ...patch });

describe("rôles distribuables", () => {
  const base = { id: role(5), name: "Annonces", managed: false, position: 3, permissions: { bitfield: 0n } };

  it("accepte un rôle simple placé sous le bot", () => {
    expect(roleProblem(base, GUILD, 10)).toBeNull();
  });

  it("refuse @everyone, les rôles gérés, ceux au-dessus du bot et ceux qui donnent du pouvoir", () => {
    expect(roleProblem({ ...base, id: GUILD }, GUILD, 10)).toContain("@everyone");
    expect(roleProblem({ ...base, managed: true }, GUILD, 10)).toContain("intégration");
    expect(roleProblem({ ...base, position: 10 }, GUILD, 10)).toContain("au-dessus");
    expect(roleProblem({ ...base, permissions: { bitfield: PermissionFlagsBits.Administrator } }, GUILD, 10)).toContain("modération");
    expect(roleProblem({ ...base, permissions: { bitfield: PermissionFlagsBits.BanMembers } }, GUILD, 10)).toContain("modération");
    expect(roleProblem({ ...base, permissions: { bitfield: PermissionFlagsBits.SendMessages | PermissionFlagsBits.Connect } }, GUILD, 10)).toBeNull();
  });
});

describe("prise et rendu des rôles", () => {
  it("un bouton ajoute le rôle, ou le retire s'il est déjà porté", () => {
    expect(toggleRole(panel(), [], role(1))).toEqual({ add: [role(1)], remove: [] });
    expect(toggleRole(panel(), [role(1)], role(1))).toEqual({ add: [], remove: [role(1)] });
    expect(toggleRole(panel(), [role(2)], role(1))).toEqual({ add: [role(1)], remove: [] });
  });

  it("en mode un seul rôle, prendre un rôle rend les autres du panneau, pas ceux d'ailleurs", () => {
    expect(toggleRole(panel({ unique: true }), [role(2), role(3), "autre"], role(1))).toEqual({ add: [role(1)], remove: [role(2), role(3)] });
  });

  it("le menu reflète exactement le choix, en ignorant les rôles étrangers au panneau", () => {
    expect(applyMenuChoice(panel(), [role(1), "autre"], [role(2), role(3), "intrus"])).toEqual({ add: [role(2), role(3)], remove: [role(1)] });
    expect(applyMenuChoice(panel(), [role(1)], [])).toEqual({ add: [], remove: [role(1)] });
    expect(applyMenuChoice(panel({ unique: true }), [], [role(1), role(2)])).toEqual({ add: [role(1)], remove: [] });
  });

  it("résume le changement pour le membre", () => {
    expect(describeChange({ add: [role(1)], remove: [role(2)] })).toBe(`➕ <@&${role(1)}>\n➖ <@&${role(2)}>`);
    expect(describeChange({ add: [], remove: [] })).toBe("Rien n'a changé.");
  });
});

describe("réglages de l'accueil", () => {
  it("ignore des réglages invalides plutôt que de bloquer", () => {
    expect(welcomeSettings(settingsWith({ autoroles: "pas une liste" }))).toEqual({ autoroles: [], panneaux: [] });
  });

  it("lit les panneaux enregistrés", () => {
    expect(welcomeSettings(settingsWith({ panneaux: [panel()] })).panneaux[0]?.title).toBe("Notifications");
  });
});

describe("messages publics", () => {
  const member = { id: "300000000000000001", displayName: "Kallias", user: { username: "kallias", displayAvatarURL: () => "https://cdn.example/a.png" }, guild: { name: "Néa Hélikè", memberCount: 42 } };

  it("remplit le message de bienvenue et mentionne le membre", () => {
    const payload = welcomePayload(settingsWith({}, [["accueil.bienvenue", "Salut {user}, tu es le {count}ᵉ sur {server}."]]), member);
    expect(payload.content).toBe("<@300000000000000001>");
    expect(payload.embeds![0]!.toJSON().description).toBe("Salut <@300000000000000001>, tu es le 42ᵉ sur Néa Hélikè.");
  });

  it("utilise le nom affiché au départ", () => {
    expect(leavePayload(settingsWith({}), member).embeds![0]!.toJSON().description).toContain("**Kallias** a quitté la cité");
  });

  it("met un bouton d'acceptation sous le règlement", () => {
    const payload = rulesPayload(settingsWith({}), guild);
    checkLimits(payload);
    expect(payload.components![0]!.toJSON().components[0]).toMatchObject({ custom_id: "acr:*:reglement" });
  });

  it("présente un panneau en boutons, 5 par rangée, jusqu'au maximum", () => {
    const roleIds = Array.from({ length: MAX_PANEL_ROLES }, (_, index) => `2${String(index).padStart(17, "0")}`);
    const payload = rolePanelPayload(settingsWith({}), panel({ roleIds }), () => "Rôle");
    checkLimits(payload);
    expect(payload.components).toHaveLength(5);
  });

  it("présente un panneau en menu, limité à un choix en mode un seul rôle", () => {
    const payload = rolePanelPayload(settingsWith({}), panel({ style: "menu", unique: true }), () => "Rôle");
    checkLimits(payload);
    expect(payload.components![0]!.toJSON().components[0]).toMatchObject({ custom_id: "acr:*:menu:p1", min_values: 0, max_values: 1 });
  });

  it("n'affiche aucun composant pour un panneau vide", () => {
    expect(rolePanelPayload(settingsWith({}), panel({ roleIds: [] }), () => "Rôle").components).toHaveLength(0);
  });
});

describe("panneau de configuration de l'accueil", () => {
  const view = { settings: settingsWith({ panneaux: [panel()] }), guild, owner: "300000000000000001" };

  it.each(["accueil", "messages", "roles", "panneaux", "panneau:p1", "suppr:p1", "publier:reglement", "publier:p1"])("la vue %s respecte les limites de Discord", target => {
    checkLimits(renderWelcomePanel(view, target));
  });

  it("résume l'accueil désactivé par défaut", () => {
    const fields = renderWelcomePanel({ ...view, settings: settingsWith({}) }).embeds![0]!.toJSON().fields ?? [];
    expect(fields.find(field => field.name === "Bienvenue")?.value).toBe("*Désactivé*");
  });
});
