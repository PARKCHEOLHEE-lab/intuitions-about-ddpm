// The standalone "The data x0" panel was removed (its scatter duplicated the
// forward panel's x0 figure). The remaining numbered steps are renumbered to
// 1/2/3, and the standardization rationale moves into the forward panel.
const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');
}

test('dataset panel is removed and step headings carry no number prefix', async ({ page }) => {
  await ready(page);

  // the standalone dataset panel + its scatter are gone
  expect(await page.locator('#dataset-panel').count()).toBe(0);
  expect(await page.locator('#scatter').count()).toBe(0);

  // headings carry no "N ·" number-dot prefix — just the topic
  for (const [panel, word] of [
    ['#forward-panel', 'Forward diffusion'],
    ['#train-panel', 'Training'],
    ['#reverse-panel', 'Reverse sampling'],
  ]) {
    const h2 = (await page.locator(`${panel} h2`).textContent()).trim();
    expect(h2).not.toMatch(/·/); // no "1 · / 2 · / 3 ·" prefix
    expect(h2).toContain(word);
  }

  // the standardization rationale (unique to the old dataset panel) is preserved
  // in the forward panel: zero mean / unit variance → end state N(0,I)
  await expect(page.locator('#forward-panel')).toContainText(/unit variance/i);
});
