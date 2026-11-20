import { test, expect, navigate, returningData, storedData } from './fixtures';

async function installEnvironment(page: import('@playwright/test').Page, phone: boolean, standalone = false) {
  await page.addInitScript(({ phone, standalone }) => {
    Object.defineProperty(navigator, 'userAgent', { get: () => phone
      ? 'Mozilla/5.0 (Linux; Android 15) Chrome/150 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150 Safari/537.36' });
    // Simulate availability deterministically; this suite does not install an OS app.
    window.addEventListener('beforeinstallprompt', event => {
      if (!(event as Event & { fixture?: boolean }).fixture) { event.preventDefault(); event.stopImmediatePropagation(); }
    });
    if (standalone) {
      const original = window.matchMedia.bind(window);
      window.matchMedia = query => {
        const result = original(query);
        if (query.includes('display-mode')) Object.defineProperty(result, 'matches', { value: true });
        return result;
      };
    }
  }, { phone, standalone });
}

for (const theme of ['light', 'dark'] as const) {
  test(`install guidance works without native support in ${theme} mode`, async ({ page, isolatedApp }, testInfo) => {
    const phone = testInfo.project.name === 'phone';
    const originalSize = page.viewportSize()!;
    await installEnvironment(page, phone);
    const data = returningData(); data.settings = { ...data.settings, theme };
    await isolatedApp(data);
    const offer = page.getByRole('region', { name: 'Add Finance Tracker to your device' });
    await expect(offer).toBeVisible();
    const snapshot = await storedData(page);
    const opener = offer.getByRole('button', { name: 'How to install' });
    await opener.click();
    const guide = page.getByRole('dialog', { name: 'Install Finance Tracker' });
    await expect(guide.getByRole('heading', { name: 'Install Finance Tracker' })).toBeFocused();
    await expect(guide.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
    await expect(guide.getByRole('region', { name: phone ? 'Android installation' : 'Windows installation' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`install-guide-${theme}.png`) });
    // The guide can scroll on small screens and always has a reachable dismissal.
    await page.setViewportSize({ width: 320, height: 568 });
    await guide.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(guide).toBeHidden();
    await expect(opener).toBeFocused();
    await offer.getByRole('button', { name: 'Not now' }).click();
    await expect(offer).toBeHidden();
    // Keep the short-screen reachability check separate from reopening at the device size.
    // Reloading a resized mobile-emulation context can retain a different layout viewport.
    await page.setViewportSize(originalSize);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(offer).toBeHidden();
    await navigate(page, 'Account');
    await page.getByRole('button', { name: 'Install app', exact: true }).click();
    await expect(guide).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(guide).toBeHidden();
    expect(await storedData(page)).toEqual(snapshot);
  });
}

test('native install waits for a click and completion event', async ({ page, isolatedApp }, testInfo) => {
  await installEnvironment(page, testInfo.project.name === 'phone');
  await isolatedApp(returningData());
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const snapshot = await storedData(page);
  await page.evaluate(() => {
    (window as Window & { installCalls?: number }).installCalls = 0;
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      fixture: true,
      prompt: async () => { const state = window as Window & { installCalls?: number }; state.installCalls = (state.installCalls ?? 0) + 1; return { outcome: 'accepted' }; },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  expect(await page.evaluate(() => (window as Window & { installCalls?: number }).installCalls)).toBe(0);
  await page.getByRole('region', { name: 'Add Finance Tracker to your device' }).getByRole('button', { name: 'Install app' }).click();
  const guide = page.getByRole('dialog', { name: 'Install Finance Tracker' });
  await expect(guide.getByRole('status')).toContainText('Finish adding');
  expect(await page.evaluate(() => (window as Window & { installCalls?: number }).installCalls)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(guide.getByRole('status')).toContainText('App added');
  await guide.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('region', { name: 'Add Finance Tracker to your device' })).toBeHidden();
  expect(await storedData(page)).toEqual(snapshot);
});

test('standalone app hides invitations and keeps manual help', async ({ page, isolatedApp }, testInfo) => {
  await installEnvironment(page, testInfo.project.name === 'phone', true);
  await isolatedApp(returningData());
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Add Finance Tracker to your device' })).toBeHidden();
  const snapshot = await storedData(page);
  await navigate(page, 'Account');
  await page.getByRole('button', { name: 'Installation help' }).click();
  const guide = page.getByRole('dialog', { name: 'Install Finance Tracker' });
  await expect(guide.getByText(/already using app mode here/)).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(guide).toBeHidden();
  expect(await storedData(page)).toEqual(snapshot);
});
