import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Tickets contre une vraie base où le schéma du site (avec bot_tickets) a été migré.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000002";
const OPENER = "900000000000000002";

describe.skipIf(!url)("tickets en base", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: GUILD,
    SITE_URL: "https://example.test",
  });

  const store = await import("@/modules/tickets/store");
  const { sql, closeDatabase } = await import("@/db");
  const open = (channelId: string, categoryId = "support") =>
    store.openTicket({ guildId: GUILD, channelId, categoryId, categoryLabel: "Support", openerId: OPENER, answers: [{ question: "Décris ta demande", answer: "Bonjour" }] });

  beforeEach(async () => {
    await sql()`delete from bot_tickets where guild_id = ${GUILD}`;
  });

  afterAll(async () => {
    await sql()`delete from bot_tickets where guild_id = ${GUILD}`;
    await closeDatabase();
  });

  it("ouvre un ticket numéroté avec ses réponses", async () => {
    const ticket = await open("700000000000000001");
    expect(ticket.status).toBe("ouvert");
    expect(ticket.number).toBeGreaterThan(0);
    expect(ticket.answers).toEqual([{ question: "Décris ta demande", answer: "Bonjour" }]);
    expect((await store.ticketByChannel("700000000000000001"))?.id).toBe(ticket.id);
  });

  it("refuse un second ticket ouvert dans la même catégorie, pas dans une autre", async () => {
    await open("700000000000000001");
    await expect(open("700000000000000002")).rejects.toThrow("déjà un ticket ouvert");
    await expect(open("700000000000000003", "partenariat")).resolves.toMatchObject({ category_id: "partenariat" });
  });

  it("ne ferme qu'une fois, puis permet d'en ouvrir un nouveau", async () => {
    const ticket = await open("700000000000000001");
    const closed = await store.closeTicket(ticket.id, { closedById: "800000000000000009", reason: "Résolu", transcript: "<html></html>" });
    expect(closed).toMatchObject({ status: "ferme", close_reason: "Résolu", transcript: "<html></html>" });
    expect(await store.closeTicket(ticket.id, { closedById: "x", reason: null, transcript: "" })).toBeUndefined();
    await expect(open("700000000000000002")).resolves.toMatchObject({ status: "ouvert" });
  });

  it("refuse de rouvrir si un autre ticket de la catégorie est déjà ouvert", async () => {
    const first = await open("700000000000000001");
    await store.closeTicket(first.id, { closedById: "x", reason: null, transcript: "" });
    await open("700000000000000002");
    await expect(store.reopenTicket(first.id)).rejects.toThrow("déjà un autre ticket ouvert");
  });

  it("rouvre un ticket fermé en effaçant la fermeture", async () => {
    const ticket = await open("700000000000000001");
    await store.closeTicket(ticket.id, { closedById: "x", reason: "r", transcript: "t" });
    expect(await store.reopenTicket(ticket.id)).toMatchObject({ status: "ouvert", close_reason: null, closed_by_id: null });
  });

  it("n'accepte qu'une note de 1 à 5, une seule fois, et seulement de l'auteur", async () => {
    const ticket = await open("700000000000000001");
    expect(await store.rateTicket(ticket.id, OPENER, 4)).toBeUndefined();
    await store.closeTicket(ticket.id, { closedById: "x", reason: null, transcript: "" });
    expect(await store.rateTicket(ticket.id, "autre", 5)).toBeUndefined();
    expect(await store.rateTicket(ticket.id, OPENER, 4)).toMatchObject({ rating: 4 });
    expect(await store.rateTicket(ticket.id, OPENER, 1)).toBeUndefined();
    const second = await open("700000000000000002");
    await store.closeTicket(second.id, { closedById: "x", reason: null, transcript: "" });
    await expect(store.rateTicket(second.id, OPENER, 6)).rejects.toThrow();
  });

  it("repère les tickets sans activité depuis plusieurs jours", async () => {
    const old = await open("700000000000000001");
    await open("700000000000000002", "partenariat");
    await sql()`update bot_tickets set last_activity_at = now() - interval '4 days' where id = ${old.id}`;
    expect((await store.inactiveTickets(GUILD, 3)).map(ticket => ticket.id)).toEqual([old.id]);
    await store.touchTicket("700000000000000001");
    expect(await store.inactiveTickets(GUILD, 3)).toEqual([]);
    expect((await store.openTicketChannels(GUILD)).sort()).toEqual(["700000000000000001", "700000000000000002"]);
  });

  it("ne laisse qu'un membre de l'équipe prendre en charge, même avec deux clics simultanés", async () => {
    const ticket = await open("700000000000000001");
    const results = await Promise.all([store.claimTicket(ticket.id, "800000000000000001"), store.claimTicket(ticket.id, "800000000000000002")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.claimTicket(ticket.id, "800000000000000003")).toBeUndefined();
  });

  it("compte les tickets ouverts d'une catégorie (suppression de la catégorie refusée tant qu'il y en a)", async () => {
    const ticket = await open("700000000000000001");
    await open("700000000000000002", "partenariat");
    expect(await store.countOpenInCategory(GUILD, "support")).toBe(1);
    await store.closeTicket(ticket.id, { closedById: "x", reason: null, transcript: "" });
    expect(await store.countOpenInCategory(GUILD, "support")).toBe(0);
  });

  it("ferme en base le ticket dont le salon a disparu, seulement si Discord confirme qu'il n'existe plus", async () => {
    const { DiscordAPIError, RESTJSONErrorCodes } = await import("discord.js");
    const { channelGone, closeDeletedTicket } = await import("@/modules/tickets");
    const unknown = new DiscordAPIError({ code: RESTJSONErrorCodes.UnknownChannel, message: "Unknown Channel" }, RESTJSONErrorCodes.UnknownChannel, 404, "GET", "/", {});
    const guild = (fetch: () => Promise<unknown>) => ({ channels: { cache: new Map([["700000000000000009", {}]]), fetch } }) as never;
    expect(await channelGone(guild(async () => ({})), "700000000000000009")).toBe(false);
    expect(await channelGone(guild(async () => Promise.reject(unknown)), "700000000000000001")).toBe(true);
    await expect(channelGone(guild(async () => Promise.reject(new Error("503"))), "700000000000000001")).rejects.toThrow("503");

    const ticket = await open("700000000000000001");
    await closeDeletedTicket("700000000000000001", "999999999999999999");
    expect(await store.ticketByChannel("700000000000000001")).toMatchObject({ id: ticket.id, status: "ferme", close_reason: "Salon supprimé" });
  });

  it("ne ferme pas un ticket dont les messages n'ont pas pu être lus", async () => {
    const { ensureGuild } = await import("@/config/store");
    const { close } = await import("@/modules/tickets/actions");
    await ensureGuild(GUILD);
    const ticket = await open("700000000000000001");
    const channel = {
      id: "700000000000000001",
      guild: { id: GUILD, name: "Néa Hélikè", members: { fetch: async () => Promise.reject(new Error("absent")) } },
      messages: {
        fetch: async () => {
          throw new Error("Limite de Discord");
        },
      },
    } as never;
    await expect(close(channel, ticket, { id: "800000000000000001", tag: "staff" }, null)).rejects.toThrow("il reste ouvert");
    expect((await store.ticketByChannel("700000000000000001"))?.status).toBe("ouvert");
  });
});
