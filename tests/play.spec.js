// A play button next to each slider auto-advances the animation.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('every slider panel has an enabled play button', async ({ page }) => {
  await ready(page);
  for (const id of ['#t-play', '#snapshot-play', '#reverse-play', '#modes-play']) {
    await expect(page.locator(id)).toBeEnabled();
    await expect(page.locator(id)).toHaveAttribute('data-playing', 'false');
  }
});

test('play button animates the forward slider, toggles, and stops at the end', async ({ page }) => {
  await ready(page);
  const btn = page.locator('#t-play');
  const slider = page.locator('#t-slider');
  await expect(btn).toBeEnabled();
  await expect(btn).toHaveAttribute('data-playing', 'false');

  // press play -> it advances the slider from 0 and reports playing
  await btn.click();
  await expect(btn).toHaveAttribute('data-playing', 'true');
  await page.waitForTimeout(400);
  expect(parseInt(await slider.inputValue(), 10)).toBeGreaterThan(0); // advanced

  // press again -> pauses
  await btn.click();
  await expect(btn).toHaveAttribute('data-playing', 'false');

  // from near the end, playing runs to max then auto-stops
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);
  await slider.fill(String(max - 2));
  await slider.dispatchEvent('input');
  await btn.click();
  await expect(btn).toHaveAttribute('data-playing', 'false', { timeout: 5000 }); // reached end
  expect(parseInt(await slider.inputValue(), 10)).toBe(max);
});

// Manually scrubbing the slider DURING playback pauses the animation at that
// point (it should not keep advancing toward the end against the user).
test('manually scrubbing the slider during playback stops playback at that point', async ({ page }) => {
  await ready(page);
  const btn = page.locator('#t-play');
  const slider = page.locator('#t-slider');
  const max = parseInt((await slider.getAttribute('max')) || '0', 10);

  await slider.fill('0'); // start with room to run
  await slider.dispatchEvent('input');
  await btn.click();
  await expect(btn).toHaveAttribute('data-playing', 'true');

  // user grabs the slider mid-play
  const mid = String(Math.floor(max / 2));
  await slider.fill(mid);
  await slider.dispatchEvent('input');

  // playback stops immediately, at the scrubbed position
  await expect(btn).toHaveAttribute('data-playing', 'false');
  await page.waitForTimeout(300); // would have advanced ~9 steps if still playing
  expect(parseInt(await slider.inputValue(), 10)).toBe(parseInt(mid, 10));
});
