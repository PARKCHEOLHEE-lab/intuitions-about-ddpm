// The redundant intro paragraph ("Everything below uses one toy dataset … the
// browser only replays the precomputed snapshots") was removed; the forward/
// reverse framing stays.
const { test, expect } = require('@playwright/test');

test('intro panel drops the redundant toy-dataset/precomputed paragraph', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const intro = await page.locator('#intro-panel').innerText();
  expect(intro).not.toContain('Everything below uses one toy dataset');
  expect(intro).not.toContain('replays the precomputed snapshots');
  expect(intro).toMatch(/forward/i); // the core framing remains
});

test('modes intro and dataset-bar hint drop their redundant asides', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // modes intro no longer leads with the "Before the dino" aside
  const modes = await page.locator('#modes-panel').innerText();
  expect(modes).not.toContain('Before the dino');
  expect(modes).toMatch(/core picture/i); // the rest of the sentence stays

  // dataset bar hint keeps the essential note, drops the model/intro aside
  const bar = await page.locator('#shape-bar').innerText();
  expect(bar).toContain('applies to every panel below');
  expect(bar).not.toContain('conditional model');
  expect(bar).not.toContain('shape-agnostic');
});
