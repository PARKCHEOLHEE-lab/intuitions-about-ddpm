// chaikinSmooth: Chaikin's corner-cutting subdivision used to smooth the
// stochastic trajectory polylines (replaces the old moving-average).
const { test, expect } = require('@playwright/test');

test('chaikinSmooth corner-cuts a polyline, preserving endpoints', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const m = await import('./js/plot.js');
    const pts = [[0, 0], [1, 0], [1, 1]]; // an L-shaped corner
    const out = m.chaikinSmooth(pts, 1);
    return { out, first: out[0], last: out[out.length - 1], len: out.length };
  });
  // endpoints are preserved
  expect(r.first).toEqual([0, 0]);
  expect(r.last).toEqual([1, 1]);
  // one iteration replaces each interior corner with 1/4 and 3/4 points -> more
  // vertices than the input (3) and the cut point Q0 = 0.75*P0 + 0.25*P1 = [0.25,0]
  expect(r.len).toBeGreaterThan(3);
  const hasCut = r.out.some((p) => Math.abs(p[0] - 0.25) < 1e-9 && Math.abs(p[1]) < 1e-9);
  expect(hasCut).toBe(true);
});

test('trajectory trail smoothing uses Chaikin on reverse + modes panels', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // reverse panel: smoothing is on by default -> Chaikin method reported
  await expect(page.locator('#reverse-traj')).toHaveAttribute('data-smooth-method', 'chaikin');

  // modes panel: enabling the toggle switches its trail to Chaikin too
  await page.locator('#modes-smooth').check();
  await expect(page.locator('#modes-canvas')).toHaveAttribute('data-smooth-method', 'chaikin');
});
