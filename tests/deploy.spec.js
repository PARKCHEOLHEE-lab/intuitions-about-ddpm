// US-007 — static GitHub Pages deploy: self-contained, no server-side runtime.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'pages.yml');
const INDEX = path.join(ROOT, 'docs', 'index.html');

// KR1: a GitHub Pages workflow publishes docs/.
test('KR1: pages workflow publishes docs via deploy-pages', () => {
  expect(fs.existsSync(WORKFLOW)).toBe(true);
  const wf = fs.readFileSync(WORKFLOW, 'utf8');
  expect(wf).toMatch(/upload-pages-artifact/);
  expect(wf).toMatch(/path:\s*docs/);
  expect(wf).toMatch(/actions\/deploy-pages/);
});

// Walk deployable site files only. __pycache__/.pyc are gitignored build
// artifacts (Python bytecode embeds absolute source paths) and never reach the
// Pages artifact on a clean CI checkout, so they are not part of the site.
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__pycache__') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (!e.name.endsWith('.pyc')) out.push(p);
  }
  return out;
}

// KR2: the site is self-contained — no hardcoded local paths; relative assets.
test('KR2: self-contained (no /Users paths, relative asset URLs)', () => {
  const docs = path.join(ROOT, 'docs');
  for (const f of walk(docs)) {
    expect(fs.readFileSync(f, 'utf8')).not.toContain('/Users/');
  }
  const idx = fs.readFileSync(INDEX, 'utf8');
  expect(idx).toMatch(/href="\.\/css\/style\.css"/);
  expect(idx).toMatch(/src="\.\/js\/app\.js"/);
});

// KR3: served by a static-only host (python http.server, no app server), the
// entry page runs all three viewer modules from the precomputed JSON.
test('KR3: all three modules run under a static-only host', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  // Forward module rendered an x_t cloud.
  await expect(page.locator('#forward-scatter')).toHaveAttribute('data-cloud-sum', /.+/);

  // Training module rendered a snapshot.
  await expect(page.locator('#snapshots-canvas')).toHaveAttribute('data-point-count', '200');

  // Reverse module rendered the two-panel figure.
  await expect(page.locator('#reverse-x0')).toHaveAttribute('data-point-count', '200');
});

// KR4: deliverable count — 3 module panels in the single entry page + deploy config.
test('KR4: three module panels and a deploy config are present', () => {
  const idx = fs.readFileSync(INDEX, 'utf8');
  for (const id of ['forward-panel', 'train-panel', 'reverse-panel']) {
    expect(idx).toContain(`id="${id}"`);
  }
  expect(fs.existsSync(WORKFLOW)).toBe(true);
});
