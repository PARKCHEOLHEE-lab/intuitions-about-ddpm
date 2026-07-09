// KR7 — the two claims the page exists to make.
//
//  1. The multiplicity argument. A weighted average can be built from
//     coefficients (0.8A + 0.2B) OR from repetition ((8A + 2B)/10). Monte Carlo
//     uses the second: the weight becomes the frequency of the draw. Without
//     this the page is a picture of a bell curve with no argument attached.
//
//  2. The λ_t caveat. The loss printed on index.html is Ho et al.'s L_simple,
//     which DISCARDS the ELBO's per-timestep weight λ_t. That weight is not
//     restored by the sampling. A page titled "The Expectation Behind the MSE",
//     reached by clicking the loss, must not imply it accounts for every weight.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const README = path.join(__dirname, '..', 'docs', 'README.md');

test('KR7: the page makes the multiplicity argument', async ({ page }) => {
  await page.goto('/mse.html');
  await page.waitForSelector('.katex');
  const text = await page.locator('main').evaluate((el) => el.innerText);

  // Both constructions of the same weighted average are shown.
  expect(text).toMatch(/0\.8\s*A\s*\+\s*0\.2\s*B/);
  expect(text).toMatch(/A\s*\+\s*A/); // the repeated-value form

  // ...and the page names what does the weighting.
  expect(text).toMatch(/multiplicit|repeat|repetition|how often|frequency/i);
});

test('KR7: the page states that L_simple drops the ELBO weight', async ({ page }) => {
  await page.goto('/mse.html');
  await page.waitForSelector('.katex');
  const raw = await page.locator('main').evaluate((el) => el.innerText);

  // KaTeX breaks each symbol onto its own line, so collapse whitespace before
  // matching. Zero-width joiners inside the math also go.
  const text = raw.replace(/[​⁠﻿]/g, '').replace(/\s+/g, ' ');

  expect(text).toMatch(/λ/); // the weight is named
  expect(text).toMatch(/ELBO|variational bound|evidence lower bound/i);

  // The verb must be BOUND to L_simple. Asserting that the words "λ" and
  // "discard" merely co-occur somewhere on the page is not enough: a page
  // claiming L_simple "carries it through, so every timestep is weighted
  // correctly" would still satisfy that, and would be wrong.
  expect(text).toMatch(/L\s*simple[^.]{0,60}\b(discards|drops|omits)\b/i);

  // And the page must deny that the sampling puts it back — the precise
  // overclaim a reader arriving from the loss equation is at risk of making.
  expect(text).toMatch(/\bnot\b[^.]{0,80}\b(restores|carries)\b/i);
});

test('KR7: docs/README documents the second page and the shared transport', () => {
  const t = fs.readFileSync(README, 'utf8');
  expect(t).toMatch(/mse\.html/);
  expect(t).toMatch(/controls\.js/);
  expect(t).toMatch(/mse\.js/);
  // The README's architecture section claims the browser only replays
  // precomputed JSON. mse.html samples live, so the exception must be written down.
  expect(t).toMatch(/seed|deterministic/i);
});
