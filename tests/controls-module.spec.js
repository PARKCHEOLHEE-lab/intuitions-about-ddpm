// KR1 — the play/scrub transport lives in its own module (docs/js/controls.js)
// so a second page can reuse it. app.js runs boot() at import time, so importing
// the transport FROM app.js would drag the whole index bootstrap onto any page
// that only wants a play button. controls.js must therefore stand alone: no
// app.js import, no dependency on index-only DOM.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const CONTROLS = path.join(__dirname, '..', 'docs', 'js', 'controls.js');
const APP = path.join(__dirname, '..', 'docs', 'js', 'app.js');

test('KR1: controls.js drives a play button + slider that index.html never saw', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/index.html');

  // Build a button + slider that exist nowhere in index.html, so nothing here
  // can accidentally lean on the page's own #t-play / #t-slider wiring.
  const r = await page.evaluate(async () => {
    const m = await import('./js/controls.js');
    const box = document.createElement('div');
    box.innerHTML =
      '<button id="kr1-play" disabled></button>' +
      '<input id="kr1-slider" type="range" min="0" max="100" value="0" />';
    document.body.appendChild(box);
    const button = box.querySelector('#kr1-play');
    const slider = box.querySelector('#kr1-slider');

    const exportsTransport =
      typeof m.attachPlay === 'function' && typeof m.trackFill === 'function';

    m.attachPlay(button, slider);
    const wired = {
      enabled: button.disabled === false,
      playing: button.getAttribute('data-playing'),
      track: slider.style.background,
      icon: button.innerHTML,
    };

    button.click(); // press play
    return {
      exportsTransport,
      wired,
      playingAfterClick: button.getAttribute('data-playing'),
      valueAtPress: Number(slider.value),
    };
  });

  // attachPlay/trackFill are the module's contract.
  expect(r.exportsTransport).toBe(true);

  // Wiring alone must enable the button, stamp the paused state, paint the
  // track, and render the play glyph.
  expect(r.wired.enabled).toBe(true);
  expect(r.wired.playing).toBe('false');
  expect(r.wired.track).toContain('linear-gradient');
  expect(r.wired.icon).toContain('<svg');

  // Pressing play flips the state...
  expect(r.playingAfterClick).toBe('true');
  expect(r.valueAtPress).toBe(0);

  // ...and the timer actually advances the slider on a page with no index wiring.
  await page.waitForTimeout(500);
  const advanced = await page.evaluate(() =>
    Number(document.getElementById('kr1-slider').value)
  );
  expect(advanced).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('KR1: controls.js stands alone — it never imports app.js', () => {
  expect(fs.existsSync(CONTROLS)).toBe(true);
  const src = fs.readFileSync(CONTROLS, 'utf8');
  expect(src).not.toMatch(/from\s+["'][^"']*app\.js["']/);
  expect(src).toMatch(/export function attachPlay/);
  expect(src).toMatch(/export function trackFill/);
});

// KR2 — the extraction is a MOVE, not a copy. Two definitions of the transport
// would drift: control-accent.spec.js pins trackFill's exact gradient string and
// play-center.spec.js pins the icon geometry, but only against whichever copy
// index.html happens to load.
test('KR2: app.js imports the transport rather than defining its own', () => {
  const src = fs.readFileSync(APP, 'utf8');
  expect(src).toMatch(
    /import\s*\{[^}]*\battachPlay\b[^}]*\}\s*from\s*["']\.\/controls\.js["']/
  );
  expect(src).toMatch(
    /import\s*\{[^}]*\btrackFill\b[^}]*\}\s*from\s*["']\.\/controls\.js["']/
  );
  expect(src).not.toMatch(/function\s+attachPlay/);
  expect(src).not.toMatch(/function\s+trackFill/);
  expect(src).not.toMatch(/ICON_PLAY/);
  expect(src).not.toMatch(/ICON_PAUSE/);
});
