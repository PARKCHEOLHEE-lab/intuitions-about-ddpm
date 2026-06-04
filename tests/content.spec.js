// The learning page renders real math (KaTeX) and is fully self-contained:
// no external/CDN requests, so it works offline on GitHub Pages.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('math equations render via vendored KaTeX', async ({ page }) => {
  await ready(page);
  // several equations across the sections render into .katex nodes
  expect(await page.locator('.katex').count()).toBeGreaterThan(3);
});

test('concept sections pair equations with the interactive panels', async ({ page }) => {
  await ready(page);
  // framing section
  await expect(page.locator('#intro-panel')).toContainText(/forward/i);
  // block equations across forward / training / reverse (q, closed form, loss, mean, ancestral step)
  expect(await page.locator('.katex-display').count()).toBeGreaterThanOrEqual(4);
  // each viz section keeps its plain-language callout
  for (const id of ['#forward-explain', '#train-explain', '#reverse-explain']) {
    await expect(page.locator(id)).toBeVisible();
  }
});

test('page makes no external (CDN) requests — fully offline', async ({ page }) => {
  const external = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!/^(http:\/\/(127\.0\.0\.1|localhost)|data:|blob:)/.test(u)) external.push(u);
  });
  await ready(page);
  expect(external).toEqual([]);
});
