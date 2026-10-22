import { ButtonStyle, MessageFlags, type Guild } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { ANYONE, customId, type ComponentHandler } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, ICON, row } from "@/core/panels";
import { loadAllMembers } from "@/core/members";
import { fetchPublished } from "@/core/published";
import { logger } from "@/logger";
import { MODULE, pickWinners } from "./logic";
import { countEntries, entriesOf, finishGiveaway, giveawayById, toggleEntry, type Giveaway } from "./store";

export const PREFIX = "gvw";

const time = (iso: string, style: "R" | "f") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const mentions = (ids: string[]) => ids.map(id => `<@${id}>`).join(", ");

/** Message du giveaway : en cours (bouton Participer), terminé (gagnants) ou annulé. */
export function giveawayPayload(settings: GuildSettings, giveaway: Giveaway, entries: number): Payload {
  const details = [
    giveaway.status === "en_cours" ? `Fin ${time(giveaway.ends_at, "R")} (${time(giveaway.ends_at, "f")})` : `Terminé ${time(giveaway.ended_at ?? giveaway.ends_at, "R")}`,
    `Organisé par <@${giveaway.host_id}>`,
    `${giveaway.winner_count} gagnant(s) · ${entries} participant(s)`,
    giveaway.required_role_id ? `Réservé à <@&${giveaway.required_role_id}>` : null,
  ];
  const outcome =
    giveaway.status === "termine"
      ? giveaway.winner_ids.length
        ? `🏆 **Gagnant(s) :** ${mentions(giveaway.winner_ids)}`
        : "Aucun participant éligible : pas de gagnant."
      : giveaway.status === "annule"
        ? "❌ **Giveaway annulé.**"
        : null;
  const blocks = [giveaway.description, details.filter(Boolean).join("\n"), outcome].filter(Boolean);

  const result = embed(settings, giveaway.status === "en_cours" ? "or" : "bronze")
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription(blocks.join("\n\n"))
    .setFooter({ text: giveaway.status === "en_cours" ? "Clique sur Participer ; un second clic retire ta participation." : "Giveaway clos" });
  const components =
    giveaway.status === "en_cours" ? [row(button(customId(PREFIX, ANYONE, "participer", giveaway.id), `Participer (${entries})`, { emoji: "🎉", style: ButtonStyle.Success }))] : [];
  return { embeds: [result], components };
}

async function fetchGiveawayMessage(guild: Guild, giveaway: Giveaway) {
  if (!giveaway.message_id) return null;
  const message = await fetchPublished(guild, { channelId: giveaway.channel_id, messageId: giveaway.message_id });
  return message === "supprime" ? null : message;
}

/** Redessine le message du giveaway depuis la base. */
export async function refreshGiveaway(guild: Guild, id: string) {
  const giveaway = await giveawayById(id);
  if (!giveaway) return;
  const message = await fetchGiveawayMessage(guild, giveaway);
  if (!message) return;
  const settings = await getSettings(guild.id);
  await message.edit(giveawayPayload(settings, giveaway, await countEntries(id))).catch(error => logger.warn({ err: error }, "Mise à jour du giveaway impossible"));
}

const pendingRefresh = new Map<string, NodeJS.Timeout>();

/** Regroupe les mises à jour du compteur de participants (beaucoup de clics d'un coup : une seule édition). */
function scheduleRefresh(guild: Guild, id: string) {
  if (pendingRefresh.has(id)) return;
  pendingRefresh.set(
    id,
    setTimeout(() => {
      pendingRefresh.delete(id);
      void refreshGiveaway(guild, id);
    }, 3000),
  );
}

/** Participants encore présents sur le serveur et, si besoin, porteurs du rôle exigé. */
export function eligible(guild: Pick<Guild, "members">, giveaway: Pick<Giveaway, "required_role_id">, entries: string[]): string[] {
  return entries.filter(userId => {
    const member = guild.members.cache.get(userId);
    return member && (!giveaway.required_role_id || member.roles.cache.has(giveaway.required_role_id));
  });
}

/**
 * Participants absents du cache : la liste complète des membres est chargée une fois (chargement partagé),
 * puis tenue à jour par l'intent « Server Members ». Un participant absent ensuite a quitté le serveur.
 */
export async function loadMembers(guild: Guild) {
  await loadAllMembers(guild).catch(error => logger.warn({ err: error }, "Chargement des participants impossible"));
}

/** Participants éligibles d'un giveaway, membres chargés au besoin. */
export async function eligibleEntries(guild: Guild, giveaway: Giveaway): Promise<string[]> {
  const entries = await entriesOf(giveaway.id);
  await loadMembers(guild);
  return eligible(guild, giveaway, entries);
}

/** Tire les gagnants, clôt le giveaway, met à jour le message et annonce le résultat. `false` : déjà clos. */
export async function drawGiveaway(guild: Guild, giveaway: Giveaway): Promise<boolean> {
  const winners = pickWinners(await eligibleEntries(guild, giveaway), giveaway.winner_count);
  const finished = await finishGiveaway(giveaway.id, winners);
  if (!finished) return false;
  await announce(guild, finished, winners);
  return true;
}

export async function announce(guild: Guild, giveaway: Giveaway, winners: string[], reroll = false) {
  const settings = await getSettings(guild.id);
  const message = await fetchGiveawayMessage(guild, giveaway);
  if (message) await message.edit(giveawayPayload(settings, giveaway, await countEntries(giveaway.id))).catch(() => {});
  const channel = guild.channels.cache.get(giveaway.channel_id);
  if (!channel?.isSendable()) return;
  const text = winners.length
    ? `🎉 ${reroll ? "Nouveau tirage ! " : ""}Félicitations ${mentions(winners)} : vous remportez **${giveaway.prize}** !`
    : `Personne ne remporte **${giveaway.prize}** : aucun participant éligible.`;
  await channel.send({ content: text, allowedMentions: { users: winners }, ...(message && { reply: { messageReference: message.id, failIfNotExists: false } }) });
}

export const giveawayHandler: ComponentHandler = {
  prefix: PREFIX,
  async handle(interaction, { settings, action, args }) {
    if (!isModuleEnabled(settings, MODULE)) throw new UserError("Les giveaways sont désactivés pour le moment.");
    if (action !== "participer") throw new Error(`Action de giveaway inconnue : ${action}`);
    const giveaway = await giveawayById(args[0] ?? "");
    if (!giveaway) throw new UserError("Ce giveaway n'existe plus.");
    if (giveaway.required_role_id && !interaction.member.roles.cache.has(giveaway.required_role_id)) {
      throw new UserError(`Ce giveaway est réservé aux membres qui ont le rôle <@&${giveaway.required_role_id}>.`);
    }
    const result = await toggleEntry(giveaway.id, interaction.user.id);
    if (!result) throw new UserError("Ce giveaway est terminé.");
    scheduleRefresh(interaction.guild, giveaway.id);
    return interaction.reply({
      content: result.entered ? `${ICON.valider} Tu participes à **${giveaway.prize}**. Bonne chance !` : `${ICON.retirer} Tu ne participes plus à **${giveaway.prize}**.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
