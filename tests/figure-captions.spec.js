// Per-canvas <figcaption> labels are merged into ONE paper-style caption per
// figure panel: a bold title lead + (Left)/(Middle)/(Right) sub-panel clauses,
// reusing the single p.hint caption element. No per-canvas figcaptions remain.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('figure panels use one merged paper-style caption (no per-canvas figcaptions)', async ({ page }) => {
  await ready(page);

  // the per-canvas figcaption labels are gone everywhere
  expect(await page.locator('figcaption').count()).toBe(0);

  // each multi-canvas panel has exactly ONE caption
  for (const panel of ['#forward-panel', '#reverse-panel', '#modes-panel']) {
    expect(await page.locator(`${panel} p.hint`).count()).toBe(1);
  }

  // forward & reverse (3 canvases) name Left / Middle / Right; modes (2) Left / Right
  const fwd = await page.locator('#forward-panel p.hint').innerText();
  expect(fwd).toContain('Forward diffusion'); // bold title lead
  for (const w of ['Left', 'Middle', 'Right']) expect(fwd).toContain(w);

  const rev = await page.locator('#reverse-panel p.hint').innerText();
  expect(rev).toContain('Reverse sampling');
  for (const w of ['Left', 'Middle', 'Right']) expect(rev).toContain(w);

  const modes = await page.locator('#modes-panel p.hint').innerText();
  for (const w of ['Left', 'Right']) expect(modes).toContain(w);

  // canvases and their order are preserved (forward)
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('#forward-panel .two-panel canvas')].map((c) => c.id)
  );
  expect(ids).toEqual(['forward-endpoint', 'forward-scatter', 'forward-density']);
});

test('paper-style caption titles are not bold', async ({ page }) => {
  await ready(page);
  // the title lead is plain text — no <strong> bold anywhere in the captions
  expect(await page.locator('p.hint strong').count()).toBe(0);
});
