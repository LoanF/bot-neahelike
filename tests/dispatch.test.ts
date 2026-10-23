import { PermissionFlagsBits } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildSettings } from "@/config/store";

/**
 * Aiguillage des commandes et des composants : c'est lui qui contrôle les accès à chaque commande et à chaque clic.
 * Les réglages sont simulés ; le registre est le vrai, avec un module de test.
 */
const GUILD = "100000000000000001";
const OWNER = "300000000000000001";
const OTHER = "300000000000000002";
const BOT = "300000000000000099";

Object.assign(process.env, { DATABASE_URL: "postgresql://localhost/inutilise", DISCORD_BOT_TOKEN: "test", DISCORD_GUILD_ID: GUILD, SITE_URL: "https://example.test" });

let settings: GuildSettings;
vi.mock("@/config/store", () => ({ getSettings: async () => settings }));

const { UserError } = await import("@/core/errors");
const { defineCommand, PERMISSION } = await import("@/core/command");
const { customId, ANYONE } = await import("@/core/components");
const { Registry, setRegistry } = await import("@/core/registry");
const { markUnavailable } = await import("@/core/access");
const { general } = await import("@/modules/general");
const { handleInteraction, handleMessage } = await import("@/core/dispatch");
const { isTracked, trackPanel } = await import("@/core/expiry");

const handled: string[] = [];
let failWith: Error | null = null;

const secret = defineCommand({ name: "secret", description: "Réservée à la gestion", module: "essai", defaultPermission: PERMISSION.gestion, protected: true, run: async ctx => void handled.push(`run:${ctx.user.id}`) });
const fiche = defineCommand({ name: "fichier", description: "Réponse sensible", module: "essai", defaultPermission: PERMISSION.tous, slashOnly: true, run: async () => void handled.push("fichier") });
const absent = defineCommand({ name: "absente", description: "Module sans table", module: "sans-table", defaultPermission: PERMISSION.tous, run: async () => void handled.push("absente") });

setRegistry(
  new Registry([
    general,
    {
      id: "essai",
      label: "Essai",
      icon: "🧪",
      description: "Module de test",
      commands: [secret, fiche],
      components: [
        {
          prefix: "tst",
          command: "secret",
          handle: async (interaction, { action }) => {
            if (failWith) throw failWith;
            if (action === "maj" && interaction.isMessageComponent()) await interaction.update({});
            handled.push(`clic:${action}:${interaction.user.id}`);
          },
        },
        { prefix: "pub", handle: async interaction => void handled.push(`public:${interaction.user.id}`) },
      ],
    },
    { id: "sans-table", label: "Sans table", icon: "📦", description: "Module hors service", commands: [absent], components: [{ prefix: "abs", command: "absente", handle: async () => void handled.push("abs") }] },
  ]),
);
markUnavailable("sans-table", ["bot_absente"]);

function freshSettings(): GuildSettings {
  return {
    guildId: GUILD,
    config: { prefix: "+", embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
    levels: [],
    modules: new Map(),
    commandOverrides: new Map(),
    messages: new Map(),
  } as unknown as GuildSettings;
}

const member = (id: string, manageGuild: boolean) => ({ id, user: { id, tag: `membre-${id}` }, roles: { cache: new Map() }, permissions: { has: (flag: bigint) => manageGuild && (flag === PermissionFlagsBits.ManageGuild || flag === PermissionFlagsBits.Administrator) } });

/** Faux clic sur un composant ; garde la trace des réponses. */
function click(id: string, userId: string, { manageGuild = false, guildId = GUILD } = {}) {
  const replies: { kind: string; payload: { embeds?: { toJSON: () => { description?: string } }[] } }[] = [];
  const interaction = {
    inGuild: () => true,
    inCachedGuild: () => true,
    guildId,
    customId: id,
    user: { id: userId },
    member: member(userId, manageGuild),
    message: { id: "800000000000000001" },
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    isChatInputCommand: () => false,
    isAutocomplete: () => false,
    isMessageComponent: () => true,
    isModalSubmit: () => false,
    isFromMessage: () => false,
    isButton: () => true,
    isRepliable: () => true,
    isCommand: () => false,
    reply: async (payload: never) => void replies.push({ kind: "reply", payload }),
    followUp: async (payload: never) => void replies.push({ kind: "followUp", payload }),
    update: async () => {},
    deleteReply: async () => void replies.push({ kind: "deleteReply", payload: {} }),
    deferUpdate: async () => {
      interaction.deferred = true;
    },
  };
  const text = () => replies.map(item => item.payload.embeds?.[0]?.toJSON().description ?? "").join("\n");
  return { interaction, replies, text };
}

/** Faux message tapé avec le préfixe. */
function typed(content: string, userId: string, manageGuild = false) {
  const events: string[] = [];
  const message = {
    author: { bot: false, id: userId },
    inGuild: () => true,
    guildId: GUILD,
    content,
    client: { user: { id: BOT } },
    member: member(userId, manageGuild),
    guild: { id: GUILD, members: { fetch: async () => member(userId, manageGuild) } },
    channel: { id: "700000000000000001", sendTyping: async () => {}, isSendable: () => true },
    reply: async (payload: { embeds?: { toJSON: () => { description?: string } }[] }) => {
      events.push(`reply:${payload.embeds?.[0]?.toJSON().description ?? ""}`);
      return { delete: async () => void events.push("notice-deleted") };
    },
    delete: async () => void events.push("deleted"),
  };
  return { message, events };
}

beforeEach(() => {
  settings = freshSettings();
  handled.length = 0;
  failWith = null;
});

describe("aiguillage des composants", () => {
  it("refuse le panneau d'un autre membre, sans appeler le gestionnaire", async () => {
    const { interaction, text } = click(customId("tst", OWNER, "go"), OTHER, { manageGuild: true });
    await handleInteraction(interaction as never);
    expect(handled).toEqual([]);
    expect(text()).toContain("appartient à un autre membre");
  });

  it("revérifie l'accès à la commande du panneau à chaque clic", async () => {
    const refused = click(customId("tst", OWNER, "go"), OWNER);
    await handleInteraction(refused.interaction as never);
    expect(handled).toEqual([]);
    expect(refused.replies).toHaveLength(1);

    await handleInteraction(click(customId("tst", OWNER, "go"), OWNER, { manageGuild: true }).interaction as never);
    expect(handled).toEqual([`clic:go:${OWNER}`]);
  });

  it("refuse un clic quand le module est désactivé ou hors service", async () => {
    settings.modules.set("essai", { enabled: false, levelId: null, settings: {} } as never);
    const disabled = click(customId("tst", OWNER, "go"), OWNER, { manageGuild: true });
    await handleInteraction(disabled.interaction as never);
    expect(handled).toEqual([]);
    expect(disabled.text()).toContain("Essai");

    const unavailable = click(customId("abs", OWNER, "go"), OWNER, { manageGuild: true });
    await handleInteraction(unavailable.interaction as never);
    expect(handled).toEqual([]);
    expect(unavailable.text()).toContain("bot_absente");
  });

  it("laisse tout le monde utiliser un composant public", async () => {
    await handleInteraction(click(customId("pub", ANYONE, "ouvrir"), OTHER).interaction as never);
    expect(handled).toEqual([`public:${OTHER}`]);
  });

  it("répond en privé à une erreur prévue, en suite de message si l'interaction a déjà répondu", async () => {
    failWith = new UserError("Ce giveaway est déjà clos.");
    const first = click(customId("tst", OWNER, "go"), OWNER, { manageGuild: true });
    await handleInteraction(first.interaction as never);
    expect(first.replies.map(item => item.kind)).toEqual(["reply"]);
    expect(first.text()).toContain("déjà clos");

    const deferred = click(customId("tst", OWNER, "go"), OWNER, { manageGuild: true });
    deferred.interaction.deferred = true;
    await handleInteraction(deferred.interaction as never);
    expect(deferred.replies.map(item => item.kind)).toEqual(["followUp"]);
  });

  it("ignore une interaction venue d'un autre serveur", async () => {
    const elsewhere = click(customId("tst", OWNER, "go"), OWNER, { manageGuild: true, guildId: "100000000000000999" });
    await handleInteraction(elsewhere.interaction as never);
    expect(handled).toEqual([]);
    expect(elsewhere.replies).toEqual([]);
  });
});

describe("effacement des panneaux", () => {
  it("un clic qui met le panneau à jour repousse l'effacement et donne le nouveau jeton", async () => {
    vi.useFakeTimers();
    try {
      const first: string[] = [];
      trackPanel("800000000000000001", async () => void first.push("ancien jeton"), Date.now() + 15 * 60_000, 10 * 60_000);
      await vi.advanceTimersByTimeAsync(8 * 60_000);
      const later = click(customId("tst", OWNER, "maj"), OWNER, { manageGuild: true });
      await handleInteraction(later.interaction as never);
      await vi.advanceTimersByTimeAsync(9 * 60_000);
      expect(isTracked("800000000000000001")).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(first).toEqual([]);
      expect(later.replies.map(item => item.kind)).toEqual(["deleteReply"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("le réglage « jamais » arrête le suivi au premier clic", async () => {
    vi.useFakeTimers();
    try {
      const closed: string[] = [];
      trackPanel("800000000000000001", async () => void closed.push("effacé"), Number.POSITIVE_INFINITY, 10 * 60_000);
      settings.modules.set("config", { enabled: true, levelId: null, settings: { panneauxMinutes: 0 } } as never);
      await handleInteraction(click(customId("tst", OWNER, "maj"), OWNER, { manageGuild: true }).interaction as never);
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      expect(closed).toEqual([]);
      expect(isTracked("800000000000000001")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("commandes au préfixe", () => {
  it("refuse une commande à qui n'a pas l'accès, et la lance pour qui l'a", async () => {
    const refused = typed("+secret", OTHER);
    await handleMessage(refused.message as never);
    expect(handled).toEqual([]);
    expect(refused.events[0]).toMatch(/^reply:/);

    await handleMessage(typed("+secret", OWNER, true).message as never);
    expect(handled).toEqual([`run:${OWNER}`]);
  });

  it("répond aussi à une mention du bot", async () => {
    await handleMessage(typed(`<@${BOT}> secret`, OWNER, true).message as never);
    expect(handled).toEqual([`run:${OWNER}`]);
  });

  it("n'ouvre pas une commande sensible au préfixe : message retiré, renvoi vers /", async () => {
    vi.useFakeTimers();
    try {
      const { message, events } = typed("+fichier @joueur", OWNER, true);
      await handleMessage(message as never);
      expect(handled).toEqual([]);
      expect(events[0]).toContain("/fichier");
      expect(events).toContain("deleted");
      await vi.advanceTimersByTimeAsync(15_000);
      expect(events).toContain("notice-deleted");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignore les messages sans préfixe et les commandes inconnues", async () => {
    const plain = typed("bonjour", OWNER, true);
    await handleMessage(plain.message as never);
    const unknown = typed("+inconnue", OWNER, true);
    await handleMessage(unknown.message as never);
    expect(handled).toEqual([]);
    expect([...plain.events, ...unknown.events]).toEqual([]);
  });
});
