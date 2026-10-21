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
  moveLevel,
  renameLevel,
} from "@/config/store";
import { requiredLabel } from "@/core/access";
import { normalizeHexColor } from "@/core/args";
import { defineCommand, PERMISSION, type OptionDef } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { messageDefs } from "@/core/messages";
import { ladder } from "@/core/permissions";
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

/** Les commandes de configuration demandent « Gérer le serveur » par défaut et ne peuvent jamais être ouvertes à tous. */
const base = { module: MODULE, defaultPermission: PERMISSION.gestion, protected: true } as const;

const accessOption: OptionDef = { name: "acces", description: "Accès", type: "string", required: true, autocomplete: levelChoices };
const moduleOption: OptionDef = { name: "module", description: "Module", type: "string", required: true, autocomplete: moduleChoices };
const commandOption: OptionDef = { name: "commande", description: "Commande", type: "string", required: true, autocomplete: commandChoices };
const keyOption: OptionDef = { name: "cle", description: "Message", type: "string", required: true, autocomplete: messageChoices };

async function done(ctx: CommandContext, text: string) {
  await ctx.reply({ embeds: [notice(ctx.settings, text)] }, { private: true });
}

/** Configuration relue après une modification. */
const fresh = (ctx: CommandContext) => getSettings(ctx.guild.id);

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
  description: "Active, désactive ou réserve un module à un accès.",
  subcommands: [
    { name: "liste", description: "Liste les modules et leur état" },
    { name: "activer", description: "Active un module", options: [moduleOption] },
    { name: "desactiver", description: "Désactive un module", options: [moduleOption] },
    {
      name: "acces",
      description: "Réserve tout un module à un accès (« defaut » : selon chaque commande)",
      options: [moduleOption, { ...accessOption, description: "Accès, ou « defaut »", autocomplete: input => [{ name: "Selon chaque commande", value: DEFAULT_VALUE }, ...levelChoices(input)] }],
    },
  ],
  async run(ctx) {
    if (ctx.subcommand === "liste") {
      await ctx.reply(renderPanel(view(ctx), "modules"), { private: true });
      return;
    }

    const target = findModule(ctx.string("module", true));
    if (ctx.subcommand === "acces") {
      const value = ctx.string("acces", true);
      const level = value.toLowerCase() === DEFAULT_VALUE ? null : findLevel(ctx.settings, value);
      await setModuleLevel(ctx.guild.id, target.id, level?.id ?? null);
      await done(ctx, level ? `Module **${target.label}** réservé à l'accès **${level.name}** et au-dessus.` : `Module **${target.label}** : chaque commande suit son propre réglage.`);
      return;
    }

    if (target.locked) throw new UserError("Ce module est indispensable : il ne peut pas être désactivé.");
    const enabled = ctx.subcommand === "activer";
    await setModuleEnabled(ctx.guild.id, target.id, enabled);
    await done(ctx, `Module **${target.label}** ${enabled ? "activé" : "désactivé"}.`);
  },
});

export const acces = defineCommand({
  ...base,
  name: "acces",
  description: "Gère les accès du bot et les rôles qui les donnent.",
  aliases: ["niveau", "niveaux", "access"],
  subcommands: [
    { name: "liste", description: "Affiche l'échelle des accès et leurs rôles" },
    { name: "creer", description: "Crée un accès en bas de l'échelle", options: [{ name: "nom", description: "Nom de l'accès", type: "string", required: true, maxLength: 32 }] },
    { name: "renommer", description: "Renomme un accès", options: [accessOption, { name: "nom", description: "Nouveau nom", type: "string", required: true, maxLength: 32 }] },
    { name: "monter", description: "Monte un accès d'un cran (plus de droits)", options: [accessOption] },
    { name: "descendre", description: "Descend un accès d'un cran (moins de droits)", options: [accessOption] },
    { name: "supprimer", description: "Supprime un accès (confirmation demandée)", options: [accessOption] },
    { name: "ajouter-role", description: "Lie un rôle à un accès", options: [accessOption, { name: "role", description: "Rôle Discord", type: "role", required: true }] },
    { name: "retirer-role", description: "Retire un rôle d'un accès", options: [accessOption, { name: "role", description: "Rôle Discord", type: "role", required: true }] },
  ],
  async run(ctx) {
    const guildId = ctx.guild.id;
    if (ctx.subcommand === "liste") {
      await ctx.reply(renderPanel(view(ctx), "acces"), { private: true });
      return;
    }
    if (ctx.subcommand === "creer") {
      const name = ctx.string("nom", true);
      await createLevel(guildId, name);
      await done(ctx, `Accès **${name}** créé en bas de l'échelle. Montez-le avec \`${ctx.prefix}acces monter\`, puis liez-lui des rôles avec \`${ctx.prefix}acces ajouter-role\`.`);
      return;
    }

    const level = findLevel(ctx.settings, ctx.string("acces", true));
    switch (ctx.subcommand) {
      case "renommer": {
        const name = ctx.string("nom", true);
        await renameLevel(guildId, level.id, name);
        await done(ctx, `Accès **${level.name}** renommé en **${name}**.`);
        return;
      }
      case "monter":
      case "descendre": {
        await moveLevel(guildId, level.id, ctx.subcommand);
        const order = ladder((await fresh(ctx)).levels).map(item => (item.id === level.id ? `**${item.name}**` : item.name));
        await done(ctx, `Nouvelle échelle : ${order.join(" ▸ ")}`);
        return;
      }
      case "supprimer":
        await ctx.reply(renderPanel(view(ctx), `niveau-suppr:${level.id}`), { private: true });
        return;
      case "ajouter-role":
      case "retirer-role": {
        const role = ctx.role("role", true);
        if (ctx.subcommand === "ajouter-role") await addLevelRole(guildId, level.id, role.id);
        else await removeLevelRole(guildId, level.id, role.id);
        await done(ctx, ctx.subcommand === "ajouter-role" ? `${role} donne désormais l'accès **${level.name}**.` : `${role} ne donne plus l'accès **${level.name}**.`);
        return;
      }
    }
  },
});

export const permission = defineCommand({
  ...base,
  name: "permission",
  description: "Consulte ou change qui peut utiliser une commande.",
  aliases: ["perm"],
  subcommands: [
    { name: "voir", description: "Qui peut utiliser une commande", options: [commandOption] },
    {
      name: "definir",
      description: "Change qui peut utiliser une commande",
      options: [
        commandOption,
        {
          ...accessOption,
          description: "Accès, « tous » ou « defaut »",
          autocomplete: input => [{ name: "Par défaut", value: DEFAULT_VALUE }, { name: "Tout le monde", value: EVERYONE_VALUE }, ...levelChoices(input)],
        },
      ],
    },
  ],
  async run(ctx) {
    const command = findCommand(ctx.string("commande", true));
    if (ctx.subcommand === "voir") {
      await ctx.reply(renderPanel(view(ctx), `commande:${command.name}`), { private: true });
      return;
    }

    const value = ctx.string("acces", true).toLowerCase();
    if (value === DEFAULT_VALUE) {
      await resetCommandLevel(ctx.guild.id, command.name);
    } else if (value === EVERYONE_VALUE) {
      if (command.protected) throw new UserError("Une commande de configuration ne peut pas être ouverte à tout le monde.");
      await setCommandLevel(ctx.guild.id, command.name, null);
    } else {
      await setCommandLevel(ctx.guild.id, command.name, findLevel(ctx.settings, value).id);
    }
    await done(ctx, `\`/${command.name}\` : **${requiredLabel(await fresh(ctx), command)}**.`);
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
        await ctx.reply(renderPanel(view(ctx), "profil"), { private: true });
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
        await ctx.reply(renderPanel(view(ctx), `message:${definition.key}`), { private: true });
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
