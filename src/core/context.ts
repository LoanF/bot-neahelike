import {
  MessageFlags,
  type ActionRowBuilder,
  type ChatInputCommandInteraction,
  type EmbedBuilder,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type MessageActionRowComponentBuilder,
  type Role,
  type User,
} from "discord.js";
import type { GuildSettings } from "@/config/store";
import { logger } from "@/logger";
import type { ArgValue, CommandDef } from "./command";
import { isPanel, panelTtlMs, TOKEN_LIFETIME_MS, trackPanel } from "./expiry";

export interface Payload {
  content?: string;
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export interface ReplyOptions {
  /** Visible uniquement par l'auteur de la commande. */
  private?: boolean;
}

/** Délai avant l'effacement d'une réponse privée qui n'a pas pu partir en MP. */
const FALLBACK_TTL_MS = 10_000;

interface Init {
  command: CommandDef;
  subcommand: string | null;
  settings: GuildSettings;
  member: GuildMember;
  channel: GuildTextBasedChannel | null;
  args: Map<string, ArgValue>;
  interaction?: ChatInputCommandInteraction<"cached">;
  message?: Message<true>;
}

/** Contexte commun aux commandes slash et préfixe : la commande ne sait pas d'où elle est appelée. */
export class CommandContext {
  readonly command: CommandDef;
  readonly subcommand: string | null;
  readonly settings: GuildSettings;
  readonly member: GuildMember;
  readonly channel: GuildTextBasedChannel | null;
  readonly interaction?: ChatInputCommandInteraction<"cached">;
  readonly message?: Message<true>;
  private readonly args: Map<string, ArgValue>;

  constructor(init: Init) {
    this.command = init.command;
    this.subcommand = init.subcommand;
    this.settings = init.settings;
    this.member = init.member;
    this.channel = init.channel;
    this.args = init.args;
    this.interaction = init.interaction;
    this.message = init.message;
  }

  get source(): "slash" | "prefixe" {
    return this.interaction ? "slash" : "prefixe";
  }

  get guild(): Guild {
    return this.member.guild;
  }

  get user(): User {
    return this.member.user;
  }

  get prefix(): string {
    return this.interaction ? "/" : this.settings.config.prefix;
  }

  string(name: string, required: true): string;
  string(name: string, required?: false): string | undefined;
  string(name: string) {
    const value = this.args.get(name);
    return typeof value === "string" ? value : undefined;
  }

  integer(name: string, required: true): number;
  integer(name: string, required?: false): number | undefined;
  integer(name: string) {
    const value = this.args.get(name);
    return typeof value === "number" ? value : undefined;
  }

  boolean(name: string): boolean | undefined {
    const value = this.args.get(name);
    return typeof value === "boolean" ? value : undefined;
  }

  userArg(name: string): User | undefined {
    return this.args.get(name) as User | undefined;
  }

  role(name: string, required: true): Role;
  role(name: string, required?: false): Role | undefined;
  role(name: string) {
    return this.args.get(name) as Role | undefined;
  }

  channelArg(name: string): GuildBasedChannel | undefined {
    return this.args.get(name) as GuildBasedChannel | undefined;
  }

  /** Signale un traitement long (slash : « réfléchit… », préfixe : « écrit… »). */
  async defer(options: ReplyOptions = {}) {
    if (this.interaction) {
      if (!this.interaction.deferred && !this.interaction.replied) {
        await this.interaction.deferReply(options.private ? { flags: MessageFlags.Ephemeral } : {});
      }
    } else if (this.channel?.isSendable()) {
      await this.channel.sendTyping().catch(() => {});
    }
  }

  /**
   * Répond à la commande.
   * En privé : réponse éphémère en slash ; en préfixe, le message du membre est retiré et la réponse part en MP,
   * avec un repli dans le salon effacé au bout de 10 s si les MP sont fermés.
   * Un panneau (composants) en préfixe reste dans le salon : seul son auteur peut s'en servir.
   */
  async reply(payload: Payload | string, options: ReplyOptions = {}) {
    const body: Payload = typeof payload === "string" ? { content: payload } : payload;

    const ttl = isPanel(body) ? panelTtlMs(this.settings) : 0;

    if (this.interaction) {
      const interaction = this.interaction;
      let sent: Message;
      if (interaction.deferred && !interaction.replied) {
        sent = await interaction.editReply(body);
      } else if (interaction.replied) {
        sent = await interaction.followUp({ ...body, ...(options.private && { flags: MessageFlags.Ephemeral }) });
      } else {
        await interaction.reply({ ...body, ...(options.private && { flags: MessageFlags.Ephemeral }) });
        if (!ttl) return;
        sent = await interaction.fetchReply();
      }
      // Panneau resté sans clic : effacé avec le jeton de la commande (15 minutes au plus).
      if (ttl) trackPanel(sent.id, () => interaction.deleteReply(sent), interaction.createdTimestamp + TOKEN_LIFETIME_MS, ttl);
      return;
    }

    const message = this.message!;
    const inChannel = () => message.reply({ ...body, allowedMentions: { repliedUser: false, parse: [] } });

    if (!options.private || body.components?.length) {
      const sent = await inChannel();
      if (ttl) trackPanel(sent.id, () => sent.delete(), Number.POSITIVE_INFINITY, ttl);
      return;
    }

    try {
      await message.author.send(body);
      await message.delete().catch(() => {});
    } catch {
      const sent = await inChannel();
      setTimeout(() => {
        sent.delete().catch(() => {});
        message.delete().catch(() => {});
      }, FALLBACK_TTL_MS).unref();
      logger.debug({ user: message.author.id }, "MP fermés : réponse privée affichée dans le salon");
    }
  }
}
