// The play/pause button renders an inline SVG icon whose visible shape is
// geometrically centered in its viewBox. Two facts together guarantee the
// visible ink lands dead-center in the button box:
//   1. the SVG element is centered in the button (flex centering), and
//   2. the icon shape's getBBox center equals the viewBox center.
// A Unicode ▶/⏸ glyph fails (2): its ink sits off-center inside its cell.
// (getBoundingClientRect on an SVG sub-element is pinned to the SVG element's
// box, so it cannot see an off-center-within-viewBox shape — getBBox can.)
const { test, expect } = require('@playwright/test');

const PLAY_BUTTONS = ['#modes-play', '#t-play', '#snapshot-play', '#reverse-play'];

test('every play button centers its icon ink in the button box', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  for (const id of PLAY_BUTTONS) {
    const r = await page.locator(id).evaluate((btn) => {
      const svg = btn.querySelector('svg');
      const shapes = btn.querySelectorAll('svg polygon, svg rect, svg path');
      if (!svg || shapes.length === 0) return { hasIcon: false };
      const b = btn.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal; // viewBox in user units
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      shapes.forEach((sh) => {
        const g = sh.getBBox();
        minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
        maxX = Math.max(maxX, g.x + g.width); maxY = Math.max(maxY, g.y + g.height);
      });
      return {
        hasIcon: true,
        // (1) SVG element centered in the button box (screen px)
        svgOffX: b.left + b.width / 2 - (s.left + s.width / 2),
        svgOffY: b.top + b.height / 2 - (s.top + s.height / 2),
        // (2) icon shape centered within the viewBox (user units)
        shapeOffX: (minX + maxX) / 2 - (vb.x + vb.width / 2),
        shapeOffY: (minY + maxY) / 2 - (vb.y + vb.height / 2),
      };
    });
    expect(r.hasIcon, `${id} should render an SVG icon shape`).toBe(true);
    expect(Math.abs(r.svgOffX), `${id} svg horizontally centered in button`).toBeLessThan(1.0);
    expect(Math.abs(r.svgOffY), `${id} svg vertically centered in button`).toBeLessThan(1.0);
    expect(Math.abs(r.shapeOffX), `${id} icon shape horizontally centered in viewBox`).toBeLessThan(0.5);
    expect(Math.abs(r.shapeOffY), `${id} icon shape vertically centered in viewBox`).toBeLessThan(0.5);
  }
});

test('the play and pause icons fill a good fraction of the button', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const play = page.locator('#t-play');
  // play triangle (default) is a sizable icon, not tiny in the box
  const triFrac = await play.evaluate((btn) => {
    const svg = btn.querySelector('svg');
    const poly = btn.querySelector('svg polygon');
    return poly.getBoundingClientRect().height / svg.getBoundingClientRect().height;
  });
  expect(triFrac).toBeGreaterThan(0.55);

  // and after toggling, the pause bars are likewise sizable
  await play.click();
  await expect(play).toHaveAttribute('data-playing', 'true');
  const barFrac = await play.evaluate((btn) => {
    const svg = btn.querySelector('svg');
    const rect = btn.querySelector('svg rect');
    return rect.getBoundingClientRect().height / svg.getBoundingClientRect().height;
  });
  expect(barFrac).toBeGreaterThan(0.55);
});
