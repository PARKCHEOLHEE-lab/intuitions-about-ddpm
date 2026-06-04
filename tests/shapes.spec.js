// One conditional model over all Datasaurus shapes: a selector picks the shape
// and every panel lazy-loads + re-renders for it.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('shape selector switches the active shape across panels', async ({ page }) => {
  await ready(page);
  const sel = page.locator('#shape-select');
  await expect(sel).toBeEnabled();

  const opts = await sel.locator('option').allTextContents();
  expect(opts.length).toBeGreaterThanOrEqual(3); // multiple shapes
  expect(opts).toContain('dino');

  // dino is the default; switching to another shape re-renders the dataset
  // scatter (its content fingerprint changes) once the per-shape data loads.
  await expect(sel).toHaveValue('dino');
  const scatter = page.locator('#forward-endpoint');
  const before = await scatter.getAttribute('data-cloud-sum');

  // switch shapes through the custom dropdown (the native <select> is hidden)
  const other = opts.find((o) => o !== 'dino');
  await page.locator('#shape-trigger').click();
  await page.locator(`#shape-list .ds-option[data-value="${other}"]`).click();
  await expect(sel).toHaveValue(other);
  await expect.poll(async () => scatter.getAttribute('data-cloud-sum')).not.toBe(before);
});
