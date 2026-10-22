import { ChannelType, type Guild, type GuildMember, type User } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { serverInfoEmbed, userInfoEmbed } from "@/modules/infos";

const settings = { config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" } } as unknown as GuildSettings;
const GUILD = "100000000000000001";

const user = {
  id: "300000000000000001",
  username: "kallias",
  globalName: "Kallias",
  bot: false,
  createdAt: new Date("2020-01-01T00:00:00Z"),
  displayAvatarURL: () => "https://cdn.example/a.png",
  toString: () => "<@300000000000000001>",
} as unknown as User;

describe("informations", () => {
  it("décrit un membre : arrivée, rôles triés sans @everyone, exclusion en cours", () => {
    const roles = new Map([
      [GUILD, { id: GUILD, position: 0, toString: () => "@everyone" }],
      ["r1", { id: "r1", position: 1, toString: () => "<@&r1>" }],
      ["r2", { id: "r2", position: 5, toString: () => "<@&r2>" }],
    ]);
    const member = {
      displayName: "Theron",
      guild: { id: GUILD },
      joinedAt: new Date("2026-01-01T00:00:00Z"),
      premiumSince: null,
      roles: { cache: roles },
      displayAvatarURL: () => "https://cdn.example/m.png",
      isCommunicationDisabled: () => true,
      communicationDisabledUntil: new Date("2026-10-23T00:00:00Z"),
    } as unknown as GuildMember;
    const data = userInfoEmbed(settings, user, member).toJSON();
    expect(data.title).toBe("Theron");
    const fields = Object.fromEntries((data.fields ?? []).map(field => [field.name, field.value]));
    expect(fields["Rôles (2)"]).toBe("<@&r2> <@&r1>");
    expect(fields["Exclu jusqu'au"]).toContain("<t:");
  });

  it("décrit un utilisateur qui n'est pas sur le serveur", () => {
    const data = userInfoEmbed(settings, user, null).toJSON();
    expect(data.title).toBe("Kallias");
    expect(data.footer?.text).toBe("Pas sur le serveur");
  });

  it("compte les salons textuels et vocaux du serveur", () => {
    const guild = {
      id: GUILD,
      name: "Néa Hélikè",
      ownerId: "300000000000000002",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      memberCount: 120,
      premiumSubscriptionCount: 3,
      premiumTier: 1,
      channels: { cache: new Map([["a", { type: ChannelType.GuildText }], ["b", { type: ChannelType.GuildVoice }], ["c", { type: ChannelType.GuildCategory }]]) },
      roles: { cache: { size: 8 } },
      emojis: { cache: { size: 4 } },
      iconURL: () => null,
      bannerURL: () => null,
    } as unknown as Guild;
    const fields = Object.fromEntries((serverInfoEmbed(settings, guild).toJSON().fields ?? []).map(field => [field.name, field.value]));
    expect(fields).toMatchObject({ Membres: "120", Salons: "1 textuels · 1 vocaux", Rôles: "7", Boosts: "3 (niveau 1)" });
  });
});
