// renderLossCurve: the training-loss convergence panel's renderer. Draws the
// global per-checkpoint loss as a step->loss curve and marks the snapshot the
// slider currently points at, exposing render facts the panel/tests read.
const { test, expect } = require('@playwright/test');

test('renderLossCurve plots step->loss and marks the current index', async ({ page }) => {
  await page.goto('/index.html');
  const r = await page.evaluate(async () => {
    const m = await import('./js/plot.js');
    const c = document.createElement('canvas');
    c.width = 420;
    c.height = 220;
    const steps = [0, 200, 400, 600, 800];
    const losses = [1.0, 0.6, 0.4, 0.25, 0.2];

    m.renderLossCurve(c, losses, steps, 2, {});
    const at2 = {
      step: c.dataset.currentStep,
      count: c.dataset.lossCount,
      loss: c.dataset.currentLoss,
      sum: c.dataset.curveSum,
    };

    m.renderLossCurve(c, losses, steps, 4, {});
    const at4 = { step: c.dataset.currentStep, loss: c.dataset.currentLoss };
    return { at2, at4 };
  });

  // the marker reports the step of the SELECTED snapshot (steps[index])
  expect(r.at2.step).toBe('400'); // steps[2]
  // every checkpoint is plotted
  expect(r.at2.count).toBe('5'); // losses.length
  // the reported current loss is that checkpoint's loss (losses[index])
  expect(parseFloat(r.at2.loss)).toBeCloseTo(0.4, 6); // losses[2]
  // and the whole curve is actually drawn (non-trivial fingerprint)
  expect(parseFloat(r.at2.sum)).toBeGreaterThan(0);

  // the marker TRACKS the index: moving the slider to 4 reports steps[4]/losses[4]
  expect(r.at4.step).toBe('800'); // steps[4]
  expect(parseFloat(r.at4.loss)).toBeCloseTo(0.2, 6); // losses[4]
  expect(r.at4.step).not.toBe(r.at2.step); // distinct index -> distinct marker
});
