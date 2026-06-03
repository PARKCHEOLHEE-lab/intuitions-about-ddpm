// Intro "Diffusion Process" content: the physical-spreading analogy that
// motivates the forward/reverse halves. (The standalone random-walk canvas demo
// was removed — it overlapped the "Sampling as transport" panel.)
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

// KR2: a dedicated intro section explains diffusion as a physical spreading
// process (molecules spreading via Gaussian-distributed motion) and that knowing
// each step's distribution lets you run the process in reverse.
test('KR2: intro Diffusion-Process section explains spreading + reversibility', async ({ page }) => {
  await ready(page);

  const panel = page.locator('#diffusion-process-panel');
  await expect(panel).toBeVisible();
  // physical-diffusion framing (spreading / 확산)
  await expect(panel).toContainText(/spread|diffus|확산/i);
  // each step is Gaussian-distributed motion
  await expect(panel).toContainText(/Gaussian/i);
  // the key intuition: knowing the per-step motion lets you reverse it
  await expect(panel).toContainText(/revers/i);

  // it sits BEFORE the dino dataset panel (intro content)
  const order = await page.evaluate(() => {
    const all = [...document.querySelectorAll('main section')].map((s) => s.id);
    return { dp: all.indexOf('diffusion-process-panel'), data: all.indexOf('forward-panel') };
  });
  expect(order.dp).toBeGreaterThanOrEqual(0);
  expect(order.dp).toBeLessThan(order.data);
});

// The standalone random-walk canvas demo is removed (it overlapped the
// "Sampling as transport" panel). The conceptual prose stays.
test('random-walk canvas demo is removed', async ({ page }) => {
  await ready(page);
  expect(await page.locator('#walk-canvas').count()).toBe(0);
  expect(await page.locator('#walk-play').count()).toBe(0);
  expect(await page.locator('#walk-slider').count()).toBe(0);
  // the conceptual section still renders
  await expect(page.locator('#diffusion-process-panel')).toContainText(/Gaussian/i);
});
