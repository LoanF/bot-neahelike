import { Client, Events, GatewayIntentBits, RESTEvents } from "discord.js";
import { ensureGuild, getSettings } from "@/config/store";
import { handleInteraction, handleMessage } from "@/core/dispatch";
import { getRegistry, Registry, setRegistry } from "@/core/registry";
import { checkDatabase } from "@/db/check";
import { closeDatabase } from "@/db";
import { env } from "@/env";
import { logger } from "@/logger";
import { modules } from "@/modules";
import { applyPresence } from "@/modules/config";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
  ],
  // Jamais de @everyone ou @here involontaire : seuls les membres et rôles mentionnés explicitement.
  allowedMentions: { parse: ["users", "roles"], repliedUser: false },
});

let stopping = false;

/** Arrêt propre : déconnexion de Discord puis fermeture de la base, avec un délai maximal. */
async function shutdown(reason: string, code = 0) {
  if (stopping) return;
  stopping = true;
  logger.info({ reason }, "Arrêt du bot");
  setTimeout(() => {
    logger.error("Arrêt forcé après délai dépassé");
    process.exit(code || 1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
  try {
    await client.destroy();
    await closeDatabase();
  } catch (error) {
    logger.error({ err: error }, "Erreur pendant l'arrêt");
  }
  process.exit(code);
}

function watchConnection() {
  client.on(Events.ShardDisconnect, (event, shard) => logger.warn({ shard, code: event.code }, "Déconnecté de la passerelle Discord"));
  client.on(Events.ShardReconnecting, shard => logger.info({ shard }, "Reconnexion à la passerelle Discord"));
  client.on(Events.ShardResume, (shard, replayed) => logger.info({ shard, replayed }, "Connexion à la passerelle rétablie"));
  client.on(Events.ShardError, (error, shard) => logger.error({ err: error, shard }, "Erreur de la passerelle Discord"));
  client.on(Events.Warn, message => logger.warn(message));
  client.on(Events.Error, error => logger.error({ err: error }, "Erreur du client Discord"));
  // Les limites de débit sont gérées par discord.js (mise en file et attente) : on les journalise seulement.
  client.rest.on(RESTEvents.RateLimited, info =>
    logger.warn({ route: info.route, method: info.method, retryAfter: info.retryAfter, global: info.global }, "Limite de débit Discord atteinte"),
  );
}

async function onReady(ready: Client<true>) {
  const { DISCORD_GUILD_ID } = env();
  const guild = await ready.guilds.fetch(DISCORD_GUILD_ID).catch(() => null);
  if (!guild) {
    logger.fatal({ guild: DISCORD_GUILD_ID }, "Le bot n'est pas sur le serveur indiqué par DISCORD_GUILD_ID : invitez-le puis relancez-le.");
    await shutdown("serveur introuvable", 1);
    return;
  }

  await ensureGuild(guild.id);
  const settings = await getSettings(guild.id);
  const commands = await guild.commands.set(getRegistry().slashCommands());
  applyPresence(ready, settings.config);
  logger.info({ user: ready.user.tag, guild: guild.name, commands: commands.size, prefix: settings.config.prefix }, "Bot prêt");
}

async function main() {
  const { DISCORD_BOT_TOKEN } = env();
  await checkDatabase();

  setRegistry(new Registry(modules));
  for (const module of modules) module.setup?.(client);

  watchConnection();
  client.once(Events.ClientReady, ready => {
    onReady(ready).catch(async error => {
      logger.fatal({ err: error }, "Démarrage impossible");
      await shutdown("échec du démarrage", 1);
    });
  });
  client.on(Events.InteractionCreate, interaction => void handleInteraction(interaction));
  client.on(Events.MessageCreate, message => void handleMessage(message));

  try {
    await client.login(DISCORD_BOT_TOKEN);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "DisallowedIntents") {
      throw new Error(
        "Intents privilégiés refusés : activez « Server Members », « Message Content » et « Presence » dans le portail développeur Discord (onglet Bot).",
        { cause: error },
      );
    }
    if (code === "TokenInvalid") throw new Error("DISCORD_BOT_TOKEN invalide : régénérez le token dans le portail développeur Discord.", { cause: error });
    throw error;
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", error => logger.error({ err: error }, "Promesse rejetée sans traitement"));
process.on("uncaughtException", error => {
  logger.fatal({ err: error }, "Exception non interceptée");
  void shutdown("exception non interceptée", 1);
});

main().catch(async error => {
  logger.fatal({ err: error }, error instanceof Error ? error.message : "Démarrage impossible");
  await shutdown("échec du démarrage", 1);
});
