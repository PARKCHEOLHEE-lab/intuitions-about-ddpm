// The reverse panel's MIDDLE figure (#reverse-traj, the trajectories) no longer
// shows the faint overlapped ghost of the noise start — it is drawn transparent.
const { test, expect } = require('@playwright/test');

test('reverse middle figure hides the faint overlapped ghost', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveAttribute('data-app-state', 'ready');

  const traj = page.locator('#reverse-traj');
  // ghost is rendered transparent (invisible) at load and after scrubbing
  await expect(traj).toHaveAttribute('data-ghost-color', 'rgba(0,0,0,0)');

  const slider = page.locator('#reverse-step-slider');
  await slider.fill(String(parseInt((await slider.getAttribute('max')) || '0', 10)));
  await slider.dispatchEvent('input');
  await expect(traj).toHaveAttribute('data-ghost-color', 'rgba(0,0,0,0)');
});
