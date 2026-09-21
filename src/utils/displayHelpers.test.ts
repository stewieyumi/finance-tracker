import { describe, expect, it } from "vitest";
import { formatOrdinal, formatShortDate } from "./displayHelpers";

describe("display helpers", () => {
  it("formats ordinal numbers", () => {
    expect(formatOrdinal(1)).toBe("1st");
    expect(formatOrdinal(2)).toBe("2nd");
    expect(formatOrdinal(3)).toBe("3rd");
    expect(formatOrdinal(4)).toBe("4th");
    expect(formatOrdinal(21)).toBe("21st");
    expect(formatOrdinal(22)).toBe("22nd");
    expect(formatOrdinal(23)).toBe("23rd");
    expect(formatOrdinal(31)).toBe("31st");
  });

  it("formats short dates", () => {
    expect(formatShortDate("2026-01-05")).toBe("Jan 5");
    expect(formatShortDate("2026-09-21")).toBe("Sep 21");
  });

  it("handles missing and invalid date input", () => {
    expect(formatShortDate()).toBe("");
    expect(formatShortDate("")).toBe("");
    expect(formatShortDate("not-a-date")).toBe("a NaN");
  });
});
