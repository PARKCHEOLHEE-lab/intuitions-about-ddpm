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

// Play/pause icons as inline SVG. The shapes are geometrically centered in the
// 24×24 viewBox (triangle bbox x:[8,16] y:[6,18] → center 12,12; the two pause
// bars are symmetric about 12), so the rendered ink centers exactly in the
// button — a Unicode ▶/⏸ glyph cannot, since its ink sits off-center in the cell.
const ICON_PLAY = '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="7,5 7,19 17,12" /></svg>';
const ICON_PAUSE = '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.5" height="14" /><rect x="13.5" y="5" width="3.5" height="14" /></svg>';

// Paint a range slider's track as a "progress fill": the accent color up to the
// thumb, the neutral track color after it. WebKit has no ::-moz-range-progress
// equivalent, so the fill is driven by a gradient whose split tracks the value.
function trackFill(slider) {
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
function attachPlay(button, slider) {
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

// Each panel initializes ONCE (binding sliders/toggles/play), then exposes a
// setter that swaps in a new shape's data and re-renders — so switching shapes
// never re-binds listeners.

// Wire a trajectory panel's standard scrub controls (slider + smooth/showTraj
// toggles) to one re-render fn, so the three panels don't each repeat the same
// three listeners. The render fn receives the current slider index.
function wireScrub(slider, smooth, showTraj, render) {
  const rerender = () => render(parseInt(slider.value, 10) || 0);
  slider.addEventListener("input", rerender);
  smooth.addEventListener("change", rerender);
  showTraj.addEventListener("change", rerender);
}

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
    });
    // analytic q(x_t) marginal of the x-coordinate, synced to the same timestep,
    // over a faint underlay of the original data distribution q(x0)
    renderDensityCurve($("forward-density"), x0, alphasBar[t], { view, ghostAbar: alphasBar[0] });
    $("t-value").textContent = String(t);
  }
  wireScrub(slider, smooth, showTraj, renderAt);
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
    trackFill(slider);
  };
}

// --- Training viewer: step through the snapshots of the selected shape -------
function initTraining(view) {
  const slider = $("snapshot-slider");
  let training = { snapshots: [[]], steps: [0] };
  let gt = [];

  function renderAt(i) {
    renderScatter($("snapshots-canvas"), training.snapshots[i], {
      shape: `step ${training.steps[i]}`,
      view,
      color: "#16a34a", // generated samples: green, matching reverse sampling
      ghost: gt, // faint ground-truth overlay behind the generated samples
      ghostColor: "#6d28d9", // gt overlay: faint purple
      ghostAlpha: 0.22,
    });
    $("train-step").textContent = String(training.steps[i]);
  }
  slider.addEventListener("input", () => renderAt(parseInt(slider.value, 10) || 0));
  const stopPlay = attachPlay($("snapshot-play"), slider);

  return function setTraining(tr, cleanData) {
    training = tr;
    gt = cleanData;
    stopPlay();
    // ground truth: the clean x0 the model learns to reproduce — static, the
    // same clean scatter the forward panel shows (does not animate)
    renderScatter($("train-groundtruth"), cleanData, { shape: "x0", view });
    slider.min = "0";
    slider.max = String(tr.snapshots.length - 1);
    slider.value = "0";
    slider.disabled = false;
    renderAt(0);
    trackFill(slider);
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
      ghostColor: "rgba(0,0,0,0)", // hide the faint overlapped noise-start ghost
      shape: `t=${t}`,
      trail: showTraj.checked,
      smooth: smooth.checked,
    });
    // same analytic q(x_t) marginal; here the slider walks t from T-1 down to 0,
    // so the distribution gathers from a single bell back into multimodal data
    renderDensityCurve($("reverse-density"), x0, alphasBar[t], { view, color: "#16a34a", fill: "rgba(22,163,74,0.16)", ghostAbar: alphasBar[0] });
    $("reverse-step").textContent = String(t);
  }
  wireScrub(slider, smooth, showTraj, renderStep);
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
    trackFill(slider);
  };
}

// Populate an in-canvas legend: each entry is a colored × (or ─ for a line),
// followed by its italic label; entries with only `note` render as a sub-line.
function buildLegend(el, entries) {
  el.innerHTML = "";
  for (const e of entries) {
    const row = document.createElement("span");
    if (e.note) {
      row.className = "lg-note";
      row.innerHTML = e.note;
    } else {
      row.className = "lg-row";
      const mark = document.createElement("span");
      mark.className = "lg-mark";
      mark.style.color = e.color;
      mark.textContent = e.line ? "─" : e.dot ? "●" : "✕";
      const label = document.createElement("span");
      label.className = "lg-label";
      label.innerHTML = e.label;
      row.append(mark, label);
    }
    el.appendChild(row);
  }
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

  // in-canvas legends, per SYMBOL (the markers now distinguish the series):
  // ● x_T (noise) and ✕ x_0 (data modes); the trajectories plot also lists the
  // trajectory line. Modes are multi-colored on the canvas, so the x_0 key uses
  // a neutral color — the symbol, not the color, is what the legend explains.
  const baseLegend = [
    { color: "#dc2626", label: "x<sub>T</sub>", dot: true },
    { color: "#6b7280", label: "x<sub>0</sub>" },
  ];
  buildLegend($("modes-endpoints-legend"), baseLegend);
  buildLegend($("modes-canvas-legend"), [
    ...baseLegend,
    { color: "#9ca3af", label: "trajectory", line: true },
    { note: "x<sub>T</sub> → x<sub>T-1</sub> → ⋯ → x<sub>0</sub>" },
  ]);

  const modeEnds = modes.mode_clouds.flatMap((c) => c.points);
  const modeEndColors = modes.mode_clouds.flatMap((c) => c.points.map(() => c.color));
  const halfModeClouds = modes.mode_clouds.map((c) => ({
    color: c.color,
    points: c.points.slice(0, Math.ceil(c.points.length / 2)),
  }));
  const backdrop = [{ color: "#dc2626", points: modes.xT_cloud, marker: "dot" }, ...halfModeClouds];

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
      solidStartMarker: "dot",
      currentMarker: i === last ? "cross" : "dot",
      trail: showTraj.checked,
      smooth: smooth.checked,
      shape: `t=${modes.timesteps[i]}`,
    });
    $("modes-step").textContent = String(modes.timesteps[i]);
  }

  renderStep(last);
  slider.disabled = false;
  wireScrub(slider, smooth, showTraj, renderStep);
  attachPlay($("modes-play"), slider);
}

// Reflect the dataset bar's pinned ("stuck") state so CSS can restyle it (dark
// background, more padding). A sticky bar pinned at top:0 has a viewport top of
// 0; before it pins, its top is positive — so a rAF-throttled scroll check
// toggles .stuck. (Checking the bar directly is robust to jump/programmatic
// scrolls, which an IntersectionObserver sentinel can skip over.)
function initStickyState() {
  const bar = $("shape-bar");
  if (!bar) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    bar.classList.toggle("stuck", bar.getBoundingClientRect().top <= 1);
  };
  window.addEventListener(
    "scroll",
    () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } },
    { passive: true }
  );
  update(); // initial state
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
      setTraining(training, cleanData);
      setReverse(reverse, cleanData);
    }

    // populate the custom dataset dropdown — a styled listbox that proxies to
    // the hidden <select>, which stays the value holder + change emitter so the
    // loadShape wiring below is untouched.
    const sel = $("shape-select");
    const trigger = $("shape-trigger");
    const list = $("shape-list");
    const valueEl = $("shape-value");
    const dropdown = $("shape-dropdown");
    sel.innerHTML = "";
    list.innerHTML = "";
    for (const s of meta.shapes) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      sel.appendChild(opt);

      const li = document.createElement("li");
      li.className = "ds-option";
      li.id = `ds-opt-${s}`;
      li.setAttribute("role", "option");
      li.dataset.value = s;
      li.textContent = s;
      list.appendChild(li);
    }
    const initial = meta.shapes.includes("dino") ? "dino" : meta.shapes[0];

    function setShapeValue(shape) {
      sel.value = shape;
      valueEl.textContent = shape;
      for (const li of list.children) {
        li.setAttribute("aria-selected", li.dataset.value === shape ? "true" : "false");
      }
    }
    const opts = () => Array.from(list.children);
    let activeIdx = -1;
    function setActive(i) {
      const o = opts();
      if (!o.length) return;
      activeIdx = Math.max(0, Math.min(o.length - 1, i));
      o.forEach((li, k) => li.classList.toggle("active", k === activeIdx));
      list.setAttribute("aria-activedescendant", o[activeIdx].id);
      o[activeIdx].scrollIntoView({ block: "nearest" });
    }
    function openList() {
      list.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      const cur = opts().findIndex((li) => li.dataset.value === sel.value);
      setActive(cur >= 0 ? cur : 0);
      list.focus();
    }
    function closeList(refocus = true) {
      list.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      opts().forEach((li) => li.classList.remove("active"));
      if (refocus) trigger.focus();
    }
    function chooseShape(shape) {
      if (shape !== sel.value) {
        setShapeValue(shape);
        sel.dispatchEvent(new Event("change"));
      }
      closeList();
    }

    setShapeValue(initial);
    await loadShape(initial);
    sel.disabled = false;
    trigger.disabled = false;
    sel.addEventListener("change", () => loadShape(sel.value));
    // the trigger is a <button>: Space/Enter open via the native click; arrows open too
    trigger.addEventListener("click", () => (list.hidden ? openList() : closeList()));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openList(); }
    });
    list.addEventListener("click", (e) => {
      const li = e.target.closest(".ds-option");
      if (li) chooseShape(li.dataset.value);
    });
    list.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeList(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === "Home") { e.preventDefault(); setActive(0); }
      else if (e.key === "End") { e.preventDefault(); setActive(opts().length - 1); }
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const li = opts()[activeIdx];
        if (li) chooseShape(li.dataset.value);
      }
    });
    document.addEventListener("click", (e) => {
      if (!list.hidden && !dropdown.contains(e.target)) closeList(false);
    });

    initStickyState();
    document.body.setAttribute("data-app-state", "ready");
  } catch (err) {
    // Never swallow a load failure — surface it (no silent fallback).
    showError(err && err.stack ? err.stack : err);
  }
}

boot();
