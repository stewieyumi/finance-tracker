import { test, expect, navigate, returningData, storedData } from "./fixtures";

for (const width of [320, 360, 375, 390, 430, 568, 768, 1024, 1280, 1920]) for (const theme of ["light", "dark"] as const) {
  test(`header controls stay aligned ${width} ${theme}`, async ({ page, isolatedApp }, info) => {
    test.skip(info.project.name === "phone" ? width >= 640 : width < 640, "Matching touch/desktop profile only.");
    await page.setViewportSize({ width, height: 812 });
    const data = returningData(); data.settings = { ...data.settings, theme };
    await isolatedApp(data);
    const before = await storedData(page);
    let commandPosition: { x: number; y: number } | undefined;
    for (const [tab, guide] of [["Dashboard", "Dashboard"], ["Operations", "Commitments"], ["Wallets", "Wallets"], ["Expenses", "Expenses"], ["Account", "Account"]]) {
      await navigate(page, tab);
      await expect(page.getByRole("button", { name: `${guide} guide`, exact: true })).toBeVisible();
      const heading = await page.locator("h1").boundingBox();
      const boxes = [];
      for (const name of [width < 768 ? "Refresh Data" : "Pull Data (R)", "Hide Balances", "Notifications", "Payment history"]) {
        const button = page.getByRole("button", { name, exact: true });
        await expect(button).toBeVisible(); const box = (await button.boundingBox())!; boxes.push(box);
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      }
      const position = { x: boxes[0].x, y: boxes[0].y };
      if (commandPosition) { expect(position.x).toBeCloseTo(commandPosition.x, 0); expect(position.y).toBeCloseTo(commandPosition.y, 0); }
      else commandPosition = position;
      for (const box of boxes) expect(box.y + box.height / 2).toBeCloseTo(boxes[0].y + boxes[0].height / 2, 0);
      if (width >= 375) expect(heading!.y + heading!.height / 2).toBeCloseTo(boxes[0].y + boxes[0].height / 2, 0);
      else expect(heading!.y + heading!.height).toBeLessThanOrEqual(boxes[0].y);
      const monthControl = page.getByRole("combobox").first();
      const month = await monthControl.boundingBox();
      if (width < 640) expect(await monthControl.evaluate(el => {
        const select = el as HTMLSelectElement;
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = getComputedStyle(select).font;
        return context.measureText(select.selectedOptions[0].text).width + 16 <= select.clientWidth;
      })).toBe(true);
      for (const name of ["Runway", "Yearly"]) {
        const box = (await page.getByRole("button", { name, exact: true }).boundingBox())!;
        expect(box.y + box.height / 2).toBeCloseTo(month!.y + month!.height / 2, 0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if ([375, 1280].includes(width) && ["Dashboard", "Wallets"].includes(tab)) await page.screenshot({ path: info.outputPath(`${tab}-${theme}-${width}.png`) });
    }
    expect(await storedData(page)).toEqual(before);
  });
}

test("connection details support hover, keyboard, touch hold and offline updates", async ({ page, context, isolatedApp }, info) => {
  await isolatedApp(returningData());
  const live = page.getByRole("button", { name: "Connection status: Live", exact: true });
  const tooltip = page.getByRole("tooltip");
  await expect(live).toBeVisible();
  if (info.project.name === "desktop") {
    await live.hover(); await expect(tooltip).toHaveText("Live");
    await page.mouse.move(0, 0); await expect(tooltip).toBeHidden();
  }
  await live.focus(); await expect(tooltip).toHaveText("Live");
  await page.keyboard.press("Escape"); await expect(tooltip).toBeHidden();
  await live.evaluate(el => (el as HTMLElement).blur());
  await live.dispatchEvent("pointerdown", { pointerType: "touch" });
  await expect(tooltip).toHaveText("Live");
  await live.dispatchEvent("pointerup", { pointerType: "touch" });
  await page.locator("h1").click(); await expect(tooltip).toBeHidden();
  await live.dispatchEvent("pointerdown", { pointerType: "touch" });
  await live.dispatchEvent("pointercancel", { pointerType: "touch" });
  await page.waitForTimeout(600); await expect(tooltip).toBeHidden();
  await context.setOffline(true);
  const offline = page.getByRole("button", { name: "Connection status: Offline", exact: true });
  await expect(offline).toBeVisible(); await offline.click(); await expect(tooltip).toHaveText("Offline");
  await context.setOffline(false);
  await expect(live).toBeVisible(); await expect(tooltip).toHaveText("Live");
});
