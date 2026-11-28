import { test, expect, returningData, storedData } from "./fixtures";

for (const [width, height] of [[320, 568], [375, 812], [568, 320], [768, 1024], [1280, 720]]) for (const theme of ["light", "dark"] as const) {
  test(`installment history explains estimates and conflicts ${width}x${height} ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === "phone" ? width >= 640 : width < 640, "Matching touch/desktop profile only.");
    await page.setViewportSize({ width, height });
    await page.clock.setFixedTime(new Date("2026-11-28T04:00:00Z"));
    const data = returningData(); data.settings = { ...data.settings, theme };
    data.library.bills = ["Older plan", "Confirmed later", "Recorded plan", "Conflicting plan"].map((name, index) => ({
      id: `loan-${index}`, name, amount: 100, dueDay: "15", type: "Loan / Installment", wallet: "main", startMonth: "January 2026", endMonth: "March 2026",
    }));
    const at = "2026-01-15T04:00:00Z", later = "2026-11-15T04:00:00Z";
    data.logs = { "January 2026": { billsPaid: ["loan-0", "loan-1", "loan-2"], billSettlements: {
      "loan-1": [{ id: "prior", amount: 100, paidAt: later, priorConfirmation: true, wallet: null, walletDebit: 0, historyComplete: true, statusHistory: [{ paid: true, at: later }] }],
      "loan-2": [{ id: "recorded", amount: 100, paidAt: at, wallet: "main", walletDebit: 100, historyComplete: true, statusHistory: [{ paid: true, at }] }],
      "loan-3": [{ id: "conflict", amount: 100, paidAt: at, wallet: "main", walletDebit: 100, historyComplete: true, statusHistory: [{ paid: true, at }] }],
    } } };
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (value: string) => { (window as typeof window & { historySummary?: string }).historySummary = value; },
    } }));
    await isolatedApp(data); const before = await storedData(page);
    await page.getByRole("button", { name: "Runway", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Financial Intelligence Modal", exact: true });
    await modal.getByRole("button", { name: "Debt", exact: true }).click();
    const toggle = modal.getByText("Payment history details (3)", { exact: true });
    const details = toggle.locator("..");
    await expect(details).not.toHaveAttribute("open", ""); await toggle.click();
    await expect(details).toContainText("January 2026: Marked paid without a detailed payment record; paid amount uses the saved installment amount.");
    await expect(details).toContainText("January 2026: Confirmed as paid later; original payment date is unknown.");
    await expect(details).toContainText("Review: Paid status and settlement records disagree.");
    await expect(details.getByText("Estimated history", { exact: true })).toHaveCount(2);
    await expect(details.getByText("History needs review", { exact: true })).toHaveCount(1);
    await expect(details).not.toContainText("Recorded plan");
    expect(await details.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await details.getByText("Older plan", { exact: true }).scrollIntoViewIfNeeded();
    if ([375, 1280].includes(width)) await page.screenshot({ path: info.outputPath(`history-${theme}-${width}.png`) });
    const help = details.getByText(/For missing paid months/); await help.scrollIntoViewIfNeeded(); await expect(help).toBeInViewport();
    await modal.getByRole("button", { name: "Close analytics modal" }).click();
    await page.getByRole("button", { name: "Copy Summary", exact: true }).click();
    await expect.poll(() => page.evaluate(() => (window as typeof window & { historySummary?: string }).historySummary)).toContain("Older plan: 1/3 installments; ₱100.00 paid; ₱200.00 remaining scheduled — Estimated history");
    const summary = await page.evaluate(() => (window as typeof window & { historySummary?: string }).historySummary);
    expect(summary).toContain("Review: Paid status and settlement records disagree.");
    expect(summary).toContain("January 2026: Confirmed as paid later; original payment date is unknown.");
    expect(summary).not.toContain("history needs review / estimate");
    expect(await storedData(page)).toEqual(before);
  });
}
