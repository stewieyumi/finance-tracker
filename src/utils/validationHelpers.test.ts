import { describe, it, expect } from "vitest";
import { isValidFinanceData } from "./validationHelpers";
import { INITIAL_UNIFIED_DATA } from "../constants/initialData";

describe("isValidFinanceData", () => {
  it("returns true for valid baseline structure", () => {
    expect(isValidFinanceData(INITIAL_UNIFIED_DATA)).toBe(true);
  });

  it("returns true when updatedAt is missing or undefined (legacy compatibility)", () => {
    const dataWithoutUpdatedAt = { ...INITIAL_UNIFIED_DATA };
    delete (dataWithoutUpdatedAt as any).updatedAt;
    expect(isValidFinanceData(dataWithoutUpdatedAt)).toBe(true);
  });

  it("returns false for non-object and null values", () => {
    expect(isValidFinanceData(null)).toBe(false);
    expect(isValidFinanceData(undefined)).toBe(false);
    expect(isValidFinanceData("string")).toBe(false);
    expect(isValidFinanceData(12345)).toBe(false);
    expect(isValidFinanceData(true)).toBe(false);
  });

  it("returns false for missing wallets", () => {
    const data = { ...INITIAL_UNIFIED_DATA };
    delete (data as any).wallets;
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for wallets with wrong type", () => {
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, wallets: "not-an-object" })).toBe(false);
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, wallets: null })).toBe(false);
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, wallets: 123 })).toBe(false);
  });

  it("returns false for missing library", () => {
    const data = { ...INITIAL_UNIFIED_DATA };
    delete (data as any).library;
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for library with wrong type", () => {
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, library: "not-an-object" })).toBe(false);
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, library: null })).toBe(false);
  });

  it("returns false for missing bills in library", () => {
    const data = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        receivables: [],
        shoots: [],
      },
    };
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for bills with wrong type", () => {
    const data = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        ...INITIAL_UNIFIED_DATA.library,
        bills: "not-an-array",
      },
    };
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for missing receivables in library", () => {
    const data = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        bills: [],
        shoots: [],
      },
    };
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for receivables with wrong type", () => {
    const data = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        ...INITIAL_UNIFIED_DATA.library,
        receivables: { not: "array" },
      },
    };
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for missing shoots in library", () => {
    const data = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        bills: [],
        receivables: [],
      },
    };
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for shoots with wrong type", () => {
    const data = {
      ...INITIAL_UNIFIED_DATA,
      library: {
        ...INITIAL_UNIFIED_DATA.library,
        shoots: null,
      },
    };
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for missing logs", () => {
    const data = { ...INITIAL_UNIFIED_DATA };
    delete (data as any).logs;
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for logs with wrong type", () => {
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, logs: "string-log" })).toBe(false);
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, logs: null })).toBe(false);
  });

  it("returns false for missing settings", () => {
    const data = { ...INITIAL_UNIFIED_DATA };
    delete (data as any).settings;
    expect(isValidFinanceData(data)).toBe(false);
  });

  it("returns false for settings with wrong type", () => {
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, settings: 42 })).toBe(false);
    expect(isValidFinanceData({ ...INITIAL_UNIFIED_DATA, settings: null })).toBe(false);
  });
});
