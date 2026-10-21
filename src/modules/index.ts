import type { BotModule } from "@/core/registry";
import { configuration } from "./config";
import { general } from "./general";
import { siteModule } from "./site";

/** Modules chargés au démarrage, dans l'ordre d'affichage de l'aide et du panneau. */
export const modules: BotModule[] = [general, configuration, siteModule];
