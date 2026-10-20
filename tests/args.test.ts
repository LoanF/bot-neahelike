import { describe, expect, it } from "vitest";
import { normalizeHexColor, parseBoolean, parseSnowflake, tokenize } from "@/core/args";

describe("tokenize", () => {
  it("découpe sur les espaces", () => {
    expect(tokenize("niveau creer Staff 50")).toEqual(["niveau", "creer", "Staff", "50"]);
  });

  it("regroupe les mots entre guillemets", () => {
    expect(tokenize('niveau creer "Grand Prêtre" 80')).toEqual(["niveau", "creer", "Grand Prêtre", "80"]);
    expect(tokenize("niveau creer « Grand Prêtre » 80")).toEqual(["niveau", "creer", "Grand Prêtre", "80"]);
  });
});

describe("parseSnowflake", () => {
  it("lit les mentions et les identifiants", () => {
    expect(parseSnowflake("<@123456789012345678>")).toBe("123456789012345678");
    expect(parseSnowflake("<@!123456789012345678>")).toBe("123456789012345678");
    expect(parseSnowflake("<@&123456789012345678>")).toBe("123456789012345678");
    expect(parseSnowflake("<#123456789012345678>")).toBe("123456789012345678");
    expect(parseSnowflake("123456789012345678")).toBe("123456789012345678");
    expect(parseSnowflake("Staff")).toBeNull();
  });
});

describe("parseBoolean", () => {
  it("comprend oui/non", () => {
    expect(parseBoolean("oui")).toBe(true);
    expect(parseBoolean("OFF")).toBe(false);
    expect(parseBoolean("peut-être")).toBeNull();
  });
});

describe("normalizeHexColor", () => {
  it("accepte avec ou sans dièse", () => {
    expect(normalizeHexColor("D1A64A")).toBe("#d1a64a");
    expect(normalizeHexColor("#1a150f")).toBe("#1a150f");
    expect(normalizeHexColor("#zzz")).toBeNull();
  });
});
