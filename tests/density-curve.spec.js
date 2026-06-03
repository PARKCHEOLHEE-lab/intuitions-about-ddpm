// Distribution-evolution: beside the forward/reverse scatter, a curve of the
// analytic diffused marginal q(x_t) (a Gaussian mixture over the clean data),
// synced to the timestep slider — multimodal data → single Gaussian noise.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

// KR4 (forward): the density curve updates with the slider and morphs from
// multimodal (data, t=0) to a single bell (noise, t=T).
test('KR4: forward q(x_t) density curve is multimodal at t=0 and unimodal at t=T', async ({ page }) => {
  await ready(page);

  const dens = page.locator('#forward-density');
  await expect(dens).toBeVisible();
  const slider = page.locator('#t-slider');

  await slider.fill('0');
  await slider.dispatchEvent('input');
  const peaks0 = parseInt((await dens.getAttribute('data-peak-count')) || '0', 10);
  const sum0 = await dens.getAttribute('data-curve-sum');

  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max));
  await slider.dispatchEvent('input');
  const peaksT = parseInt((await dens.getAttribute('data-peak-count')) || '0', 10);

  expect(await dens.getAttribute('data-curve-sum')).not.toBe(sum0); // tracks t
  expect(peaks0).toBeGreaterThanOrEqual(2); // data marginal is multimodal
  expect(peaksT).toBe(1); // noise marginal is a single Gaussian bell
});

// KR4 (reverse): the reverse slider walks t from T-1 (noise) down to 0 (data),
// so the same q(x_t) density gathers from a single bell back into multimodal.
test('KR4: reverse q(x_t) density gathers from unimodal (t=T) to multimodal (t=0)', async ({ page }) => {
  await ready(page);

  const dens = page.locator('#reverse-density');
  await expect(dens).toBeVisible();
  const slider = page.locator('#reverse-step-slider');

  await slider.fill('0'); // index 0 → t = T-1 (noise)
  await slider.dispatchEvent('input');
  const peaksNoise = parseInt((await dens.getAttribute('data-peak-count')) || '0', 10);

  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max)); // last index → t = 0 (data)
  await slider.dispatchEvent('input');
  const peaksData = parseInt((await dens.getAttribute('data-peak-count')) || '0', 10);

  expect(peaksNoise).toBe(1); // noise end is a single bell
  expect(peaksData).toBeGreaterThanOrEqual(2); // data end is multimodal
});

// KR2: the density curve is drawn with a thin (1px) line and a faint underlay of
// the ORIGINAL data distribution q(x0), so you can read what shape it morphed
// from/to. Both forward and reverse panels show the underlay.
test('KR2: density curve uses a thin line and a faint q(x0) original-shape underlay', async ({ page }) => {
  await ready(page);

  const fwd = page.locator('#forward-density');
  await expect(fwd).toHaveAttribute('data-line-width', '1'); // halved from 2
  await expect(fwd).toHaveAttribute('data-ghost-shown', 'true'); // original-shape backdrop

  const rev = page.locator('#reverse-density');
  await expect(rev).toHaveAttribute('data-line-width', '1');
  await expect(rev).toHaveAttribute('data-ghost-shown', 'true');
});
