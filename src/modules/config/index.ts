import type { BotModule } from "@/core/registry";
import { config, couleur, message, module, niveau, permission, prefixe, profil } from "./commands";
import { configPanel } from "./panel";

export const configuration: BotModule = {
  id: "config",
  label: "Configuration",
  description: "Préfixe, modules, niveaux de permission, profil du bot et messages.",
  locked: true,
  commands: [config, prefixe, couleur, module, niveau, permission, profil, message],
  components: [configPanel],
};

export { applyPresence } from "./profile";
