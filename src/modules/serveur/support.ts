import { defineCommand, PERMISSION, type Choice } from "@/core/command";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { roleProblem } from "@/modules/accueil/settings";
import { reconcileAllSupport } from "./live";
import { addSupportText, MAX_SUPPORT_TEXTS, MODULE, normalizeStatus, removeSupportText, saveServerSettings, serverSettings, SUPPORT_TEXT_MAX, type ServerSettings } from "./settings";

/** Résumé des réglages du rôle soutien. */
export function supportSummary(server: ServerSettings): string {
  const texts = server.soutienTextes ?? [];
  return [
    `**Rôle :** ${server.soutienRoleId ? `<@&${server.soutienRoleId}>` : "*aucun : rien n'est distribué*"}`,
    `**Tag du serveur :** ${server.soutienTag ? "compté" : "ignoré"}`,
    `**Textes autorisés dans le statut (${texts.length} sur ${MAX_SUPPORT_TEXTS}) :**`,
    texts.map(text => `• \`${text.replace(/`/g, "'")}\``).join("\n") || "*Aucun*",
  ].join("\n");
}

/** Textes proposés pendant la saisie de `/soutien retirer`. */
export function textChoices(server: ServerSettings, query: string): Choice[] {
  const wanted = normalizeStatus(query);
  return (server.soutienTextes ?? [])
    .filter(text => normalizeStatus(text).includes(wanted))
    .slice(0, 25)
    .map(text => ({ name: text.slice(0, 100), value: text }));
}

export const soutien = defineCommand({
  name: "soutien",
  description: "Règle le rôle soutien : rôle donné, tag du serveur et textes autorisés dans le statut.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  subcommands: [
    { name: "voir", description: "Affiche le rôle, le tag et les textes autorisés" },
    {
      name: "role",
      description: "Rôle donné aux soutiens (vide pour arrêter la distribution)",
      options: [{ name: "role", description: "Rôle soutien", type: "role" }],
    },
    {
      name: "tag",
      description: "Compter ou non le tag du serveur affiché sur le profil",
      options: [{ name: "actif", description: "Le tag du serveur donne le rôle", type: "boolean", required: true }],
    },
    {
      name: "ajouter",
      description: "Ajoute un texte qui, présent dans le statut, donne le rôle (lien du Discord, nom du serveur…)",
      options: [{ name: "texte", description: "Texte à chercher dans le statut personnalisé", type: "string", required: true, maxLength: SUPPORT_TEXT_MAX, rest: true }],
    },
    {
      name: "retirer",
      description: "Retire un texte autorisé",
      options: [
        {
          name: "texte",
          description: "Texte à retirer",
          type: "string",
          required: true,
          maxLength: SUPPORT_TEXT_MAX,
          rest: true,
          autocomplete: ({ settings, query }) => textChoices(serverSettings(settings), query),
        },
      ],
    },
    { name: "verifier", description: "Donne ou retire le rôle à tous les membres maintenant" },
  ],
  async run(ctx) {
    const server = serverSettings(ctx.settings);
    const save = async (next: ServerSettings, message: string) => {
      await saveServerSettings(ctx.settings, next);
      await ctx.reply({ embeds: [notice(ctx.settings, `${message}\n\n${supportSummary(next)}`, "Rôle soutien")] }, { private: true });
    };

    switch (ctx.subcommand) {
      case "voir":
        await ctx.reply({ embeds: [embed(ctx.settings).setTitle("💛 Rôle soutien").setDescription(supportSummary(server))] }, { private: true });
        return;
      case "role": {
        const role = ctx.role("role");
        if (role) {
          const problem = roleProblem(role, ctx.guild.id, ctx.guild.members.me?.roles.highest.position ?? 0);
          if (problem) throw new UserError(problem);
        }
        await save({ ...server, soutienRoleId: role?.id }, role ? `Les soutiens reçoivent ${role}.` : "Le rôle soutien n'est plus distribué.");
        return;
      }
      case "tag": {
        const active = ctx.boolean("actif") ?? false;
        await save({ ...server, soutienTag: active }, active ? "Le tag du serveur donne le rôle soutien." : "Le tag du serveur n'est plus compté.");
        return;
      }
      case "ajouter": {
        const text = ctx.string("texte", true);
        await save({ ...server, soutienTextes: addSupportText(server.soutienTextes ?? [], text) }, `Un statut contenant « ${text.trim()} » donne le rôle soutien.`);
        return;
      }
      case "retirer": {
        const text = ctx.string("texte", true);
        await save({ ...server, soutienTextes: removeSupportText(server.soutienTextes ?? [], text) }, `« ${text.trim()} » retiré.`);
        return;
      }
      case "verifier": {
        if (!server.soutienRoleId) throw new UserError("Choisissez d'abord le rôle soutien : `/soutien role`.");
        await ctx.defer({ private: true });
        await reconcileAllSupport(ctx.guild, server);
        await ctx.reply({ embeds: [notice(ctx.settings, "Rôle soutien vérifié pour tous les membres connus du bot.")] }, { private: true });
        return;
      }
    }
  },
});
