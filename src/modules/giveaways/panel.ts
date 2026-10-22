import { ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, RoleSelectMenuBuilder, type Guild, type ModalSubmitInteraction } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { formatDuration } from "@/core/duration";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { cancel, publishGiveaway, rerollGiveaway } from "./actions";
import { draftMissing, DURATION_CHOICES, MAX_WINNERS, newDraft, parseGiveawayDuration, parseWinners, type GiveawayDraft } from "./logic";
import { countEntries, giveawayById, recentGiveaways, type Giveaway } from "./store";
import { drawGiveaway, giveawayPayload } from "./ui";

const PREFIX = "gva";

/** Un brouillon par membre, gardé une heure en mémoire. */
const DRAFT_TTL_MS = 60 * 60 * 1000;
const drafts = new Map<string, { draft: GiveawayDraft; expires: number }>();

const GUIDE =
  "**Nouveau giveaway** : choisissez le salon, la durée (menu ou formulaire), puis le lot, le nombre de gagnants et une description. " +
  "Un rôle exigé est facultatif. L'aperçu montre le message tel qu'il sera publié ; « Publier » s'active quand le lot et le salon sont choisis.\n" +
  "**Participation** : les membres cliquent sur 🎉 Participer ; un second clic retire leur participation.\n" +
  "**Tirage** : automatique à la fin, au hasard parmi les participants encore sur le serveur (et porteurs du rôle exigé). " +
  "Depuis ce panneau, choisissez un giveaway pour le tirer tout de suite, l'annuler, ou refaire un tirage une fois terminé (les gagnants précédents sont écartés).";

interface View {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
  notice?: string;
}

function id(view: View, action: string, ...args: string[]) {
  return customId(PREFIX, view.owner, action, ...args);
}

function withNotice(view: View, payload: Payload): Payload {
  return { content: view.notice ? status(view.notice) : "", ...payload };
}

const time = (iso: string | Date, style: "R" | "f") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
const STATUS = { en_cours: "🟢 En cours", termine: "🏁 Terminé", annule: "❌ Annulé" } as const;

// ─── Brouillons ─────────────────────────────────────────────────────────────

function draftKey(guildId: string, owner: string) {
  return `${guildId}:${owner}`;
}

export function getDraft(guildId: string, owner: string, now = Date.now()): GiveawayDraft {
  const saved = drafts.get(draftKey(guildId, owner));
  return saved && saved.expires > now ? saved.draft : newDraft();
}

export function saveDraft(guildId: string, owner: string, draft: GiveawayDraft, now = Date.now()) {
  drafts.set(draftKey(guildId, owner), { draft, expires: now + DRAFT_TTL_MS });
  for (const [key, saved] of drafts) if (saved.expires <= now) drafts.delete(key);
}

export function clearDraft(guildId: string, owner: string) {
  drafts.delete(draftKey(guildId, owner));
}

// ─── Vues ───────────────────────────────────────────────────────────────────

export function homeView(view: View, list: Giveaway[]): Payload {
  const running = list.filter(item => item.status === "en_cours");
  const line = (item: Giveaway) =>
    `${STATUS[item.status]} · **${item.prize}** · <#${item.channel_id}> · ${item.status === "en_cours" ? `fin ${time(item.ends_at, "R")}` : `clos ${time(item.ended_at ?? item.ends_at, "R")}`}`;
  return withNotice(view, {
    embeds: [
      embed(view.settings)
        .setTitle("🎉 Giveaways")
        .setDescription(list.map(line).join("\n").slice(0, 4000) || "*Aucun giveaway en cours ni récent.*")
        .setFooter({ text: `${running.length} en cours · terminés et annulés des 7 derniers jours` }),
    ],
    components: [
      ...(list.length
        ? [
            row(
              choice(
                id(view, "go", "voir"),
                list.map(item => ({ label: item.prize.slice(0, 100), value: `giveaway:${item.id}`, description: STATUS[item.status], emoji: "🎉" })),
                "Gérer un giveaway",
              ),
            ),
          ]
        : []),
      row(
        button(id(view, "go", "nouveau"), "Nouveau giveaway", { emoji: ICON.ajouter, style: ButtonStyle.Success }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

/** Aperçu du message publié, à partir du brouillon. */
export function draftPreview(settings: GuildSettings, draft: GiveawayDraft, hostId: string, now = Date.now()): Giveaway {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    guild_id: "",
    channel_id: draft.channelId ?? "",
    message_id: null,
    prize: draft.prize ?? "Lot à choisir",
    description: draft.description,
    winner_count: draft.winners,
    required_role_id: draft.roleId,
    host_id: hostId,
    status: "en_cours",
    winner_ids: [],
    ends_at: new Date(now + draft.durationMs).toISOString(),
    created_at: new Date(now).toISOString(),
    ended_at: null,
  };
}

export function draftView(view: View, draft: GiveawayDraft): Payload {
  const missing = draftMissing(draft);
  const preview = giveawayPayload(view.settings, draftPreview(view.settings, draft, view.owner), 0).embeds ?? [];
  const summary = embed(view.settings, "parchemin")
    .setTitle("Nouveau giveaway")
    .addFields(
      { name: "Lot", value: draft.prize ?? `${ICON.attention} *à choisir*`, inline: true },
      { name: "Salon", value: draft.channelId ? `<#${draft.channelId}>` : `${ICON.attention} *à choisir*`, inline: true },
      { name: "Durée", value: formatDuration(draft.durationMs), inline: true },
      { name: "Gagnants", value: String(draft.winners), inline: true },
      { name: "Rôle exigé", value: draft.roleId ? `<@&${draft.roleId}>` : "*Aucun : tout le monde*", inline: true },
    )
    .setFooter({ text: missing.length ? `Il manque ${missing.join(" et ")} pour publier.` : "Prêt à publier." });

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(id(view, "salon"))
    .setPlaceholder("Salon de publication")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (draft.channelId && view.guild.channels.cache.has(draft.channelId)) channelSelect.addDefaultChannels(draft.channelId);
  const roleSelect = new RoleSelectMenuBuilder().setCustomId(id(view, "role")).setPlaceholder("Rôle exigé pour participer (facultatif)").setMinValues(0).setMaxValues(1);
  if (draft.roleId && view.guild.roles.cache.has(draft.roleId)) roleSelect.addDefaultRoles(draft.roleId);

  return withNotice(view, {
    embeds: [summary, ...preview],
    components: [
      row(channelSelect),
      row(roleSelect),
      row(
        choice(
          id(view, "duree"),
          DURATION_CHOICES.map(item => ({ label: item.label, value: String(item.ms), default: item.ms === draft.durationMs })),
          "Durée du giveaway",
        ),
      ),
      row(
        button(id(view, "details"), "Lot, gagnants, description", { emoji: ICON.modifier }),
        button(id(view, "publier"), "Publier", { emoji: "📤", style: ButtonStyle.Success, disabled: missing.length > 0 }),
        button(id(view, "brouillon-effacer"), "Recommencer", { emoji: ICON.reinitialiser, style: ButtonStyle.Secondary }),
        button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

export function giveawayView(view: View, giveaway: Giveaway, entries: number): Payload {
  const link = giveaway.message_id ? `https://discord.com/channels/${view.guild.id}/${giveaway.channel_id}/${giveaway.message_id}` : null;
  const details = embed(view.settings)
    .setTitle(`🎉 ${giveaway.prize}`)
    .setDescription(giveaway.description || null)
    .addFields(
      { name: "État", value: STATUS[giveaway.status], inline: true },
      { name: "Salon", value: `<#${giveaway.channel_id}>`, inline: true },
      { name: "Participants", value: String(entries), inline: true },
      { name: giveaway.status === "en_cours" ? "Fin" : "Clos", value: time(giveaway.status === "en_cours" ? giveaway.ends_at : (giveaway.ended_at ?? giveaway.ends_at), "f"), inline: true },
      { name: "Gagnants prévus", value: String(giveaway.winner_count), inline: true },
      { name: "Organisé par", value: `<@${giveaway.host_id}>`, inline: true },
    );
  if (giveaway.required_role_id) details.addFields({ name: "Rôle exigé", value: `<@&${giveaway.required_role_id}>`, inline: true });
  if (giveaway.status === "termine") details.addFields({ name: "Gagnants", value: giveaway.winner_ids.map(winner => `<@${winner}>`).join(", ") || "*Aucun participant éligible*" });

  const actions =
    giveaway.status === "en_cours"
      ? [
          button(id(view, "tirer", giveaway.id), "Tirer maintenant", { emoji: "🎲", style: ButtonStyle.Success }),
          button(id(view, "go", "annuler", giveaway.id), "Annuler le giveaway", { emoji: ICON.annuler, style: ButtonStyle.Danger }),
        ]
      : giveaway.status === "termine"
        ? [button(id(view, "relancer", giveaway.id), "Nouveau tirage", { emoji: "🔁" })]
        : [];
  return withNotice(view, {
    embeds: [details],
    components: [
      row(
        ...actions,
        ...(link ? [new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(link).setLabel("Voir le message")] : []),
        button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

export function cancelView(view: View, giveaway: Giveaway): Payload {
  return withNotice(view, {
    embeds: [embed(view.settings, "bronze").setTitle(`${ICON.attention} Annuler « ${giveaway.prize} » ?`).setDescription("Le giveaway est clos sans gagnant ; son message l'indique. Les participants ne sont pas prévenus.")],
    components: [
      row(
        button(id(view, "annuler", giveaway.id), "Annuler le giveaway", { emoji: ICON.annuler, style: ButtonStyle.Danger }),
        button(id(view, "go", "giveaway", giveaway.id), "Garder le giveaway", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

async function findGiveaway(guild: Guild, giveawayId: string): Promise<Giveaway> {
  const giveaway = await giveawayById(giveawayId);
  if (!giveaway || giveaway.guild_id !== guild.id) throw new UserError("Ce giveaway n'existe plus.");
  return giveaway;
}

/** Rendu d'une vue du panneau, avec les données à jour. */
export async function renderGiveawayPanel(view: View, target = "accueil"): Promise<Payload> {
  const [name, arg = ""] = target.split(":");
  switch (name) {
    case "nouveau":
      return draftView(view, getDraft(view.guild.id, view.owner));
    case "giveaway": {
      const giveaway = await findGiveaway(view.guild, arg);
      return giveawayView(view, giveaway, await countEntries(giveaway.id));
    }
    case "annuler":
      return cancelView(view, await findGiveaway(view.guild, arg));
    default:
      return homeView(view, await recentGiveaways(view.guild.id));
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = await renderGiveawayPanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

/** Accuse réception tout de suite pour les actions qui appellent Discord ou la base plusieurs fois. */
async function deferPanel(interaction: PanelInteraction) {
  if (interaction.deferred || interaction.replied) return;
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) return;
  await interaction.deferUpdate();
}

export const giveawayPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "giveaway",
  async handle(interaction, { settings, action, args }) {
    const guildId = interaction.guildId;
    const owner = interaction.user.id;
    const view: View = { settings, guild: interaction.guild, owner };
    const arg = args[0] ?? "";
    const draft = getDraft(guildId, owner);
    const update = (change: Partial<GiveawayDraft>, notice?: string) => {
      saveDraft(guildId, owner, { ...draft, ...change });
      return show(interaction, "nouveau", notice);
    };

    switch (action) {
      case "go":
        return show(interaction, interaction.isStringSelectMenu() ? (interaction.values[0] ?? "accueil") : args.join(":"));
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Giveaways`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();

      // Brouillon
      case "salon": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        return update({ channelId: interaction.values[0] ?? null });
      }
      case "role": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        return update({ roleId: interaction.values[0] ?? null });
      }
      case "duree": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        return update({ durationMs: Number(interaction.values[0]) });
      }
      case "details":
        if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
        return interaction.showModal(
          modal(id(view, "details-ok"), "Nouveau giveaway", [
            { id: "lot", label: "Lot (ce qui est à gagner)", value: draft.prize, required: true, maxLength: 200, placeholder: "Une voiture de luxe en jeu" },
            { id: "gagnants", label: `Nombre de gagnants (1 à ${MAX_WINNERS})`, value: String(draft.winners), required: true, maxLength: 2 },
            { id: "duree", label: "Durée (ex. 30m, 2h, 1h30, 3j, 1sem)", value: formatDurationInput(draft.durationMs), required: true, maxLength: 20 },
            { id: "description", label: "Description (facultatif)", value: draft.description, long: true, maxLength: 1000, placeholder: "Pour fêter l'ouverture de la cité !" },
          ]),
        );
      case "details-ok": {
        const form = submitted(interaction);
        const prize = field(form, "lot");
        if (!prize) throw new UserError("Indiquez le lot.");
        return update(
          {
            prize,
            winners: parseWinners(field(form, "gagnants"), draft.winners),
            durationMs: parseGiveawayDuration(field(form, "duree") ?? formatDurationInput(draft.durationMs)),
            description: field(form, "description"),
          },
          "Giveaway mis à jour : vérifiez l'aperçu.",
        );
      }
      case "brouillon-effacer":
        clearDraft(guildId, owner);
        return show(interaction, "nouveau", "Brouillon effacé.");
      case "publier": {
        await deferPanel(interaction);
        const published = await publishGiveaway(interaction.guild, settings, draft, owner);
        clearDraft(guildId, owner);
        return show(interaction, `giveaway:${published.id}`, `Giveaway publié dans <#${published.channel_id}>.`);
      }

      // Giveaway publié
      case "tirer": {
        await deferPanel(interaction);
        const giveaway = await findGiveaway(interaction.guild, arg);
        if (giveaway.status !== "en_cours") throw new UserError("Ce giveaway est déjà clos.");
        if (!(await drawGiveaway(interaction.guild, giveaway))) throw new UserError("Ce giveaway vient d'être clos par le tirage automatique.");
        return show(interaction, `giveaway:${giveaway.id}`, "Tirage effectué : les gagnants sont annoncés dans le salon.");
      }
      case "relancer": {
        const giveaway = await findGiveaway(interaction.guild, arg);
        if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
        return interaction.showModal(
          modal(id(view, "relancer-ok", giveaway.id), "Nouveau tirage", [
            { id: "gagnants", label: `Nombre de nouveaux gagnants (1 à ${MAX_WINNERS})`, value: String(giveaway.winner_count), required: true, maxLength: 2 },
          ]),
        );
      }
      case "relancer-ok": {
        const count = parseWinners(field(submitted(interaction), "gagnants"), 1);
        await deferPanel(interaction);
        const giveaway = await findGiveaway(interaction.guild, arg);
        const winners = await rerollGiveaway(interaction.guild, giveaway, count);
        return show(interaction, `giveaway:${giveaway.id}`, `Nouveau tirage : ${winners.length} gagnant(s) annoncé(s).`);
      }
      case "annuler": {
        await deferPanel(interaction);
        const cancelled = await cancel(interaction.guild, await findGiveaway(interaction.guild, arg));
        return show(interaction, `giveaway:${cancelled.id}`, "Giveaway annulé.");
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};

/** Durée du brouillon telle qu'on la saisirait : « 1j », « 2h », « 1h30 », « 45m ». */
export function formatDurationInput(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}j`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes > 60) return `${Math.floor(minutes / 60)}h${minutes % 60}`;
  return `${minutes}m`;
}
