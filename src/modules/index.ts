import type { BotModule } from "@/core/registry";
import { configuration } from "./config";
import { embedsModule } from "./embeds";
import { general } from "./general";
import { logsModule } from "./logs";
import { siteModule } from "./site";
import { ticketsModule } from "./tickets";

/** Modules chargés au démarrage, dans l'ordre d'affichage de l'aide et du panneau. */
export const modules: BotModule[] = [general, configuration, siteModule, ticketsModule, logsModule, embedsModule];
