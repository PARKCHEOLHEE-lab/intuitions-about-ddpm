// KR3 — standardNormalSamples(n, seed): the draws behind the MSE page's figure.
//
// Two properties beyond "it looks Gaussian":
//   * deterministic — CI must get the same histogram on every run, so the page
//     seeds its own PRNG instead of calling Math.random().
//   * prefix-stable — growing N must APPEND draws, never resample. Dragging the
//     N slider from 100 to 1000 should thicken the same histogram, not redraw a
//     different one, and the play animation depends on that.
const { test, expect } = require('@playwright/test');

test('KR3: standardNormalSamples is deterministic, prefix-stable, and standard normal', async ({ page }) => {
  await page.goto('/index.html');

  const r = await page.evaluate(async () => {
    const m = await import('./js/plot.js');
    const { standardNormalSamples } = m;

    const a = standardNormalSamples(100, 42);
    const b = standardNormalSamples(100, 42); // same seed, same draws
    const long = standardNormalSamples(1000, 42); // must extend `a`
    const other = standardNormalSamples(100, 7); // a different seed

    const big = standardNormalSamples(20000, 42);
    const mean = big.reduce((s, x) => s + x, 0) / big.length;
    const varc = big.reduce((s, x) => s + (x - mean) * (x - mean), 0) / big.length;

    return {
      len: a.length,
      bigLen: big.length,
      sameSeed: a.every((x, i) => x === b[i]),
      prefixStable: a.every((x, i) => x === long[i]),
      differentSeed: a.some((x, i) => x !== other[i]),
      allFinite: big.every((x) => Number.isFinite(x)),
      mean,
      sd: Math.sqrt(varc),
    };
  });

  expect(r.len).toBe(100);
  expect(r.bigLen).toBe(20000);
  expect(r.allFinite).toBe(true);

  // Determinism: identical seed ⇒ identical draws; a different seed ⇒ different draws.
  expect(r.sameSeed).toBe(true);
  expect(r.differentSeed).toBe(true);

  // Prefix stability: the first 100 of 1000 draws ARE the 100-draw run.
  expect(r.prefixStable).toBe(true);

  // Standard normal: the sample mean and sd land within Monte Carlo error at
  // n = 20000 (se(mean) = 1/√n ≈ 0.007, so 0.03 is a comfortable ~4σ band).
  expect(Math.abs(r.mean)).toBeLessThan(0.03);
  expect(Math.abs(r.sd - 1)).toBeLessThan(0.03);
});
