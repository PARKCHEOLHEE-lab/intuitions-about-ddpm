// Shared figure transport: a play/pause button driving a range slider.
//
// Lives apart from app.js because app.js is the index viewer's bootstrap — it
// calls boot() at import time and queries index-only element ids. Any second
// page that wants an animated figure needs the controls without the bootstrap,
// so the two concerns are separate modules.

// Play/pause icons as inline SVG. The shapes are geometrically centered in the
// 24×24 viewBox (triangle bbox x:[8,16] y:[6,18] → center 12,12; the two pause
// bars are symmetric about 12), so the rendered ink centers exactly in the
// button — a Unicode ▶/⏸ glyph cannot, since its ink sits off-center in the cell.
const ICON_PLAY = '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,5 7,19 17,12" /></svg>';
const ICON_PAUSE = '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" /><rect x="13.5" y="5" width="3.5" height="14" /></svg>';

// Paint a range slider's track as a "progress fill": the accent color up to the
// thumb, the neutral track color after it. WebKit has no ::-moz-range-progress
// equivalent, so the fill is driven by a gradient whose split tracks the value.
export function trackFill(slider) {
  const min = parseInt(slider.min, 10) || 0;
  const max = parseInt(slider.max, 10) || 0;
  const val = parseInt(slider.value, 10) || 0;
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  slider.style.background = `linear-gradient(to right, var(--link) ${pct}%, var(--reduce-30) ${pct}%)`;
}

// Wire a play/pause button to a range slider: clicking play auto-advances the
// slider (dispatching "input" so the panel re-renders), runs the whole range in
// ~6s regardless of frame count, then auto-stops at the end; clicking again
// pauses; replaying from the end restarts at 0. Reused by every panel's slider.
export function attachPlay(button, slider) {
  let timer = null;
  let advancing = false; // true only while the loop itself drives the slider
  const max = () => parseInt(slider.max, 10) || 0;
  const setPlaying = (on) => {
    button.setAttribute("data-playing", on ? "true" : "false");
    button.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
  };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
    setPlaying(false);
  };
  const advance = () => {
    const v = parseInt(slider.value, 10);
    if (v >= max()) { stop(); return; }
    const step = Math.max(1, Math.ceil(max() / 180)); // ~6s full sweep at 30fps
    advancing = true;
    slider.value = String(Math.min(max(), v + step));
    slider.dispatchEvent(new Event("input"));
    advancing = false;
  };
  // A user grabbing the slider mid-play pauses at that point: input events the
  // loop did NOT dispatch (advancing === false) stop the animation.
  slider.addEventListener("input", () => {
    trackFill(slider);
    if (timer && !advancing) stop();
  });
  setPlaying(false);
  button.disabled = false;
  trackFill(slider);
  button.addEventListener("click", () => {
    if (timer) { stop(); return; } // pause
    if (parseInt(slider.value, 10) >= max()) {
      slider.value = "0"; // replay from the start
      slider.dispatchEvent(new Event("input"));
    }
    setPlaying(true);
    timer = setInterval(advance, 1000 / 30);
  });
  return stop; // let the caller halt playback (e.g. on shape change)
}
