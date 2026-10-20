import {
  addLevelRole,
  createLevel,
  getSettings,
  removeLevelRole,
  resetCommandLevel,
  resetMessage,
  setCommandLevel,
  setMessage,
  setModuleEnabled,
  setModuleLevel,
  updateConfig,
  updateLevel,
} from "@/config/store";
import { isModuleEnabled, requiredLabel } from "@/core/access";
import { normalizeHexColor } from "@/core/args";
import { defineCommand, LEVEL, type OptionDef } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { messageDefs } from "@/core/messages";
import { getRegistry } from "@/core/registry";
import {
  checkPrefix,
  commandChoices,
  DEFAULT_VALUE,
  EVERYONE_VALUE,
  findCommand,
  findLevel,
  findMessage,
  findModule,
  levelChoices,
  messageChoices,
  moduleChoices,
} from "./lookups";
import { renderPanel } from "./panel";
import { activityChoices, ACTIVITIES, applyMemberProfile, applyPresence, describeActivity, imageUrl, statusChoices, STATUSES } from "./profile";

const MODULE = "config";

/** Les commandes de configuration demandent le rang Admin et ne peuvent jamais être ouvertes à tous. */
const base = { module: MODULE, defaultWeight: LEVEL.admin, protected: true } as const;

const levelOption: OptionDef = { name: "niveau", description: "Niveau de permission", type: "string", required: true, autocomplete: levelChoices };
const moduleOption: OptionDef = { name: "module", description: "Module", type: "string", required: true, autocomplete: moduleChoices };
const commandOption: OptionDef = { name: "commande", description: "Commande", type: "string", required: true, autocomplete: commandChoices };
const keyOption: OptionDef = { name: "cle", description: "Message", type: "string", required: true, autocomplete: messageChoices };

async function done(ctx: CommandContext, text: string) {
  await ctx.reply({ embeds: [notice(ctx.settings, text)] }, { private: true });
}

/** Configuration relue après une modification. */
const fresh = (ctx: CommandContext) => getSettings(ctx.guild.id);

export const config = defineCommand({
  ...base,
  name: "config",
  description: "Ouvre le panneau de configuration du bot.",
  aliases: ["settings", "parametres"],
  async run(ctx) {
    await ctx.reply(renderPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }, "home"), { private: true });
  },
});

export const prefixe = defineCommand({
  ...base,
  name: "prefixe",
  description: "Change le préfixe des commandes.",
  aliases: ["prefix"],
  options: [{ name: "prefixe", description: "Nouveau préfixe (1 à 5 caractères)", type: "string", required: true, maxLength: 5 }],
  async run(ctx) {
    const prefix = checkPrefix(ctx.string("prefixe", true));
    await updateConfig(ctx.guild.id, { prefix });
    await done(ctx, `Préfixe changé : \`${prefix}\`.`);
  },
});

const TONES = {
  or: { label: "principale (or)", column: "embed_color" },
  bronze: { label: "neutre (bronze)", column: "embed_color_dark" },
  parchemin: { label: "d'accent (parchemin)", column: "embed_color_light" },
} as const;

export const couleur = defineCommand({
  ...base,
  name: "couleur",
  description: "Change une couleur des embeds.",
  aliases: ["color"],
  options: [
    {
      name: "teinte",
      description: "Couleur à changer",
      type: "string",
      required: true,
      choices: [
        { name: "Principale (or)", value: "or" },
        { name: "Neutre (bronze)", value: "bronze" },
        { name: "Accent (parchemin)", value: "parchemin" },
      ],
    },
    { name: "code", description: "Code hexadécimal, ex. #d1a64a", type: "string", required: true, maxLength: 7 },
  ],
  async run(ctx) {
    const tone = TONES[ctx.string("teinte", true) as keyof typeof TONES];
    const hex = normalizeHexColor(ctx.string("code", true));
    if (!hex) throw new UserError("Couleur invalide. Format attendu : #d1a64a.");
    await updateConfig(ctx.guild.id, { [tone.column]: hex });
    await done(ctx, `Couleur ${tone.label} changée : \`${hex}\`.`);
  },
});

export const module = defineCommand({
  ...base,
  name: "module",
  description: "Active, désactive ou règle un module.",
  subcommands: [
    { name: "liste", description: "Liste les modules et leur état" },
    { name: "activer", description: "Active un module", options: [moduleOption] },
    { name: "desactiver", description: "Désactive un module", options: [moduleOption] },
    {
      name: "niveau",
      description: "Rang requis pour tout le module",
      options: [moduleOption, { ...levelOption, description: "Niveau, ou « defaut » pour la valeur de chaque commande" }],
    },
  ],
  async run(ctx) {
    if (ctx.subcommand === "liste") {
      const lines = getRegistry().modules.map(
        item => `${isModuleEnabled(ctx.settings, item.id) ? "●" : "○"} **${item.label}** (\`${item.id}\`)${item.locked ? " — indispensable" : ""}`,
      );
      await ctx.reply({ embeds: [embed(ctx.settings).setTitle("Modules").setDescription(lines.join("\n"))] }, { private: true });
      return;
    }

    const target = findModule(ctx.string("module", true));
    if (ctx.subcommand === "niveau") {
      const value = ctx.string("niveau", true);
      const level = value.toLowerCase() === DEFAULT_VALUE ? null : findLevel(ctx.settings, value);
      await setModuleLevel(ctx.guild.id, target.id, level?.id ?? null);
      await done(ctx, level ? `Le module **${target.label}** demande désormais le rang **${level.name}**.` : `Le module **${target.label}** revient au rang par défaut de chaque commande.`);
      return;
    }

    if (target.locked) throw new UserError("Ce module ne peut pas être désactivé.");
    const enabled = ctx.subcommand === "activer";
    await setModuleEnabled(ctx.guild.id, target.id, enabled);
    await done(ctx, `Module **${target.label}** ${enabled ? "activé" : "désactivé"}.`);
  },
});

export const niveau = defineCommand({
  ...base,
  name: "niveau",
  description: "Gère les niveaux de permission et leurs rôles.",
  aliases: ["niveaux", "level"],
  subcommands: [
    { name: "liste", description: "Liste les niveaux et leurs rôles" },
    {
      name: "creer",
      description: "Crée un niveau",
      options: [
        { name: "nom", description: "Nom du niveau", type: "string", required: true, maxLength: 32 },
        { name: "poids", description: "Poids de 1 à 1000 (plus haut = plus de droits)", type: "integer", required: true, minValue: 1, maxValue: 1000 },
      ],
    },
    {
      name: "modifier",
      description: "Renomme un niveau ou change son poids",
      options: [
        levelOption,
        { name: "nom", description: "Nouveau nom", type: "string", maxLength: 32 },
        { name: "poids", description: "Nouveau poids", type: "integer", minValue: 1, maxValue: 1000 },
      ],
    },
    { name: "supprimer", description: "Supprime un niveau (confirmation dans le panneau)", options: [levelOption] },
    { name: "ajouter-role", description: "Lie un rôle à un niveau", options: [levelOption, { name: "role", description: "Rôle Discord", type: "role", required: true }] },
    { name: "retirer-role", description: "Retire un rôle d'un niveau", options: [levelOption, { name: "role", description: "Rôle Discord", type: "role", required: true }] },
  ],
  async run(ctx) {
    const guildId = ctx.guild.id;
    switch (ctx.subcommand) {
      case "liste": {
        const levels = [...ctx.settings.levels].reverse();
        const result = embed(ctx.settings)
          .setTitle("Niveaux de permission")
          .setDescription("Un niveau de poids supérieur hérite des droits des niveaux inférieurs.")
          .addFields(
            levels.map(level => ({
              name: `${level.name} · poids ${level.weight}`,
              value: (level.roleIds.map(id => `<@&${id}>`).join(" ") || "*Aucun rôle lié*").slice(0, 1024),
            })),
          );
        await ctx.reply({ embeds: [result] }, { private: true });
        return;
      }
      case "creer": {
        const name = ctx.string("nom", true);
        const weight = ctx.integer("poids", true);
        await createLevel(guildId, name, weight);
        await done(ctx, `Niveau **${name}** créé (poids ${weight}). Liez-lui des rôles avec \`${ctx.prefix}niveau ajouter-role\`.`);
        return;
      }
      case "modifier": {
        const level = findLevel(ctx.settings, ctx.string("niveau", true));
        const name = ctx.string("nom") ?? level.name;
        const weight = ctx.integer("poids") ?? level.weight;
        await updateLevel(guildId, level.id, { name, weight });
        await done(ctx, `Niveau **${name}** enregistré (poids ${weight}).`);
        return;
      }
      case "supprimer": {
        const level = findLevel(ctx.settings, ctx.string("niveau", true));
        await ctx.reply(renderPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }, `level-delete:${level.id}`), { private: true });
        return;
      }
      case "ajouter-role":
      case "retirer-role": {
        const level = findLevel(ctx.settings, ctx.string("niveau", true));
        const role = ctx.role("role", true);
        if (ctx.subcommand === "ajouter-role") await addLevelRole(guildId, level.id, role.id);
        else await removeLevelRole(guildId, level.id, role.id);
        await done(ctx, ctx.subcommand === "ajouter-role" ? `${role} est lié au niveau **${level.name}**.` : `${role} n'est plus lié au niveau **${level.name}**.`);
        return;
      }
    }
  },
});

export const permission = defineCommand({
  ...base,
  name: "permission",
  description: "Consulte ou change le rang requis par une commande.",
  aliases: ["perm"],
  subcommands: [
    { name: "voir", description: "Rang requis par une commande", options: [commandOption] },
    {
      name: "definir",
      description: "Change le rang requis par une commande",
      options: [
        commandOption,
        {
          ...levelOption,
          description: "Niveau, « tous » ou « defaut »",
          autocomplete: input => [{ name: "Par défaut", value: DEFAULT_VALUE }, { name: "Tout le monde", value: EVERYONE_VALUE }, ...levelChoices(input)],
        },
      ],
    },
  ],
  async run(ctx) {
    const command = findCommand(ctx.string("commande", true));
    if (ctx.subcommand === "voir") {
      await done(ctx, `\`${command.name}\` demande le rang **${requiredLabel(ctx.settings, command)}**.`);
      return;
    }

    const value = ctx.string("niveau", true).toLowerCase();
    if (value === DEFAULT_VALUE) {
      await resetCommandLevel(ctx.guild.id, command.name);
    } else if (value === EVERYONE_VALUE) {
      if (command.protected) throw new UserError("Une commande de configuration ne peut pas être ouverte à tout le monde.");
      await setCommandLevel(ctx.guild.id, command.name, null);
    } else {
      await setCommandLevel(ctx.guild.id, command.name, findLevel(ctx.settings, value).id);
    }
    await done(ctx, `\`${command.name}\` demande désormais le rang **${requiredLabel(await fresh(ctx), command)}**.`);
  },
});

export const profil = defineCommand({
  ...base,
  name: "profil",
  description: "Personnalise le bot : pseudo, bio, avatar, bannière, statut, activité.",
  aliases: ["profile"],
  subcommands: [
    { name: "voir", description: "Affiche le profil actuel" },
    { name: "pseudo", description: "Pseudo sur le serveur (vide = nom de l'application)", options: [{ name: "texte", description: "Pseudo", type: "string", maxLength: 32, rest: true }] },
    { name: "bio", description: "Bio sur le serveur (vide = aucune)", options: [{ name: "texte", description: "Bio", type: "string", maxLength: 190, rest: true }] },
    { name: "avatar", description: "Avatar sur le serveur (vide = celui de l'application)", options: [{ name: "url", description: "Adresse https de l'image", type: "string" }] },
    { name: "banniere", description: "Bannière sur le serveur (vide = aucune)", options: [{ name: "url", description: "Adresse https de l'image", type: "string" }] },
    { name: "statut", description: "Statut du bot", options: [{ name: "statut", description: "Statut", type: "string", required: true, choices: statusChoices }] },
    {
      name: "activite",
      description: "Activité affichée sous le nom du bot",
      options: [
        { name: "type", description: "Type d'activité", type: "string", required: true, choices: activityChoices },
        { name: "texte", description: "Texte (vide = aucune activité)", type: "string", maxLength: 128, rest: true },
      ],
    },
  ],
  async run(ctx) {
    const guildId = ctx.guild.id;
    switch (ctx.subcommand) {
      case "voir": {
        await ctx.reply(renderPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }, "profile"), { private: true });
        return;
      }
      case "pseudo":
      case "bio": {
        const text = ctx.string("texte") ?? null;
        await ctx.defer({ private: true });
        if (ctx.subcommand === "pseudo") {
          await applyMemberProfile(ctx.guild, { nick: text });
          await updateConfig(guildId, { nickname: text });
        } else {
          await applyMemberProfile(ctx.guild, { bio: text });
          await updateConfig(guildId, { bio: text });
        }
        await done(ctx, text ? `${ctx.subcommand === "pseudo" ? "Pseudo" : "Bio"} enregistré(e).` : `${ctx.subcommand === "pseudo" ? "Pseudo" : "Bio"} retiré(e).`);
        return;
      }
      case "avatar":
      case "banniere": {
        const url = imageUrl(ctx.string("url") ?? null);
        await ctx.defer({ private: true });
        if (ctx.subcommand === "avatar") {
          await applyMemberProfile(ctx.guild, { avatar: url });
          await updateConfig(guildId, { avatar_url: url });
        } else {
          await applyMemberProfile(ctx.guild, { banner: url });
          await updateConfig(guildId, { banner_url: url });
        }
        await done(ctx, url ? "Image enregistrée." : "Image retirée.");
        return;
      }
      case "statut": {
        const status = ctx.string("statut", true);
        await updateConfig(guildId, { presence_status: status });
        applyPresence(ctx.guild.client, (await fresh(ctx)).config);
        await done(ctx, `Statut : **${STATUSES[status]?.label ?? status}**.`);
        return;
      }
      case "activite": {
        const type = ctx.string("type", true);
        if (!ACTIVITIES[type]) throw new UserError("Type d'activité inconnu.");
        await updateConfig(guildId, { activity_type: type, activity_text: ctx.string("texte") ?? null });
        const updated = await fresh(ctx);
        applyPresence(ctx.guild.client, updated.config);
        await done(ctx, `Activité : **${describeActivity(updated.config)}**.`);
        return;
      }
    }
  },
});

export const message = defineCommand({
  ...base,
  name: "message",
  description: "Personnalise les messages du bot.",
  aliases: ["messages"],
  subcommands: [
    { name: "liste", description: "Liste les messages personnalisables" },
    { name: "voir", description: "Affiche un message, ses variables et un aperçu", options: [keyOption] },
    {
      name: "definir",
      description: "Change le texte d'un message (\\n pour un retour à la ligne en slash)",
      options: [keyOption, { name: "texte", description: "Nouveau texte", type: "string", required: true, maxLength: 2000, rest: true }],
    },
    { name: "reinitialiser", description: "Rétablit le texte par défaut", options: [keyOption] },
  ],
  async run(ctx) {
    if (ctx.subcommand === "liste") {
      const lines = messageDefs().map(item => `\`${item.key}\` — ${item.label}${ctx.settings.messages.has(item.key) ? " *(personnalisé)*" : ""}`);
      await ctx.reply({ embeds: [embed(ctx.settings).setTitle("Messages personnalisables").setDescription(lines.join("\n").slice(0, 4000))] }, { private: true });
      return;
    }

    const definition = findMessage(ctx.string("cle", true));
    switch (ctx.subcommand) {
      case "voir":
        await ctx.reply(renderPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }, `message:${definition.key}`), { private: true });
        return;
      case "definir":
        await setMessage(ctx.guild.id, definition.key, ctx.string("texte", true).replace(/\\n/g, "\n"));
        await done(ctx, `Message \`${definition.key}\` enregistré.`);
        return;
      case "reinitialiser":
        await resetMessage(ctx.guild.id, definition.key);
        await done(ctx, `Message \`${definition.key}\` rétabli.`);
        return;
    }
  },
});
