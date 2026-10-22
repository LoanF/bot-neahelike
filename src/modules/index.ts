import type { BotModule } from "@/core/registry";
import { welcomeModule } from "./accueil";
import { configuration } from "./config";
import { embedsModule } from "./embeds";
import { general } from "./general";
import { giveawaysModule } from "./giveaways";
import { logsModule } from "./logs";
import { serverModule } from "./serveur";
import { siteModule } from "./site";
import { ticketsModule } from "./tickets";

/** Modules chargés au démarrage, dans l'ordre d'affichage de l'aide et du panneau. */
export const modules: BotModule[] = [general, configuration, siteModule, welcomeModule, serverModule, ticketsModule, logsModule, embedsModule, giveawaysModule];
