// KR4 — the MSE page's one figure: N draws from N(0,1) against the density.
//
// Split in two, because the figure makes two independent claims:
//
//   densityHistogram      the bars are a DENSITY (count / (n·binWidth)), not a
//                         raw count — otherwise they tower over the curve and
//                         the "histogram settles onto the density" reading dies.
//   renderSampleHistogram three things are actually PAINTED: the analytic ghost,
//                         the bars, and the baseline rug.
//
// The render assertions read pixels per region/color rather than data-* attrs,
// because an attribute survives an implementation that stops drawing.
const { test, expect } = require('@playwright/test');

const PDF_PEAK = 1 / Math.sqrt(2 * Math.PI); // N(0;0,1) ≈ 0.39894
const PDF_AT_2 = Math.exp(-2) / Math.sqrt(2 * Math.PI); // N(2;0,1) ≈ 0.05399

test('KR4: densityHistogram bins the draws into density units', async ({ page }) => {
  await page.goto('/index.html');

  const r = await page.evaluate(async () => {
    const m = await import('./js/plot.js');
    const view = 4, bins = 160;
    const binWidth = (2 * view) / bins;
    const dens = m.densityHistogram(m.standardNormalSamples(50000, 42), bins, view);
    const at = (x) => dens[Math.floor((x + view) / binWidth)];
    return {
      len: dens.length,
      integral: dens.reduce((s, d) => s + d * binWidth, 0),
      atZero: at(0),
      atTwo: at(2),
      atEdge: at(3.9),
      empty: m.densityHistogram([], bins, view),
    };
  });

  expect(r.len).toBe(160);

  // A density integrates to 1 over its support. A raw-count histogram would sum
  // to 50000·binWidth = 2500 here — this single line is what forces the divide.
  expect(Math.abs(r.integral - 1)).toBeLessThan(0.01);

  // ...and it tracks N(0,1) pointwise: tall at the mean, small in the tail.
  expect(Math.abs(r.atZero - PDF_PEAK)).toBeLessThan(0.02);
  expect(Math.abs(r.atTwo - PDF_AT_2)).toBeLessThan(0.02);
  expect(r.atEdge).toBeLessThan(0.01);
  expect(r.atZero).toBeGreaterThan(r.atTwo * 5);

  // N = 0 is a real state — the play animation starts there. Zeros, not 0/0.
  expect(r.empty.every((d) => d === 0)).toBe(true);
});

test('KR4: renderSampleHistogram paints the ghost, the bars, and the rug', async ({ page }) => {
  await page.goto('/index.html');

  const r = await page.evaluate(async () => {
    const m = await import('./js/plot.js');

    // Count ink by region and by hue, so each element is checked where only it
    // can paint: the rug lives strictly below the baseline; the bars are the
    // only purple ink (blue ≫ red); the ghost is neutral grey (r = g = b).
    const inspect = (samples) => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 300;
      m.renderSampleHistogram(canvas, samples);
      const baseline = Number(canvas.dataset.baseline);
      const ctx = canvas.getContext('2d');
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      let ink = 0, purpleAbove = 0, inkBelowBaseline = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0) continue;
        ink++;
        const y = Math.floor(i / 4 / canvas.width);
        if (y > baseline + 2) inkBelowBaseline++;
        else if (px[i + 2] > px[i] + 20) purpleAbove++; // b ≫ r ⇒ the accent
      }
      return {
        baseline,
        ink,
        purpleAbove,
        inkBelowBaseline,
        sampleCount: canvas.dataset.sampleCount,
        barCount: Number(canvas.dataset.barCount),
        rugCount: Number(canvas.dataset.rugCount),
      };
    };

    return { full: inspect(m.standardNormalSamples(20000, 42)), empty: inspect([]) };
  });

  // --- the ghost: with zero draws there are no bars and no rug, so ANY ink on
  // the canvas can only be the analytic density. This is what fails if the
  // ghost stops being drawn.
  expect(r.empty.sampleCount).toBe('0');
  expect(r.empty.barCount).toBe(0);
  expect(r.empty.rugCount).toBe(0);
  expect(r.empty.inkBelowBaseline).toBe(0);
  expect(r.empty.ink).toBeGreaterThan(1000);

  // --- the bars: the only purple ink above the baseline.
  expect(r.full.sampleCount).toBe('20000');
  expect(r.full.barCount).toBeGreaterThan(50); // a real spread, not one fat bar
  expect(r.full.purpleAbove).toBeGreaterThan(1000);
  expect(r.empty.purpleAbove).toBe(0); // no draws ⇒ no bars

  // --- the rug: the only ink below the baseline, subsampled so it stays legible.
  expect(r.full.inkBelowBaseline).toBeGreaterThan(100);
  expect(r.full.rugCount).toBeGreaterThan(0);
  expect(r.full.rugCount).toBeLessThanOrEqual(400);
});
