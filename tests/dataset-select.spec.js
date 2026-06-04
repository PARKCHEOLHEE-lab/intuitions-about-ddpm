// The dataset selector is a custom dropdown (not the OS-native <select> popup):
// the native <select> is hidden and only holds the value + emits change; a
// styled trigger + popup listbox layer on top, matching the flat controls.
const { test, expect } = require('@playwright/test');

test('custom dataset dropdown: styled trigger + popup, picking an option loads the shape', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // the native <select> is hidden — it's just the value holder behind the custom UI
  await expect(page.locator('#shape-select')).toBeHidden();

  // the trigger is the visible control, styled like the other flat controls
  const trig = page.locator('#shape-trigger');
  await expect(trig).toBeVisible();
  const cs = await trig.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bw: parseFloat(s.borderTopWidth), bcolor: s.borderTopColor, radius: s.borderTopLeftRadius };
  });
  expect(cs.bw).toBeGreaterThan(0);
  expect(cs.bcolor).toBe('rgba(128, 128, 128, 0.3)'); // --reduce-30, same as play/checkbox
  expect(cs.radius).toBe('4px');

  // list is closed initially, opens on click with one option per shape
  await expect(page.locator('#shape-list')).toBeHidden();
  await trig.click();
  await expect(page.locator('#shape-list')).toBeVisible();
  expect(await page.locator('#shape-list .ds-option').count()).toBeGreaterThanOrEqual(2);

  // picking "star" actually loads star's data (drives the real path, not a
  // parallel one), updates the trigger label, and closes the list
  const [req] = await Promise.all([
    page.waitForRequest(/forward_star\.json/),
    page.locator('#shape-list .ds-option[data-value="star"]').click(),
  ]);
  expect(req.url()).toContain('forward_star.json');
  await expect(page.locator('#shape-select')).toHaveValue('star');
  await expect(page.locator('#shape-value')).toHaveText('star');
  await expect(page.locator('#shape-list')).toBeHidden();
});

test('custom dropdown is an accessible listbox with keyboard support', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const trig = page.locator('#shape-trigger');
  const list = page.locator('#shape-list');

  // static ARIA
  await expect(trig).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(trig).toHaveAttribute('aria-expanded', 'false');
  await expect(list).toHaveAttribute('role', 'listbox');
  await expect(page.locator('#shape-list [role="option"]').first()).toBeAttached();
  await expect(page.locator('#shape-list [data-value="dino"]')).toHaveAttribute('aria-selected', 'true');

  // keyboard: Escape closes an open list
  await trig.focus();
  await page.keyboard.press('Enter'); // a button: Enter opens via the click handler
  await expect(trig).toHaveAttribute('aria-expanded', 'true');
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trig).toHaveAttribute('aria-expanded', 'false');
  await expect(list).toBeHidden();

  // keyboard: ArrowDown to move the active option, Enter to pick a different shape
  await trig.focus();
  await page.keyboard.press('ArrowDown'); // opens (and focuses the list)
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown'); // move off the current (dino) option
  await page.keyboard.press('Enter');     // pick the active option
  await expect(list).toBeHidden();
  await expect(page.locator('#shape-select')).not.toHaveValue('dino');
});

test('dropdown trigger + popup invert to dark on the stuck bar', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const trig = page.locator('#shape-trigger');
  // scroll past the bar so it pins (stuck)
  const fY = await page.locator('#forward-panel').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate((y) => window.scrollTo(0, y + 200), fY);
  await page.waitForFunction(() => document.getElementById('shape-bar').classList.contains('stuck'));
  await page.waitForTimeout(250);

  // the trigger border turns light so it stays visible on the black bar
  const bc = await trig.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(bc).toMatch(/rgba\(255, 255, 255/);

  // the popup also inverts to dark to match the bar
  await trig.click();
  await expect(page.locator('#shape-list')).toBeVisible();
  const lbg = await page.locator('#shape-list').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(lbg).toBe('rgb(0, 0, 0)'); // --dark
  const optColor = await page.locator('#shape-list .ds-option').first().evaluate((el) => getComputedStyle(el).color);
  expect(optColor).toMatch(/rgba?\(255, 255, 255/); // light option text on the dark popup
});

test('the selected option is not bold (same weight as the other options)', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  await page.locator('#shape-trigger').click();
  await expect(page.locator('#shape-list')).toBeVisible();
  const selFW = await page.locator('#shape-list [aria-selected="true"]').evaluate((el) => getComputedStyle(el).fontWeight);
  const otherFW = await page.locator('#shape-list [aria-selected="false"]').first().evaluate((el) => getComputedStyle(el).fontWeight);
  expect(selFW).toBe(otherFW); // no bold distinction on the selected option
});
