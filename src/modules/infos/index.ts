import { ButtonBuilder, ButtonStyle, ChannelType, type Guild, type GuildMember, type User } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { defineCommand, PERMISSION, type OptionDef } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { row } from "@/core/panels";
import type { BotModule } from "@/core/registry";

export const MODULE = "infos";

const memberOption: OptionDef = { name: "membre", description: "Membre (par défaut : vous)", type: "user" };
const time = (date: Date | number | null | undefined, style: "R" | "f" | "D" = "D") => (date ? `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>` : "—");

/** Fiche d'un membre : compte, arrivée, rôles, exclusion en cours, boost. */
export function userInfoEmbed(settings: GuildSettings, user: User, member: GuildMember | null) {
  const result = embed(settings)
    .setTitle(member?.displayName ?? user.globalName ?? user.username)
    .setThumbnail(member?.displayAvatarURL({ size: 256 }) ?? user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Utilisateur", value: `${user} · \`${user.username}\``, inline: true },
      { name: "Identifiant", value: `\`${user.id}\``, inline: true },
      { name: "Compte créé", value: `${time(user.createdAt)} (${time(user.createdAt, "R")})` },
    );
  if (!member) return result.setFooter({ text: user.bot ? "Bot · pas sur le serveur" : "Pas sur le serveur" });
  const roles = [...member.roles.cache.values()].filter(role => role.id !== member.guild.id).sort((a, b) => b.position - a.position);
  const shown = roles.slice(0, 20).map(role => `${role}`).join(" ");
  result.addFields(
    { name: "Arrivé sur le serveur", value: `${time(member.joinedAt)} (${time(member.joinedAt, "R")})` },
    { name: `Rôles (${roles.length})`, value: (roles.length > 20 ? `${shown} …` : shown) || "*Aucun*" },
  );
  if (member.premiumSince) result.addFields({ name: "Booste le serveur depuis", value: time(member.premiumSince), inline: true });
  if (member.isCommunicationDisabled()) result.addFields({ name: "Exclu jusqu'au", value: time(member.communicationDisabledUntil, "f"), inline: true });
  return result.setFooter({ text: user.bot ? "Bot" : "Membre" });
}

/** Fiche du serveur : propriétaire, création, membres, salons, rôles, boosts. */
export function serverInfoEmbed(settings: GuildSettings, guild: Guild) {
  const channels = [...guild.channels.cache.values()];
  const text = channels.filter(channel => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement).length;
  const voice = channels.filter(channel => channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice).length;
  const result = embed(settings)
    .setTitle(guild.name)
    .addFields(
      { name: "Propriétaire", value: `<@${guild.ownerId}>`, inline: true },
      { name: "Créé", value: time(guild.createdAt), inline: true },
      { name: "Identifiant", value: `\`${guild.id}\``, inline: true },
      { name: "Membres", value: String(guild.memberCount), inline: true },
      { name: "Salons", value: `${text} textuels · ${voice} vocaux`, inline: true },
      { name: "Rôles", value: String(Math.max(guild.roles.cache.size - 1, 0)), inline: true },
      { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} (niveau ${guild.premiumTier})`, inline: true },
      { name: "Emojis", value: String(guild.emojis.cache.size), inline: true },
    );
  const icon = guild.iconURL({ size: 256 });
  if (icon) result.setThumbnail(icon);
  const banner = guild.bannerURL({ size: 1024 });
  if (banner) result.setImage(banner);
  return result;
}

const imageButton = (url: string, label: string) => new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label);

async function targetOf(ctx: CommandContext) {
  const user = ctx.userArg("membre") ?? ctx.user;
  const member = ctx.guild.members.cache.get(user.id) ?? (await ctx.guild.members.fetch(user.id).catch(() => null));
  return { user, member };
}

const userinfo = defineCommand({
  name: "userinfo",
  aliases: ["ui", "membre"],
  description: "Informations sur un membre : compte, arrivée, rôles.",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  options: [memberOption],
  async run(ctx) {
    await ctx.defer();
    const { user, member } = await targetOf(ctx);
    await ctx.reply({ embeds: [userInfoEmbed(ctx.settings, user, member)] });
  },
});

const serverinfo = defineCommand({
  name: "serverinfo",
  aliases: ["si"],
  description: "Informations sur le serveur : membres, salons, rôles, boosts.",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  async run(ctx) {
    await ctx.reply({ embeds: [serverInfoEmbed(ctx.settings, ctx.guild)] });
  },
});

const pic = defineCommand({
  name: "pic",
  aliases: ["avatar", "pp"],
  description: "Avatar d'un membre en grand.",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  options: [memberOption],
  async run(ctx) {
    await ctx.defer();
    const { user, member } = await targetOf(ctx);
    const global = user.displayAvatarURL({ size: 1024 });
    const server = member?.avatar ? member.displayAvatarURL({ size: 1024 }) : null;
    const buttons = [imageButton(global, "Avatar du profil"), ...(server ? [imageButton(server, "Avatar du serveur")] : [])];
    await ctx.reply({ embeds: [embed(ctx.settings).setTitle(`Avatar de ${member?.displayName ?? user.username}`).setImage(server ?? global)], components: [row(...buttons)] });
  },
});

const banner = defineCommand({
  name: "banner",
  aliases: ["banniere"],
  description: "Bannière du profil d'un membre.",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  options: [memberOption],
  async run(ctx) {
    await ctx.defer();
    const { user } = await targetOf(ctx);
    // La bannière n'est transmise qu'en relisant le profil complet.
    const full = await user.fetch(true);
    const url = full.bannerURL({ size: 1024 });
    if (!url) throw new UserError(`${full.username} n'a pas de bannière${full.hexAccentColor ? ` (couleur de profil : ${full.hexAccentColor})` : ""}.`);
    await ctx.reply({ embeds: [embed(ctx.settings).setTitle(`Bannière de ${full.globalName ?? full.username}`).setImage(url)], components: [row(imageButton(url, "Ouvrir l'image"))] });
  },
});

export const infosModule: BotModule = {
  id: MODULE,
  label: "Informations",
  icon: "ℹ️",
  description: "Fiche d'un membre ou du serveur, avatar et bannière.",
  commands: [userinfo, serverinfo, pic, banner],
};
