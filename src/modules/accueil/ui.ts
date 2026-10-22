import { ButtonStyle, MessageFlags, type Guild, type GuildMember, type PartialGuildMember } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { ANYONE, customId, type ComponentHandler } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { button, choice, ICON, row } from "@/core/panels";
import { baseVars } from "@/core/templates";
import { logger } from "@/logger";
import { applyMenuChoice, findPanel, MODULE, roleProblem, saveWelcomeSettings, toggleRole, welcomeSettings, type RolePanel } from "./settings";

export const PREFIX = "acr";

interface MemberLike {
  id: string;
  displayName: string;
  user: { username: string; displayAvatarURL: () => string };
  guild: Pick<Guild, "name" | "memberCount">;
}

function vars(member: MemberLike) {
  return baseVars({ user: { id: member.id, username: member.user.username, displayName: member.displayName }, guild: member.guild });
}

export function welcomePayload(settings: GuildSettings, member: MemberLike): Payload {
  return {
    content: `<@${member.id}>`,
    embeds: [
      embed(settings)
        .setTitle(`Bienvenue à ${member.guild.name}`)
        .setDescription(renderMessage(settings, "accueil.bienvenue", vars(member)))
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: `${member.guild.memberCount}ᵉ membre` }),
    ],
  };
}

export function leavePayload(settings: GuildSettings, member: MemberLike): Payload {
  return { embeds: [embed(settings, "bronze").setDescription(renderMessage(settings, "accueil.depart", vars(member))).setThumbnail(member.user.displayAvatarURL())] };
}

export function welcomeDmPayload(settings: GuildSettings, member: MemberLike): Payload {
  return { embeds: [embed(settings).setTitle(member.guild.name).setDescription(renderMessage(settings, "accueil.bienvenue-mp", vars(member)))] };
}

/** Règlement publié : le texte et le bouton d'acceptation. */
export function rulesPayload(settings: GuildSettings, guild: Pick<Guild, "name">): Payload {
  return {
    embeds: [embed(settings).setTitle(`📜 Règlement · ${guild.name}`).setDescription(renderMessage(settings, "accueil.reglement", { server: guild.name }))],
    components: [row(button(customId(PREFIX, ANYONE, "reglement"), "J'accepte le règlement", { emoji: ICON.valider, style: ButtonStyle.Success }))],
  };
}

/** Panneau de rôles publié : boutons (5 par rangée) ou menu déroulant. */
export function rolePanelPayload(settings: GuildSettings, panel: RolePanel, roleName: (id: string) => string): Payload {
  const roles = panel.roleIds.map(id => ({ id, name: roleName(id) }));
  const help = panel.style === "boutons" ? "Clique sur un bouton pour prendre ou rendre le rôle." : "Choisis tes rôles dans le menu ; décoche-les pour les rendre.";
  const result = embed(settings)
    .setTitle(panel.title)
    .setDescription([panel.description, roles.map(role => `• <@&${role.id}>`).join("\n") || "*Aucun rôle pour l'instant.*"].filter(Boolean).join("\n\n"))
    .setFooter({ text: panel.unique ? `${help} Un seul rôle à la fois.` : help });

  if (roles.length === 0) return { embeds: [result], components: [] };
  if (panel.style === "menu") {
    const menu = choice(
      customId(PREFIX, ANYONE, "menu", panel.id),
      roles.map(role => ({ label: role.name, value: role.id })),
      "Choisis tes rôles",
    )
      .setMinValues(0)
      .setMaxValues(panel.unique ? 1 : roles.length);
    return { embeds: [result], components: [row(menu)] };
  }
  const buttons = roles.map(role => button(customId(PREFIX, ANYONE, "role", panel.id, role.id), role.name.slice(0, 80), { style: ButtonStyle.Secondary }));
  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) rows.push(row(...buttons.slice(index, index + 5)));
  return { embeds: [result], components: rows };
}

export function roleNameIn(guild: Guild) {
  return (id: string) => guild.roles.cache.get(id)?.name ?? "Rôle supprimé";
}

async function fetchMessage(guild: Guild, ref: { channelId: string; messageId: string }) {
  const channel = guild.channels.cache.get(ref.channelId);
  return channel?.isTextBased() ? channel.messages.fetch(ref.messageId).catch(() => null) : null;
}

/** Met à jour les messages publiés (règlement, panneaux de rôles) ; oublie ceux qui ont été supprimés. */
export async function refreshPublished(guild: Guild) {
  const settings = await getSettings(guild.id);
  const welcome = welcomeSettings(settings);
  let changed = false;

  if (welcome.reglementMessage) {
    const message = await fetchMessage(guild, welcome.reglementMessage);
    if (message) await message.edit(rulesPayload(settings, guild)).catch(error => logger.warn({ err: error }, "Mise à jour du règlement impossible"));
    else {
      welcome.reglementMessage = undefined;
      changed = true;
    }
  }
  for (const panel of welcome.panneaux) {
    if (!panel.message) continue;
    const message = await fetchMessage(guild, panel.message);
    if (message) await message.edit(rolePanelPayload(settings, panel, roleNameIn(guild))).catch(error => logger.warn({ err: error }, "Mise à jour d'un panneau de rôles impossible"));
    else {
      panel.message = undefined;
      changed = true;
    }
  }
  if (changed) await saveWelcomeSettings(settings, welcome);
}

/** Vérifie que le bot peut donner chacun de ces rôles, avant d'y toucher. */
function checkRoles(member: GuildMember, roleIds: string[]) {
  const top = member.guild.members.me?.roles.highest.position ?? 0;
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId);
    if (!role) throw new UserError("Ce rôle n'existe plus. Préviens l'équipe pour qu'elle mette le panneau à jour.");
    const problem = roleProblem(role, member.guild.id, top);
    if (problem) throw new UserError(`Le bot ne peut pas donner ce rôle : ${problem}`);
  }
}

async function apply(member: GuildMember, change: { add: string[]; remove: string[] }, reason: string) {
  checkRoles(member, [...change.add, ...change.remove]);
  if (change.remove.length) await member.roles.remove(change.remove, reason);
  if (change.add.length) await member.roles.add(change.add, reason);
}

const mentions = (ids: string[]) => ids.map(id => `<@&${id}>`).join(", ");

export function describeChange(change: { add: string[]; remove: string[] }): string {
  const parts = [change.add.length ? `${ICON.ajouter} ${mentions(change.add)}` : "", change.remove.length ? `${ICON.retirer} ${mentions(change.remove)}` : ""].filter(Boolean);
  return parts.join("\n") || "Rien n'a changé.";
}

/** Rôles donnés à l'arrivée ; un rôle devenu impossible à donner est signalé dans les journaux sans bloquer les autres. */
export async function giveAutoroles(member: GuildMember, roleIds: string[]) {
  const top = member.guild.members.me?.roles.highest.position ?? 0;
  const valid = roleIds.filter(roleId => {
    const role = member.guild.roles.cache.get(roleId);
    const problem = role ? roleProblem(role, member.guild.id, top) : "rôle supprimé";
    if (problem) logger.warn({ role: roleId, raison: problem }, "Autorôle ignoré");
    return !problem && !member.roles.cache.has(roleId);
  });
  if (valid.length) await member.roles.add(valid, "Autorôle à l'arrivée");
}

/** Envoie dans un salon d'accueil ; seul le membre accueilli peut être notifié. */
export async function sendTo(guild: Guild, channelId: string | undefined, payload: Payload, notify?: string) {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isSendable()) {
    logger.warn({ channel: channelId }, "Salon d'accueil introuvable ou inaccessible");
    return;
  }
  await channel.send({ ...payload, allowedMentions: { users: notify ? [notify] : [] } });
}

export type AnyMember = GuildMember | PartialGuildMember;

export const welcomeHandler: ComponentHandler = {
  prefix: PREFIX,
  async handle(interaction, { settings, action, args }) {
    if (!isModuleEnabled(settings, MODULE)) throw new UserError("L'accueil est désactivé pour le moment.");
    const welcome = welcomeSettings(settings);
    const member = interaction.member;

    switch (action) {
      case "reglement": {
        const roleId = welcome.reglementRoleId;
        if (!roleId) throw new UserError("Aucun rôle n'est encore lié au règlement. Préviens l'équipe.");
        if (member.roles.cache.has(roleId)) return interaction.reply({ content: `${ICON.valider} Tu as déjà accepté le règlement.`, flags: MessageFlags.Ephemeral });
        await apply(member, { add: [roleId], remove: [] }, "Règlement accepté");
        return interaction.reply({ content: `${ICON.valider} Règlement accepté : tu as reçu <@&${roleId}>.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }
      case "role": {
        const [panelId = "", roleId = ""] = args;
        const panel = findPanel(welcome, panelId);
        if (!panel.roleIds.includes(roleId)) throw new UserError("Ce rôle n'est plus proposé sur ce panneau.");
        const change = toggleRole(panel, member.roles.cache.keys(), roleId);
        await apply(member, change, `Panneau de rôles « ${panel.title} »`);
        return interaction.reply({ content: describeChange(change), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }
      case "menu": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        const panel = findPanel(welcome, args[0] ?? "");
        const change = applyMenuChoice(panel, member.roles.cache.keys(), interaction.values);
        await apply(member, change, `Panneau de rôles « ${panel.title} »`);
        return interaction.reply({ content: describeChange(change), flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      }
    }
    throw new Error(`Action d'accueil inconnue : ${action}`);
  },
};
