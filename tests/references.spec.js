// The body cites its source papers with inline [n] links, and a References
// section lists them with matching anchors that every inline cite resolves to.
const { test, expect } = require('@playwright/test');

test('body has inline citations linked to a References section', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // References section with the numbered entries (8 after adding the
  // score-based / reverse-time foundations).
  await expect(page.locator('#references-panel h2')).toHaveText(/references/i);
  const refs = page.locator('#references-panel li[id^="ref-"]');
  await expect(refs).toHaveCount(8);

  // inline citations exist and EACH resolves to an existing reference anchor
  const hrefs = await page.locator('a.cite').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThanOrEqual(8);
  for (const h of hrefs) {
    expect(h).toMatch(/^#ref-\d+$/);
    expect(await page.locator(h).count()).toBe(1); // target entry exists
  }

  // known mappings — each conceptual claim is grounded in its source paper
  await expect(page.locator('#forward-panel')).toContainText('[3]');       // cosine schedule → Nichol & Dhariwal
  await expect(page.locator('#diffusion-process-panel')).toContainText('[6]'); // run-it-backward → reverse-time diffusion
  await expect(page.locator('#modes-panel')).toContainText('[7]');         // noise→data transport → score-based model
  await expect(page.locator('#train-panel')).toContainText('[8]');         // noise prediction → denoising score matching

  // the three added papers are present in the list
  const refsText = await page.locator('#references-panel').innerText();
  expect(refsText).toMatch(/Anderson/);                         // [6] reverse-time diffusion
  expect(refsText).toMatch(/Estimating Gradients|estimating gradients/); // [7] Song & Ermon NCSN
  expect(refsText).toMatch(/Denoising Autoencoders|denoising autoencoders/); // [8] Vincent
});
