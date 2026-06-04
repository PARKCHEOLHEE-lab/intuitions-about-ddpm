// When the dataset bar is pinned (stuck), it gets a .stuck class that doubles
// its vertical padding and inverts to a black background with white text.
// Unpinned, it is white background + black text with the base padding.
const { test, expect } = require('@playwright/test');

function read(el) {
  const s = getComputedStyle(el);
  return { bg: s.backgroundColor, color: s.color, padTop: parseFloat(s.paddingTop), padBot: parseFloat(s.paddingBottom) };
}

test('dataset bar inverts to dark + doubles padding when stuck', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const bar = page.locator('#shape-bar');
  // unstuck (at top): white bg, black text
  const base = await bar.evaluate(read);
  expect(base.bg).toBe('rgb(255, 255, 255)');
  expect(base.color).toBe('rgb(0, 0, 0)');
  expect(await bar.evaluate((el) => el.classList.contains('stuck'))).toBe(false);

  // scroll past the bar (into the forward panel) so it pins, then it's stuck
  const fY = await page.locator('#forward-panel').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y + 200), fY);
  await page.waitForFunction(() => document.getElementById('shape-bar').classList.contains('stuck'));
  await page.waitForTimeout(250); // let the background/padding transition settle
  const stuck = await bar.evaluate(read);
  expect(stuck.bg).toBe('rgb(0, 0, 0)');         // black background
  expect(stuck.color).toBe('rgb(255, 255, 255)'); // white text
  expect(stuck.padTop).toBeGreaterThan(base.padTop * 1.8);  // ~2x padding
  expect(stuck.padBot).toBeGreaterThan(base.padBot * 1.8);

  // scrolling back to the top reverts it
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.getElementById('shape-bar').classList.contains('stuck'));
  await page.waitForTimeout(250);
  expect((await bar.evaluate(read)).bg).toBe('rgb(255, 255, 255)');
});

test('stuck dataset bar fills the full viewport width (the side gutters too)', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const bar = page.locator('#shape-bar');
  const fY = await page.locator('#forward-panel').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y + 200), fY);
  await page.waitForFunction(() => document.getElementById('shape-bar').classList.contains('stuck'));
  await page.waitForTimeout(250);

  const m = await bar.evaluate((el) => {
    const s = getComputedStyle(el);
    return { boxShadow: s.boxShadow, clipPath: s.clipPath, rectW: el.getBoundingClientRect().width };
  });
  const vw = await page.evaluate(() => window.innerWidth);

  // the element box itself stays column-width — content is NOT stretched to the edges
  expect(m.rectW).toBeLessThan(vw);
  // a black side fill (box-shadow) wider than the gutter on each side fills the gutters
  expect(m.boxShadow).toMatch(/rgb\(0, 0, 0\)/);
  const pxNums = [...m.boxShadow.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((x) => parseFloat(x[1]));
  const spread = pxNums.length ? pxNums[pxNums.length - 1] : 0;
  expect(spread).toBeGreaterThan((vw - m.rectW) / 2);
  // clipped vertically so the fill does NOT bleed over the content below the bar
  expect(m.clipPath).toMatch(/^inset\(/);
});
