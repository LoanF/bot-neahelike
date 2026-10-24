import type { EmbedBuilder, Guild } from "discord.js";
import type { Row } from "@/core/panels";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { logger } from "@/logger";
import { MODULE, siteSettings } from "./settings";

/** `envoye` : publié ; `ignore` : pas de salon ou module coupé ; `echec` : le salon ne l'a pas reçu. */
export type StaffLogResult = "envoye" | "ignore" | "echec";

/** Publie dans le salon de logs staff, s'il est configuré. Un échec est journalisé et renvoyé, sans lever d'erreur. */
export async function staffLog(guild: Guild, build: (settings: Awaited<ReturnType<typeof getSettings>>) => EmbedBuilder, components: Row[] = []): Promise<StaffLogResult> {
  try {
    const settings = await getSettings(guild.id);
    const channelId = siteSettings(settings).salonLogs;
    if (!channelId || !isModuleEnabled(settings, MODULE)) return "ignore";
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) {
      logger.warn({ channel: channelId }, "Salon de logs staff introuvable ou inaccessible");
      return "echec";
    }
    await channel.send({ embeds: [build(settings)], components, allowedMentions: { parse: [] } });
    return "envoye";
  } catch (error) {
    logger.error({ err: error }, "Envoi impossible dans le salon de logs staff");
    return "echec";
  }
}
