// Control styling rules for the transport row:
//  - the play button's "playing" highlight is the slider-thumb blue (--link);
//  - the toggle checkbox is a custom box that matches the play button's frame
//    (same border color + corner radius, persistent border, black check);
//  - the slider track fills with --link up to the thumb.
const { test, expect } = require('@playwright/test');

const LINK = 'rgb(102, 161, 255)'; // --link

test('the playing play-button highlight is the slider-thumb blue', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const play = page.locator('#t-play');
  await play.click(); // → data-playing="true"
  await expect(play).toHaveAttribute('data-playing', 'true');
  const cs = await play.evaluate((b) => {
    const s = getComputedStyle(b);
    return { border: s.borderTopColor, color: s.color };
  });
  expect(cs.border).toBe(LINK);
  expect(cs.color).toBe(LINK);
});

test('toggle checkbox shares the play-button frame and shows a black check', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const cb = page.locator('#forward-smooth');
  const play = page.locator('#t-play');
  await expect(cb).toBeChecked(); // toggles default on

  const c = await cb.evaluate((el) => {
    const s = getComputedStyle(el);
    const a = getComputedStyle(el, '::after');
    return {
      appearance: s.appearance,
      bw: parseFloat(s.borderTopWidth),
      bstyle: s.borderTopStyle,
      bcolor: s.borderTopColor,
      radius: s.borderTopLeftRadius,
      checkColor: a.borderRightColor,
      checkContent: a.content,
    };
  });
  const p = await play.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bcolor: s.borderTopColor, radius: s.borderTopLeftRadius };
  });

  expect(c.appearance).toBe('none');          // custom box, not a native checkbox
  expect(c.bw).toBeGreaterThan(0);            // border present even when checked
  expect(c.bstyle).toBe('solid');
  expect(c.bcolor).toBe(p.bcolor);            // SAME border color as the play button
  expect(c.radius).toBe(p.radius);            // SAME corner radius as the play button
  expect(c.checkContent).not.toBe('none');    // a check is drawn when checked
  expect(c.checkColor).toBe('rgb(0, 0, 0)');  // the check is black
});

test('slider track fills with the accent up to the thumb position', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const slider = page.locator('#t-slider');
  await expect(slider).toBeEnabled();

  // at the max value → blue fill runs the full track (100%)
  await slider.evaluate((s) => { s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); });
  let bg = await slider.evaluate((s) => getComputedStyle(s).backgroundImage);
  expect(bg).toContain('linear-gradient');
  expect(bg).toMatch(/rgb\(102, 161, 255\) 100%/); // --link fill to the end

  // at the min value (0) → blue fill stops at 0% (track is all gray)
  await slider.evaluate((s) => { s.value = '0'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  bg = await slider.evaluate((s) => getComputedStyle(s).backgroundImage);
  expect(bg).toMatch(/rgb\(102, 161, 255\) 0%/);
  expect(bg).not.toContain('100%');
});
