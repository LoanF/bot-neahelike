import { Events, type Client } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION } from "@/core/command";
import type { BotModule } from "@/core/registry";
import { env } from "@/env";
import { logger } from "@/logger";
import { renderWelcomePanel, welcomePanel } from "./panel";
import { MODULE, welcomeSettings } from "./settings";
import { giveAutoroles, leavePayload, sendTo, welcomeDmPayload, welcomeHandler, welcomePayload } from "./ui";

const accueil = defineCommand({
  name: "accueil",
  description: "Ouvre le panneau de l'accueil : bienvenue, départ, rôles à l'arrivée, règlement et panneaux de rôles.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  async run(ctx) {
    await ctx.reply(renderWelcomePanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }), { private: true });
  },
});

function setup(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;

  client.on(Events.GuildMemberAdd, async member => {
    if (member.guild.id !== guildId || member.user.bot) return;
    try {
      const settings = await getSettings(member.guild.id);
      if (!isModuleEnabled(settings, MODULE)) return;
      const welcome = welcomeSettings(settings);
      await giveAutoroles(member, welcome.autoroles).catch(error => logger.warn({ err: error }, "Autorôle impossible"));
      await sendTo(member.guild, welcome.bienvenueId, welcomePayload(settings, member), member.id);
      // MP fermés : Discord refuse, ce n'est pas une erreur du bot.
      if (welcome.bienvenueMp) await member.send(welcomeDmPayload(settings, member)).catch(() => {});
    } catch (error) {
      logger.error({ err: error }, "Accueil d'un nouveau membre impossible");
    }
  });

  client.on(Events.GuildMemberRemove, async member => {
    if (member.guild.id !== guildId || member.user.bot) return;
    try {
      const settings = await getSettings(member.guild.id);
      if (!isModuleEnabled(settings, MODULE)) return;
      await sendTo(member.guild, welcomeSettings(settings).departId, leavePayload(settings, member));
    } catch (error) {
      logger.error({ err: error }, "Message de départ impossible");
    }
  });
}

export const welcomeModule: BotModule = {
  id: MODULE,
  label: "Accueil",
  icon: "👋",
  description: "Bienvenue et départ, rôles à l'arrivée, règlement à accepter, rôles en libre-service.",
  commands: [accueil],
  components: [welcomePanel, welcomeHandler],
  setup,
  messages: [
    {
      key: "accueil.bienvenue",
      module: MODULE,
      label: "Message de bienvenue",
      defaultContent: "Salut {user}, bienvenue à Néa Hélikè ! Lis le règlement, puis dépose ta candidature sur le portail pour rejoindre la cité.",
    },
    {
      key: "accueil.bienvenue-mp",
      module: MODULE,
      label: "Message privé de bienvenue",
      defaultContent: "Bienvenue sur {server}, {user.name} ! Pour rejoindre la cité, lis le règlement du serveur puis dépose ta candidature sur le portail.",
    },
    {
      key: "accueil.depart",
      module: MODULE,
      label: "Message de départ",
      defaultContent: "**{user.name}** a quitté la cité. Nous sommes désormais {count}.",
    },
    {
      key: "accueil.reglement",
      module: MODULE,
      label: "Texte du règlement",
      defaultContent:
        "1. Respecte chaque membre de la communauté.\n2. Pas de propos haineux, discriminatoires ou à caractère sexuel.\n3. Pas de publicité sans l'accord de l'équipe.\n4. Respecte les salons et leur sujet.\n5. Les décisions de l'équipe s'appliquent ; pour les contester, ouvre un ticket.\n\nEn cliquant sur le bouton ci-dessous, tu acceptes ce règlement.",
    },
  ],
};
