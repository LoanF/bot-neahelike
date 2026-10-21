import { defineCommand, PERMISSION } from "@/core/command";
import type { BotModule } from "@/core/registry";
import { setupLogs } from "./events";
import { logsPanel, renderLogsPanel } from "./panel";
import { MODULE } from "./settings";

const logs = defineCommand({
  name: "logs",
  description: "Ouvre le panneau des logs : quel salon reçoit quel type de log.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  async run(ctx) {
    await ctx.reply(renderLogsPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }, "accueil"), { private: true });
  },
});

export const logsModule: BotModule = {
  id: MODULE,
  label: "Logs",
  icon: "📜",
  description: "Journal du serveur : messages, membres, modération, vocal, salons et rôles, chacun dans le salon de votre choix.",
  commands: [logs],
  components: [logsPanel],
  setup: setupLogs,
};
