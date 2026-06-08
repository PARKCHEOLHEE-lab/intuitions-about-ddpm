// H-001 — the site README documents the new pure-JS viewer architecture.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const README = path.join(__dirname, '..', 'docs', 'README.md');

test('H-001: docs/README documents modules, run steps, and the offline-export architecture', () => {
  expect(fs.existsSync(README)).toBe(true);
  const t = fs.readFileSync(README, 'utf8');

  // 3 modules
  expect(t).toMatch(/forward/i);
  expect(t).toMatch(/training/i);
  expect(t).toMatch(/reverse/i);

  // how to serve + run the suites
  expect(t).toMatch(/http\.server|npm run serve/);
  expect(t).toMatch(/playwright test/);
  expect(t).toMatch(/pytest/);

  // the new architecture: offline torch export → precomputed JSON → static JS viewer
  expect(t).toMatch(/export_viz\.py/);
  expect(t).toMatch(/precomputed/i);
  expect(t).toMatch(/dino/i);
  expect(t).toMatch(/torch|pytorch/i);
});
