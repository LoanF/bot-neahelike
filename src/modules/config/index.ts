import type { BotModule } from "@/core/registry";
import { acces, config, couleur, message, module, permission, prefixe, profil } from "./commands";
import { configPanel } from "./panel";

export const configuration: BotModule = {
  id: "config",
  label: "Configuration",
  icon: "⚙️",
  description: "Préfixe, modules, accès, profil du bot et messages.",
  locked: true,
  commands: [config, prefixe, couleur, module, acces, permission, profil, message],
  components: [configPanel],
};

export { applyPresence } from "./profile";
