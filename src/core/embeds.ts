import { EmbedBuilder } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { hexToInt } from "./args";

/** Or pour l'essentiel ; bronze pour les messages neutres ou sérieux (logs, sanctions, refus, blacklist) ; parchemin en accent (aide, détails). */
export type Tone = "or" | "bronze" | "parchemin";

export function embed(settings: GuildSettings, tone: Tone = "or"): EmbedBuilder {
  const { embed_color, embed_color_dark, embed_color_light } = settings.config;
  const color = tone === "bronze" ? embed_color_dark : tone === "parchemin" ? embed_color_light : embed_color;
  return new EmbedBuilder().setColor(hexToInt(color));
}

export function notice(settings: GuildSettings, description: string, title?: string): EmbedBuilder {
  const result = embed(settings).setDescription(description);
  return title ? result.setTitle(title) : result;
}

export function failure(settings: GuildSettings, description: string): EmbedBuilder {
  return embed(settings, "bronze").setDescription(description);
}
