// The forward and reverse panel headings are plain text — no inline math
// symbol and no <code> block. They read exactly "Forward diffusion" and
// "Reverse sampling" (the $q$ / $x_T → … → x_0$ symbols were dropped).
const { test, expect } = require('@playwright/test');

test('forward & reverse headings are plain text (no KaTeX/code symbol)', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const expected = {
    '#forward-panel': 'Forward diffusion',
    '#reverse-panel': 'Reverse sampling',
  };
  for (const [panel, text] of Object.entries(expected)) {
    const h2 = page.locator(`${panel} h2`);
    expect(await h2.locator('.katex').count()).toBe(0); // no rendered math symbol
    expect(await h2.locator('code').count()).toBe(0);   // no code block
    expect((await h2.innerText()).trim()).toBe(text);   // exact plain title
  }
});
