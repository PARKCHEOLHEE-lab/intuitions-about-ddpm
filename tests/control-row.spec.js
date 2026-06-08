// Option A control row: a transport cluster (play + a wide grow-to-fill
// scrubber + a live readout) grows to fill, then a divider, then a lighter
// options (toggles) cluster; on a narrow window the options wrap to a 2nd line.
const { test, expect } = require('@playwright/test');

async function ready(page, w = 1280) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('forward row: transport cluster with a grow-to-fill scrubber + options after a divider', async ({ page }) => {
  await ready(page);

  const transport = page.locator('#forward-panel .controls .transport');
  await expect(transport).toHaveCount(1);
  await expect(transport.locator('#t-play')).toHaveCount(1);
  await expect(transport.locator('#t-slider')).toHaveCount(1);
  await expect(transport.locator('#t-value')).toHaveCount(1);

  // the slider is the dominant element — a wide grow-to-fill scrubber
  const rowW = (await page.locator('#forward-panel .controls').boundingBox()).width;
  const sliderW = (await page.locator('#t-slider').boundingBox()).width;
  expect(sliderW).toBeGreaterThan(rowW * 0.4);

  // no divider element (it orphaned on the wrapped mobile line); options cluster
  await expect(page.locator('#forward-panel .controls .sep')).toHaveCount(0);
  const opts = page.locator('#forward-panel .controls .opts');
  await expect(opts.locator('#forward-show-traj')).toHaveCount(1);
  await expect(opts.locator('#forward-smooth')).toHaveCount(1);
});

test('every panel control row uses the transport cluster', async ({ page }) => {
  await ready(page);
  for (const p of ['#modes-panel', '#forward-panel', '#train-panel', '#reverse-panel']) {
    await expect(page.locator(`${p} .controls .transport`)).toHaveCount(1);
  }
});

test('control row stays on ONE line at mobile width (toggles do not wrap)', async ({ page }) => {
  await ready(page, 375); // iphone-se
  const c = page.locator('#forward-panel .controls');
  await c.scrollIntoViewIfNeeded();
  const geo = await page.evaluate(() => {
    const ctl = document.querySelector('#forward-panel .controls');
    const t = ctl.querySelector('.transport').getBoundingClientRect();
    const o = ctl.querySelector('.opts').getBoundingClientRect();
    return {
      sameLine: Math.abs(o.top - t.top) < 8, // options share the transport's row
      width: Math.ceil(ctl.getBoundingClientRect().width),
      scrollWidth: ctl.scrollWidth,
    };
  });
  expect(geo.sameLine).toBe(true); // no wrap to a second line
  expect(geo.scrollWidth).toBeLessThanOrEqual(geo.width + 1); // no horizontal overflow
});
