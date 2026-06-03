// Pure-JS viewer bootstrap (Diffusion-Explorer style). No Pyodide.
//
// An offline torch pipeline (ddpm/src/export_viz.py) precomputed everything
// under docs/data/. This module only FETCHES those files and renders them with
// the shared canvas renderers in plot.js — the browser does no diffusion math.
//
// The model is ONE conditional DDPM trained on all Datasaurus shapes; meta.json
// lists the shapes and per-shape data is lazy-loaded when the selector changes.
import { renderScatter, renderForwardFrame, renderEndpoints, renderDensityCurve } from "./plot.js";

const $ = (id) => document.getElementById(id);

function showError(message) {
  const el = $("error");
  el.textContent = String(message);
  el.hidden = false;
  document.body.setAttribute("data-app-state", "error");
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch ${path} → ${res.status}`);
  return res.json();
}

// Wire a play/pause button to a range slider: clicking play auto-advances the
// slider (dispatching "input" so the panel re-renders), runs the whole range in
// ~6s regardless of frame count, then auto-stops at the end; clicking again
// pauses; replaying from the end restarts at 0. Reused by every panel's slider.
function attachPlay(button, slider) {
  let timer = null;
  let advancing = false; // true only while the loop itself drives the slider
  const max = () => parseInt(slider.max, 10) || 0;
  const setPlaying = (on) => {
    button.setAttribute("data-playing", on ? "true" : "false");
    button.textContent = on ? "⏸" : "▶";
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
    if (timer && !advancing) stop();
  });
  setPlaying(false);
  button.disabled = false;
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

// Each panel initializes ONCE (binding sliders/toggles/play), then exposes a
// setter that swaps in a new shape's data and re-renders — so switching shapes
// never re-binds listeners.

// --- Forward viewer: scrub precomputed frames by index (timestep t) ----------
function initForward(view, alphasBar) {
  const slider = $("t-slider");
  const smooth = $("forward-smooth");
  const showTraj = $("forward-show-traj");
  let forward = { frames: [[]], ts: [0] };
  let x0 = [];

  function renderAt(i) {
    const t = forward.ts[i];
    renderForwardFrame($("forward-scatter"), forward.frames, i, {
      view,
      shape: `t=${t}`,
      trail: showTraj.checked,
      smooth: smooth.checked,
      smoothIterations: 3,
    });
    // analytic q(x_t) marginal of the x-coordinate, synced to the same timestep,
    // over a faint underlay of the original data distribution q(x0)
    renderDensityCurve($("forward-density"), x0, alphasBar[t], { view, ghostAbar: alphasBar[0] });
    $("t-value").textContent = String(t);
  }
  const rerender = () => renderAt(parseInt(slider.value, 10) || 0);
  slider.addEventListener("input", rerender);
  smooth.addEventListener("change", rerender);
  showTraj.addEventListener("change", rerender);
  const stopPlay = attachPlay($("t-play"), slider);

  return function setForward(fwd, cleanData) {
    forward = fwd;
    x0 = cleanData;
    stopPlay();
    // static clean data x0 (the start of forward diffusion) — does not animate
    renderScatter($("forward-endpoint"), x0, { shape: "x0", view });
    const last = fwd.frames.length - 1;
    slider.min = "0";
    slider.max = String(last);
    slider.value = String(last); // default to the final timestep (t=399, pure noise)
    slider.disabled = false;
    renderAt(last);
  };
}

// --- Training viewer: step through the snapshots of the selected shape -------
function initTraining(view) {
  const slider = $("snapshot-slider");
  let training = { snapshots: [[]], steps: [0] };

  function renderAt(i) {
    renderScatter($("snapshots-canvas"), training.snapshots[i], {
      shape: `step ${training.steps[i]}`,
      view,
    });
    $("train-step").textContent = String(training.steps[i]);
  }
  slider.addEventListener("input", () => renderAt(parseInt(slider.value, 10) || 0));
  const stopPlay = attachPlay($("snapshot-play"), slider);

  return function setTraining(tr) {
    training = tr;
    stopPlay();
    slider.min = "0";
    slider.max = String(tr.snapshots.length - 1);
    slider.value = "0";
    slider.disabled = false;
    renderAt(0);
  };
}

// --- Reverse viewer: two-panel figure (final x_0 + trajectories) -------------
function initReverse(view, alphasBar) {
  const slider = $("reverse-step-slider");
  const smooth = $("reverse-smooth");
  const showTraj = $("reverse-show-traj");
  let reverse = { trajectory: [[]], timesteps: [0], final: [] };
  let x0 = [];

  function renderStep(i) {
    const t = reverse.timesteps[i];
    renderForwardFrame($("reverse-traj"), reverse.trajectory, i, {
      view,
      color: "#16a34a",
      shape: `t=${t}`,
      trail: showTraj.checked,
      smooth: smooth.checked,
    });
    // same analytic q(x_t) marginal; here the slider walks t from T-1 down to 0,
    // so the distribution gathers from a single bell back into multimodal data
    renderDensityCurve($("reverse-density"), x0, alphasBar[t], { view, color: "#16a34a", fill: "rgba(22,163,74,0.16)", ghostAbar: alphasBar[0] });
    $("reverse-step").textContent = String(t);
  }
  const rerender = () => renderStep(parseInt(slider.value, 10) || 0);
  slider.addEventListener("input", rerender);
  smooth.addEventListener("change", rerender);
  showTraj.addEventListener("change", rerender);
  const stopPlay = attachPlay($("reverse-play"), slider);

  return function setReverse(rv, cleanData) {
    reverse = rv;
    x0 = cleanData;
    stopPlay();
    renderScatter($("reverse-x0"), rv.final, { shape: "x0", color: "#16a34a", view });
    const last = rv.trajectory.length - 1;
    slider.min = "0";
    slider.max = String(last);
    slider.value = "0"; // default to the noise start (index 0 = t = T-1 = 399)
    slider.disabled = false;
    renderStep(0);
  };
}

// --- Intro: noise → data transport (shape-agnostic, initialized once) --------
function initModes(modes) {
  const slider = $("modes-slider");
  const smooth = $("modes-smooth");
  const showTraj = $("modes-show-traj");
  const last = modes.trajectories.length - 1;
  slider.min = "0";
  slider.max = String(last);
  slider.value = String(last);

  const modeEnds = modes.mode_clouds.flatMap((c) => c.points);
  const modeEndColors = modes.mode_clouds.flatMap((c) => c.points.map(() => c.color));
  const halfModeClouds = modes.mode_clouds.map((c) => ({
    color: c.color,
    points: c.points.slice(0, Math.ceil(c.points.length / 2)),
  }));
  const backdrop = [{ color: "#dc2626", points: modes.xT_cloud }, ...halfModeClouds];

  renderEndpoints($("modes-endpoints"), modes.xT_cloud, modeEnds, {
    view: modes.view,
    center: modes.center,
    colors: modeEndColors,
    startColor: "#dc2626",
  });

  function renderStep(i) {
    renderForwardFrame($("modes-canvas"), modes.trajectories, i, {
      view: modes.view,
      center: modes.center,
      colors: modes.colors,
      ghostColor: "rgba(0,0,0,0)",
      backdrop,
      solidStarts: modes.starts,
      currentMarker: i === last ? "cross" : "dot",
      trail: showTraj.checked,
      smooth: smooth.checked,
      smoothIterations: 3,
      shape: `t=${modes.timesteps[i]}`,
    });
    $("modes-step").textContent = String(modes.timesteps[i]);
  }

  renderStep(last);
  slider.disabled = false;
  const rerender = () => renderStep(parseInt(slider.value, 10));
  slider.addEventListener("input", rerender);
  smooth.addEventListener("change", rerender);
  showTraj.addEventListener("change", rerender);
  attachPlay($("modes-play"), slider);
}

async function boot() {
  try {
    const [meta, modes] = await Promise.all([
      fetchJSON("./data/precomputed/meta.json"),
      fetchJSON("./data/precomputed/modes.json"),
    ]);

    initModes(modes);

    const setForward = initForward(meta.view, meta.alphas_bar);
    const setTraining = initTraining(meta.view);
    const setReverse = initReverse(meta.view, meta.alphas_bar);

    // lazy-load a shape's per-shape JSON on demand, then swap it into every panel
    const cache = {};
    async function loadShape(shape) {
      if (!cache[shape]) {
        const [forward, training, reverse] = await Promise.all([
          fetchJSON(`./data/precomputed/forward_${shape}.json`),
          fetchJSON(`./data/precomputed/training_${shape}.json`),
          fetchJSON(`./data/precomputed/reverse_${shape}.json`),
        ]);
        cache[shape] = { forward, training, reverse };
      }
      const { forward, training, reverse } = cache[shape];
      const cleanData = meta.data[shape];
      setForward(forward, cleanData);
      setTraining(training);
      setReverse(reverse, cleanData);
    }

    // populate the shape selector
    const sel = $("shape-select");
    sel.innerHTML = "";
    for (const s of meta.shapes) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);
    }
    const initial = meta.shapes.includes("dino") ? "dino" : meta.shapes[0];
    sel.value = initial;
    await loadShape(initial);
    sel.disabled = false;
    sel.addEventListener("change", () => loadShape(sel.value));

    document.body.setAttribute("data-app-state", "ready");
  } catch (err) {
    // Never swallow a load failure — surface it (no silent fallback).
    showError(err && err.stack ? err.stack : err);
  }
}

boot();
