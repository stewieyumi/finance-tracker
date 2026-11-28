import { test, expect, returningData, storedData } from "./fixtures";

for (const theme of ["light", "dark"] as const) for (const explicit of [false, true]) {
  test(`goal displays and summary agree with ${explicit ? "explicit" : "default"} wallet in ${theme}`, async ({ page, isolatedApp }, info) => {
    const data = returningData();
    data.wallets = { cw_primary: 4250, cash: 1500 };
    data.settings = { ...data.settings, theme, defaultWallet: "cw_primary", milestoneWallet: explicit ? "cash" : undefined,
      targetFund: 10000, goalName: "Safety fund", customWallets: [{ id: "cw_primary", label: "Primary Bank" }, { id: "cash", label: "Cash" }] };
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => { (window as typeof window & { goalSummary?: string }).goalSummary = value; },
    } }));
    const app = await isolatedApp(data); await app.waitForSaved(); const before = await storedData(page);
    const amount = explicit ? "1,500.00" : "4,250.00";
    const percent = explicit ? "15.0" : "42.5";
    const label = explicit ? "Cash" : "Primary Bank";
    await expect(page.getByText("Fund Progress", { exact: true }).locator("..")).toContainText(`${percent}%`);
    const goals = page.getByRole("region", { name: "Goals", exact: true });
    await expect(goals).toContainText(amount); await expect(goals).toContainText(`${percent}%`);
    await page.getByRole("button", { name: "Runway", exact: true }).click();
    const analytics = page.getByRole("dialog", { name: "Financial Intelligence Modal", exact: true });
    await analytics.getByRole("button", { name: "Goals", exact: true }).click();
    const balance = analytics.getByText(`${label} Balance`, { exact: true }).locator("..");
    await expect(balance).toContainText(`₱${amount}`); await expect(balance).toContainText("₱10,000.00");
    await balance.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`goal-${theme}-${explicit ? "explicit" : "default"}.png`) });
    await analytics.getByRole("button", { name: "Close analytics modal" }).click();
    await page.getByRole("button", { name: "Copy Summary", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { goalSummary?: string }).goalSummary)).toContain(`Safety fund: ₱${amount} / ₱10,000.00 (${percent}%) · ${label}`);
    expect(await storedData(page)).toEqual(before);
  });
}
