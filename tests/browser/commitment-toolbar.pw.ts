import { test, expect, returningData, storedData, navigate } from "./fixtures";

for (const width of [320, 360, 375, 390, 430, 568, 768, 1024, 1280, 1920]) for (const theme of ["light", "dark"] as const) {
  test(`commitment controls align and work ${width} ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === "phone" ? width >= 640 : width < 640, "Matching touch/desktop profile only.");
    await page.setViewportSize({ width, height: 812 });
    await page.clock.setFixedTime(new Date("2026-09-28T04:00:00Z"));
    const data = returningData(); data.settings = { ...data.settings, theme };
    data.library.bills = [
      { id: "internet", name: "Internet", amount: 100, dueDay: "30", type: "Bill", wallet: "main", startMonth: "September 2026" },
      { id: "cloud", name: "Cloud", amount: 200, dueDay: "29", type: "Subscription", wallet: "main", startMonth: "September 2026" },
    ];
    data.logs = { "September 2026": { billsPaid: ["cloud"] } };
    await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
    await isolatedApp(data); await navigate(page, "Operations");
    const before = await storedData(page);
    const toolbar = page.getByRole("group", { name: "Commitment controls", exact: true });
    const controls = toolbar.locator("input,select,button"); await expect(controls).toHaveCount(5);
    const boxes = await controls.evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    }));
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i]; expect(box.y).toBeCloseTo(boxes[0].y, 0);
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
      if (i) expect(box.x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if ([320, 375, 1280].includes(width)) await toolbar.screenshot({ path: info.outputPath(`toolbar-${theme}-${width}.png`) });
    const rows = page.locator("[data-commitment-id]").filter({ visible: true }); await expect(rows).toHaveCount(2);
    await toolbar.getByRole("textbox", { name: "Search commitments" }).fill("Internet"); await expect(rows).toHaveCount(1);
    await toolbar.getByRole("textbox", { name: "Search commitments" }).clear();
    await toolbar.getByRole("combobox", { name: "Sort commitments" }).selectOption("amountDesc");
    await toolbar.getByRole("button", { name: "Filter commitments: All" }).click();
    await toolbar.getByRole("button", { name: "Subscription", exact: true }).click(); await expect(rows).toHaveCount(1);
    await toolbar.getByRole("button", { name: "Filter commitments: Subscription" }).click();
    await toolbar.getByRole("button", { name: "All", exact: true }).click();
    await toolbar.getByRole("button", { name: "Hide paid commitments" }).click(); await expect(rows).toHaveCount(1);
    await toolbar.getByRole("button", { name: "Show paid commitments" }).click(); await expect(rows).toHaveCount(2);
    const download = page.waitForEvent("download");
    await toolbar.getByRole("button", { name: "Export commitments to calendar" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.ics$/);
    expect(await storedData(page)).toEqual(before);
  });
}
