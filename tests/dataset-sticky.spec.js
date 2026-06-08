// The dataset (shape) selector is a sticky bar placed just before the forward
// panel (after the shape-agnostic intro/modes). It stays pinned at the viewport
// top through ALL shape-dependent panels below it — forward, training, reverse —
// not only within the forward section.
const { test, expect } = require('@playwright/test');

test('dataset bar stays pinned at the top through forward, training and reverse', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const bar = page.locator('#shape-bar');
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  // no horizontal rule under the bar
  expect(await bar.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0px');

  // it is a direct child of <main>, ordered after modes and before the forward panel
  const order = await page.evaluate(() => {
    const kids = [...document.querySelector('main').children];
    return {
      bar: kids.findIndex((e) => e.id === 'shape-bar'),
      modes: kids.findIndex((e) => e.id === 'modes-panel'),
      forward: kids.findIndex((e) => e.id === 'forward-panel'),
    };
  });
  expect(order.bar).toBeGreaterThan(order.modes);
  expect(order.bar).toBeLessThan(order.forward);

  // it remains pinned at the viewport top even when scrolled down to the LAST
  // (reverse) panel — the whole point: sticky persists below the forward section.
  for (const panel of ['#forward-panel', '#train-panel', '#reverse-panel']) {
    const top = await page.locator(panel).evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y + 120), top);
    await page.waitForTimeout(100);
    expect((await bar.boundingBox()).y).toBeLessThanOrEqual(5);
  }
});
