import { Events, type Client } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION } from "@/core/command";
import type { BotModule } from "@/core/registry";
import { env } from "@/env";
import { logger } from "@/logger";
import { enforceBlacklist } from "./actions";
import { MODULE } from "./logic";
import { blacklistPanel, openBlacklistPanel } from "./panel";

const blacklist = defineCommand({
  name: "blacklist",
  aliases: ["bl"],
  description: "Ouvre le panneau de la blacklist partagée avec le site : blacklister, voir la liste, lever.",
  module: MODULE,
  defaultPermission: PERMISSION.bannissement,
  protected: true,
  async run(ctx) {
    await ctx.reply(await openBlacklistPanel(ctx.settings, ctx.guild, ctx.user.id), { private: true });
  },
});

function setup(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;
  client.on(Events.GuildMemberAdd, async member => {
    if (member.guild.id !== guildId || member.user.bot) return;
    try {
      const settings = await getSettings(member.guild.id);
      if (!isModuleEnabled(settings, MODULE)) return;
      if (await enforceBlacklist(member.guild, member.id)) logger.info({ user: member.id }, "Blacklisté revenu sur le serveur : banni de nouveau");
    } catch (error) {
      logger.error({ err: error }, "Vérification de la blacklist à l'arrivée impossible");
    }
  });
}

export const blacklistModule: BotModule = {
  id: MODULE,
  label: "Blacklist",
  icon: "⛔",
  description: "Blacklist partagée avec le site : bannit du serveur et bloque le site ; un blacklisté qui revient est banni de nouveau.",
  tables: ["blacklist", "users", "events"],
  commands: [blacklist],
  components: [blacklistPanel],
  setup,
};
