import { DiscordAPIError, RESTJSONErrorCodes, type Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import { fetchPublished, isGone } from "@/core/published";

const apiError = (code: number, status = 404) => new DiscordAPIError({ code, message: "erreur" }, code, status, "GET", "/test", {});

function guildWith(fetchMessage: () => Promise<unknown>, channelInCache = true) {
  const channel = { isTextBased: () => true, messages: { fetch: fetchMessage } };
  return {
    channels: {
      cache: new Map(channelInCache ? [["600000000000000001", channel]] : []),
      fetch: async () => {
        throw apiError(RESTJSONErrorCodes.UnknownChannel);
      },
    },
  } as unknown as Guild;
}

const ref = { channelId: "600000000000000001", messageId: "610000000000000001" };

describe("messages publiés", () => {
  it("ne considère supprimé qu'un message ou un salon que Discord déclare inconnu", () => {
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownMessage))).toBe(true);
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownChannel))).toBe(true);
    expect(isGone(apiError(0, 500))).toBe(false);
    expect(isGone(new Error("réseau"))).toBe(false);
  });

  it("renvoie le message quand il existe", async () => {
    const message = { id: ref.messageId };
    expect(await fetchPublished(guildWith(async () => message), ref)).toBe(message);
  });

  it("signale un message supprimé, ou un salon disparu", async () => {
    expect(
      await fetchPublished(
        guildWith(async () => {
          throw apiError(RESTJSONErrorCodes.UnknownMessage);
        }),
        ref,
      ),
    ).toBe("supprime");
    expect(await fetchPublished(guildWith(async () => ({}), false), ref)).toBe("supprime");
  });

  it("garde la référence en cas d'erreur passagère (panne, limite de débit)", async () => {
    const outage = guildWith(async () => {
      throw apiError(0, 503);
    });
    expect(await fetchPublished(outage, ref)).toBeNull();
    const network = guildWith(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await fetchPublished(network, ref)).toBeNull();
  });
});
