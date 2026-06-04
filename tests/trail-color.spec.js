// Trajectory trails are colored per panel: forward stays purple, reverse is
// green (matching its samples). Verified at the PIXEL level — the trail line
// itself (not just the dots) follows the panel color — because a data attribute
// alone cannot prove what was actually stroked.
const { test, expect } = require('@playwright/test');

// Count clearly green vs purple (blue-dominant) non-background pixels.
async function hues(page, sel) {
  return page.locator(sel).evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let green = 0, purple = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 8) continue;
      if (r > 245 && g > 245 && b > 245) continue; // skip white background
      if (g > r + 8 && g > b + 8) green++;          // greenish
      else if (b > g + 8 && r > g + 5) purple++;    // purple (blue-dominant)
    }
    return { green, purple };
  });
}

test('reverse trajectory trail is green; forward trail stays purple', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // scrub both to the full-trail end so the trail polyline is drawn
  for (const sid of ['#t-slider', '#reverse-step-slider']) {
    const s = page.locator(sid);
    const max = parseInt((await s.getAttribute('max')) || '0', 10);
    await s.fill(String(max));
    await s.dispatchEvent('input');
  }

  // declared intent
  await expect(page.locator('#forward-scatter')).toHaveAttribute('data-trail-color', '#6d28d9');
  await expect(page.locator('#reverse-traj')).toHaveAttribute('data-trail-color', '#16a34a');

  // actual rendered pixels: reverse is green with NO purple trail; forward is purple
  const rev = await hues(page, '#reverse-traj');
  expect(rev.green).toBeGreaterThan(100);
  expect(rev.purple).toBeLessThan(20); // a purple trail (the bug) would light this up

  const fwd = await hues(page, '#forward-scatter');
  expect(fwd.purple).toBeGreaterThan(100);
});
