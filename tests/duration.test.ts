import { describe, expect, it } from "vitest";
import { DAY, formatDuration, HOUR, MINUTE, parseDuration } from "@/core/duration";

const bounds = { min: 1000, max: 28 * DAY, what: "Une exclusion" };

describe("durées", () => {
  it("lit les unités françaises et anglaises, combinées", () => {
    expect(parseDuration("45s", bounds)).toBe(45_000);
    expect(parseDuration("10m", bounds)).toBe(10 * MINUTE);
    expect(parseDuration("1h30", bounds)).toBe(90 * MINUTE);
    expect(parseDuration("2j 3h", bounds)).toBe(2 * DAY + 3 * HOUR);
    expect(parseDuration("1w", bounds)).toBe(7 * DAY);
  });

  it("explique les bornes avec le nom de ce qui dure", () => {
    expect(() => parseDuration("29j", bounds)).toThrow("Une exclusion dure au plus 4 semaines.");
    expect(() => parseDuration("0s", bounds)).toThrow("Une exclusion dure au moins 1 seconde.");
    expect(() => parseDuration("bientôt", bounds)).toThrow("Durée invalide");
  });

  it("écrit une durée lisible avec ses deux plus grandes unités", () => {
    expect(formatDuration(30_000)).toBe("30 secondes");
    expect(formatDuration(MINUTE)).toBe("1 minute");
    expect(formatDuration(2 * DAY + 3 * HOUR + 5 * MINUTE)).toBe("2 jours 3 heures");
    expect(formatDuration(9 * DAY)).toBe("9 jours");
    expect(formatDuration(14 * DAY)).toBe("2 semaines");
    expect(formatDuration(0)).toBe("0 seconde");
  });
});
