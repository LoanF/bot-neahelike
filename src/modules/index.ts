import type { BotModule } from "@/core/registry";
import { welcomeModule } from "./accueil";
import { configuration } from "./config";
import { embedsModule } from "./embeds";
import { general } from "./general";
import { giveawaysModule } from "./giveaways";
import { infosModule } from "./infos";
import { logsModule } from "./logs";
import { moderationModule } from "./moderation";
import { channelsModule } from "./salons";
import { serverModule } from "./serveur";
import { siteModule } from "./site";
import { ticketsModule } from "./tickets";

/** Modules chargés au démarrage, dans l'ordre d'affichage de l'aide et du panneau. */
export const modules: BotModule[] = [general, configuration, siteModule, welcomeModule, serverModule, ticketsModule, moderationModule, channelsModule, logsModule, embedsModule, giveawaysModule, infosModule];
