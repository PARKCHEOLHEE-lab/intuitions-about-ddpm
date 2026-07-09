// KR5 — docs/mse.html: the page reached by clicking "MSE" in the loss sentence.
//
// It is a sibling static file, not a route: GitHub Pages publishes all of docs/,
// so /mse.html is served with no workflow change. It shares style.css, the
// vendored KaTeX, and math.js with index.html, and it drives its figure with the
// SAME transport module the four index panels use (docs/js/controls.js).
const { test, expect } = require('@playwright/test');

test('KR5: mse.html loads clean and renders its math', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const res = await page.goto('/mse.html');
  expect(res.status()).toBe(200);

  await expect(page).toHaveTitle(/MSE/i);
  await expect(page.locator('h1')).toContainText(/expectation/i);

  // KaTeX rendered the LaTeX rather than leaving raw $...$ on the page. Read
  // innerText, not textContent: KaTeX keeps the source TeX in a visually hidden
  // <annotation> for screen readers, so textContent always contains it.
  await expect(page.locator('.katex').first()).toBeVisible();
  const visible = await page.locator('main').evaluate((el) => el.innerText);
  expect(visible).not.toContain('$');
  expect(visible).not.toContain('\\mathbb{E}');

  // The figure canvas painted from the seeded draws.
  const canvas = page.locator('#expectation-canvas');
  await expect(canvas).toHaveAttribute('data-sample-count', /^[0-9]+$/);
  await expect(canvas).toHaveAttribute('data-bar-count', /^[1-9][0-9]*$/);

  expect(errors).toEqual([]);
});

test('KR5: the figure transport plays and advances the N slider', async ({ page }) => {
  await page.goto('/mse.html');

  const play = page.locator('#n-play');
  const slider = page.locator('#n-slider');

  await expect(play).toBeEnabled();
  await expect(play).toHaveAttribute('data-playing', 'false');

  // The slider starts at its maximum (the settled histogram), so pressing play
  // replays the accumulation from zero draws — attachPlay's restart-at-max rule.
  await play.click();
  await expect(play).toHaveAttribute('data-playing', 'true');
  await expect.poll(() => slider.inputValue()).not.toBe('0');

  // The drawn sample count tracks the slider, so the figure is really redrawing.
  await expect.poll(async () =>
    Number(await page.locator('#expectation-canvas').getAttribute('data-sample-count'))
  ).toBeGreaterThan(0);
});

// KR8 — the figure shares the one page column, like every panel on index.html
// (see alignment.spec.js and the note at css/style.css). index's figures live
// inside .two-panel, which zeroes the margin; this page's figure stands alone,
// so the browser's default `figure { margin: 1em 40px }` would inset it — and
// steal 80px of an already narrow mobile column.
test('KR8: the figure lines up with the prose column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/mse.html');
  await page.waitForSelector('#expectation-canvas[data-bar-count]');

  const box = async (sel) => {
    const b = await page.locator(sel).first().boundingBox();
    return { left: b.x, right: b.x + b.width };
  };
  const prose = await box('#expectation-panel > p');
  const figure = await box('#expectation-panel figure');
  const canvas = await box('#expectation-canvas');

  expect(Math.abs(figure.left - prose.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(figure.right - prose.right)).toBeLessThanOrEqual(1);

  // and the canvas itself never spills out of that column
  expect(canvas.left).toBeGreaterThanOrEqual(prose.left - 1);
  expect(canvas.right).toBeLessThanOrEqual(prose.right + 1);
});

test('KR5: the page carries no back-link', async ({ page }) => {
  await page.goto('/mse.html');
  // Deliberate: the reader arrives by clicking a word mid-sentence and returns
  // with the browser's back button. A header back-link was considered and cut.
  await expect(page.locator('header a')).toHaveCount(0);
});

// KR6 — the only door to the page. The Monte Carlo argument is a digression
// from the DDPM narrative, so it hangs off the word it explains rather than
// interrupting the training section for readers who already know it.
test('KR6: the word "MSE" in the training sentence opens the MSE page', async ({ page }) => {
  await page.goto('/index.html');

  const link = page.locator('#train-panel a[href="./mse.html"]');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('MSE');

  // It sits in the prose, not in a citation superscript.
  await expect(link).not.toHaveClass(/cite/);

  await link.click();
  await expect(page).toHaveURL(/\/mse\.html$/);
  await expect(page.locator('h1')).toContainText(/expectation/i);
});
