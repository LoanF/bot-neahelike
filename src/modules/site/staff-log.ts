import type { EmbedBuilder, Guild } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { logger } from "@/logger";
import { MODULE, siteSettings } from "./settings";

/** Publie dans le salon de logs staff, s'il est configuré. Un échec est journalisé sans interrompre le traitement. */
export async function staffLog(guild: Guild, build: (settings: Awaited<ReturnType<typeof getSettings>>) => EmbedBuilder) {
  try {
    const settings = await getSettings(guild.id);
    const channelId = siteSettings(settings).salonLogs;
    if (!channelId || !isModuleEnabled(settings, MODULE)) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) {
      logger.warn({ channel: channelId }, "Salon de logs staff introuvable ou inaccessible");
      return;
    }
    await channel.send({ embeds: [build(settings)], allowedMentions: { parse: [] } });
  } catch (error) {
    logger.error({ err: error }, "Envoi impossible dans le salon de logs staff");
  }
}
