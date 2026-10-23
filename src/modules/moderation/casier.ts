import { ButtonStyle, MessageFlags, UserSelectMenuBuilder, type User } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { removeSanction } from "./actions";
import { cleanReason, durationSuffix, SANCTION_LABELS, sanctionState, type SanctionType } from "./logic";
import { countSanctions, sanctionByNumber, sanctionsOf, type Sanction } from "./store";

const PREFIX = "cas";

const STATE_LABELS = { levee: "levée", expiree: "terminée", active: "en cours", definitive: "" } as const;
const time = (iso: string, style: "R" | "f" | "d" = "d") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;

const GUIDE =
  "**Consulter** : choisissez un membre dans le menu, ou « Saisir un ID » pour quelqu'un qui a quitté le serveur (un banni, par exemple). " +
  "Ses sanctions s'affichent de la plus récente à la plus ancienne, numérotées (#12), avec l'auteur, la raison et l'état.\n" +
  "**Retirer** : choisissez une sanction dans le second menu et indiquez la raison du retrait. Une sanction en cours est levée sur Discord aussi " +
  "(débannissement, fin d'exclusion). Retirer un bannissement demande la permission « Bannir des membres » ; la hiérarchie des rôles s'applique.\n" +
  "**Sanctionner** : `/warn`, `/timeout`, `/kick`, `/ban`, `/tempban` ; chaque sanction arrive ici.";

/** Ligne du casier : numéro, type, date, durée, auteur, raison et état. */
export function sanctionLine(item: Sanction, now = new Date()): string {
  const { label, emoji } = SANCTION_LABELS[item.type];
  const duration = item.ends_at ? durationSuffix(new Date(item.ends_at).getTime() - new Date(item.created_at).getTime()) : "";
  const state = STATE_LABELS[sanctionState(item, now)];
  const head = `${emoji} **#${item.number} ${label}**${duration} · ${time(item.created_at)} · par <@${item.moderator_id}>${state ? ` · *${state}*` : ""}`;
  return `${head}\n> ${item.reason.slice(0, 200).replace(/\n/g, " ")}`;
}

export function casierEmbed(settings: GuildSettings, user: Pick<User, "id" | "tag">, sanctions: Sanction[], counts: Record<SanctionType, number>) {
  const summary = (Object.keys(SANCTION_LABELS) as SanctionType[]).map(type => `${SANCTION_LABELS[type].emoji} ${counts[type]}`).join(" · ");
  const lines: string[] = [];
  let length = 0;
  for (const item of sanctions) {
    const line = sanctionLine(item);
    // Limite de la description d'un embed (4096) : les plus anciennes sanctions sont résumées.
    if (length + line.length > 3800) {
      lines.push(`*… et ${sanctions.length - lines.length} sanction(s) plus ancienne(s).*`);
      break;
    }
    lines.push(line);
    length += line.length + 2;
  }
  return embed(settings, "bronze")
    .setTitle(`⚖️ Casier de ${user.tag}`)
    .setDescription(lines.join("\n\n") || "*Casier vierge.*")
    .setFooter({ text: `Sanctions en vigueur : ${summary}` });
}

export interface CasierView {
  settings: GuildSettings;
  owner: string;
  notice?: string;
}

export interface CasierTarget {
  user: Pick<User, "id" | "tag">;
  sanctions: Sanction[];
  counts: Record<SanctionType, number>;
}

/** Panneau du casier : choix du membre, puis ses sanctions et le retrait d'une sanction non levée. */
export function casierView(view: CasierView, target: CasierTarget | null): Payload {
  const id = (action: string, ...args: string[]) => customId(PREFIX, view.owner, action, ...args);
  const members = new UserSelectMenuBuilder().setCustomId(id("membre")).setPlaceholder("Choisir un membre");
  if (target) members.addDefaultUsers(target.user.id);
  const removable = target?.sanctions.filter(item => !item.revoked_at) ?? [];

  return {
    content: view.notice ? status(view.notice) : "",
    embeds: [
      target
        ? casierEmbed(view.settings, target.user, target.sanctions, target.counts)
        : embed(view.settings, "bronze").setTitle("⚖️ Casier").setDescription("Choisissez un membre dans le menu pour voir ses sanctions, ou saisissez l'ID de quelqu'un qui a quitté le serveur."),
    ],
    components: [
      row(members),
      ...(target && removable.length
        ? [
            row(
              choice(
                id("retirer", target.user.id),
                removable.slice(0, 25).map(item => ({
                  label: `#${item.number} ${SANCTION_LABELS[item.type].label}`,
                  value: String(item.number),
                  description: item.reason.slice(0, 100),
                  emoji: SANCTION_LABELS[item.type].emoji,
                })),
                "Retirer une sanction…",
              ),
            ),
          ]
        : []),
      row(
        button(id("saisir"), "Saisir un ID", { emoji: ICON.modifier, style: ButtonStyle.Secondary }),
        button(id("aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id("fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  };
}

export async function loadTarget(guildId: string, user: Pick<User, "id" | "tag">): Promise<CasierTarget> {
  const [sanctions, counts] = await Promise.all([sanctionsOf(guildId, user.id), countSanctions(guildId, user.id)]);
  return { user, sanctions, counts };
}

async function show(interaction: PanelInteraction, payload: Payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else if (interaction.isModalSubmit()) await interaction.editReply(payload);
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction) {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

const SNOWFLAKE = /^\d{17,20}$/;

export const casierPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "casier",
  async handle(interaction, { settings, action, args }) {
    const view: CasierView = { settings, owner: interaction.user.id };
    const open = async (userId: string, notice?: string) => {
      const user = await interaction.client.users.fetch(userId).catch(() => null);
      if (!user) throw new UserError("Utilisateur Discord introuvable.");
      return show(interaction, casierView({ ...view, settings: await getSettings(interaction.guildId), notice }, await loadTarget(interaction.guildId, user)));
    };

    switch (action) {
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Casier`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();
      case "membre": {
        if (!interaction.isUserSelectMenu()) throw new Error("Menu de membres attendu.");
        const user = interaction.users.first();
        if (!user) return show(interaction, casierView(view, null));
        await interaction.deferUpdate();
        return open(user.id);
      }
      case "saisir":
        if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
        return interaction.showModal(modal(customId(PREFIX, view.owner, "saisir-ok"), "Casier d'un ID Discord", [{ id: "id", label: "ID Discord (17 à 20 chiffres)", required: true, maxLength: 25 }]));
      case "saisir-ok": {
        const typed = field(submitted(interaction), "id")?.replace(/^<@!?(\d+)>$/, "$1") ?? "";
        if (!SNOWFLAKE.test(typed)) throw new UserError("Cet ID Discord n'est pas valide : 17 à 20 chiffres.");
        await interaction.deferUpdate();
        return open(typed);
      }
      case "retirer": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        const number = interaction.values[0] ?? "";
        return interaction.showModal(
          modal(customId(PREFIX, view.owner, "retirer-ok", args[0] ?? "", number), `Retirer la sanction #${number}`, [
            { id: "raison", label: "Raison du retrait", long: true, maxLength: 500, placeholder: "Erreur de modération, contestation acceptée…" },
          ]),
        );
      }
      case "retirer-ok": {
        const reason = cleanReason(field(submitted(interaction), "raison"));
        await interaction.deferUpdate();
        const item = await sanctionByNumber(interaction.guildId, Number(args[1]));
        if (!item) throw new UserError(`Aucune sanction #${args[1]} sur ce serveur.`);
        const revoked = await removeSanction(interaction.member, item, reason);
        return open(args[0] ?? revoked.user_id, `Sanction **#${revoked.number}** (${SANCTION_LABELS[revoked.type].label.toLowerCase()}) retirée.`);
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
