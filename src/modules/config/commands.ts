import { defineCommand, PERMISSION } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { renderPanel } from "./panel";

const MODULE = "config";

/** Les commandes de configuration demandent « Gérer le serveur » par défaut et ne peuvent jamais être ouvertes à tous. */
const base = { module: MODULE, defaultPermission: PERMISSION.gestion, protected: true } as const;

const view = (ctx: CommandContext) => ({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id });

export const config = defineCommand({
  ...base,
  name: "config",
  description: "Ouvre le panneau de configuration du bot.",
  aliases: ["settings", "parametres"],
  async run(ctx) {
    await ctx.reply(renderPanel(view(ctx), "accueil"), { private: true });
  },
});

/** Raccourci : ouvre le panneau de configuration directement sur une page. */
function shortcut(name: string, page: string, description: string, aliases: string[]) {
  return defineCommand({
    ...base,
    name,
    description,
    aliases,
    async run(ctx) {
      await ctx.reply(renderPanel(view(ctx), page), { private: true });
    },
  });
}

export const prefixe = shortcut("prefixe", "general", "Ouvre le panneau : préfixe des commandes et couleurs des embeds.", ["prefix"]);
export const couleur = shortcut("couleur", "general", "Ouvre le panneau : couleurs des embeds et préfixe des commandes.", ["color", "couleurs"]);
export const module = shortcut("module", "modules", "Ouvre le panneau des modules : activer, désactiver, réserver à un accès.", ["modules"]);
export const acces = shortcut("acces", "acces", "Ouvre le panneau des accès : créer, ordonner, renommer, lier aux rôles.", ["niveau", "niveaux", "access"]);
export const permission = shortcut("permission", "commandes", "Ouvre le panneau des commandes : qui peut utiliser chacune.", ["perm", "permissions"]);
export const profil = shortcut("profil", "profil", "Ouvre le panneau du profil du bot : pseudo, bio, images, statut, activité.", ["profile"]);
export const message = shortcut("message", "messages", "Ouvre le panneau des messages du bot : voir, modifier, essayer, rétablir.", ["messages"]);
