import { Events, type Client, type Guild } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION } from "@/core/command";
import { UserError } from "@/core/errors";
import type { BotModule } from "@/core/registry";
import { env } from "@/env";
import { logger } from "@/logger";
import { cleanTemporaries, handleVoice, lastFivemStatus, reconcileAllSupport, reconcileSupport, refreshFivem, statusPayload, updateCounters, updateStatusMessage } from "./live";
import { renderServerPanel, serverPanel } from "./panel";
import { MODULE, serverSettings } from "./settings";
import { soutien } from "./support";

/** Statut FiveM : une minute. Compteurs : dix minutes (limite de renommage de Discord). Soutien : quinze minutes. */
const STATUS_EVERY_MS = 60 * 1000;
const COUNTERS_EVERY_MS = 10 * 60 * 1000;
const SUPPORT_EVERY_MS = 15 * 60 * 1000;

const serveur = defineCommand({
  name: "serveur",
  description: "Ouvre le panneau de la vie du serveur : statut FiveM, compteurs, rôle soutien, vocaux temporaires.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  async run(ctx) {
    await ctx.reply(renderServerPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }), { private: true });
  },
});

const statut = defineCommand({
  name: "statut",
  description: "État du serveur FiveM : en ligne ou non, nombre de joueurs.",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  async run(ctx) {
    const server = serverSettings(ctx.settings);
    if (!server.fivemAdresse) throw new UserError("Le statut du serveur FiveM n'est pas encore configuré.");
    await ctx.defer();
    // Statut de moins d'une minute réutilisé, pour ne pas solliciter le serveur à chaque commande.
    const known = lastFivemStatus();
    const status = known && Date.now() - known.checkedAt.getTime() < STATUS_EVERY_MS ? known : await refreshFivem(server);
    await ctx.reply(statusPayload(ctx.settings, server, status, ctx.guild.name));
  },
});

/** Lance une tâche périodique du module ; une erreur est journalisée et la boucle continue. */
function every(guild: Guild, ms: number, label: string, task: (server: ReturnType<typeof serverSettings>, settings: Awaited<ReturnType<typeof getSettings>>) => Promise<unknown>) {
  const run = async () => {
    try {
      const settings = await getSettings(guild.id);
      if (isModuleEnabled(settings, MODULE)) await task(serverSettings(settings), settings);
    } catch (error) {
      logger.error({ err: error }, `${label} impossible`);
    }
  };
  setInterval(() => void run(), ms).unref();
  return run;
}

function setup(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;

  client.on(Events.VoiceStateUpdate, (before, after) => {
    if (after.guild.id !== guildId) return;
    handleVoice(before, after).catch(error => logger.error({ err: error }, "Vocal temporaire impossible"));
  });

  const support = async (memberId: string, presence?: Parameters<typeof reconcileSupport>[2]) => {
    const guild = client.guilds.cache.get(guildId);
    const member = guild?.members.cache.get(memberId);
    if (!guild || !member) return;
    const settings = await getSettings(guild.id);
    if (isModuleEnabled(settings, MODULE)) await reconcileSupport(member, serverSettings(settings), presence);
  };
  client.on(Events.PresenceUpdate, (_, presence) => {
    if (presence.guild?.id === guildId && presence.userId) support(presence.userId, presence).catch(error => logger.warn({ err: error }, "Rôle soutien impossible"));
  });
  // Tag du serveur affiché ou retiré sur le profil.
  client.on(Events.UserUpdate, (_, user) => {
    support(user.id).catch(error => logger.warn({ err: error }, "Rôle soutien impossible"));
  });
}

async function onReady(guild: Guild) {
  // Tous les membres en cache : compteur des citoyens et rôle soutien justes dès le démarrage.
  await guild.members.fetch().catch(error => logger.warn({ err: error }, "Chargement des membres impossible"));
  const settings = await getSettings(guild.id);
  await cleanTemporaries(guild, settings).catch(error => logger.warn({ err: error }, "Nettoyage des vocaux temporaires impossible"));

  const status = every(guild, STATUS_EVERY_MS, "Statut FiveM", async (server, current) => {
    if (!server.fivemAdresse) return;
    await refreshFivem(server);
    await updateStatusMessage(guild, current, server);
  });
  const counters = every(guild, COUNTERS_EVERY_MS, "Mise à jour des compteurs", server => updateCounters(guild, server));
  const supportCheck = every(guild, SUPPORT_EVERY_MS, "Vérification du rôle soutien", server => reconcileAllSupport(guild, server));
  // Statut d'abord : le compteur des joueurs en dépend.
  await status();
  await counters();
  await supportCheck();
}

export const serverModule: BotModule = {
  id: MODULE,
  label: "Vie du serveur",
  icon: "🎮",
  description: "Statut du serveur FiveM, salons compteurs, rôle soutien et vocaux temporaires.",
  commands: [serveur, statut, soutien],
  components: [serverPanel],
  setup,
  onReady,
};
