// Minimal 2D scatter renderer on a <canvas>, reused by every module.
// Points are expected in roughly the unit range (max-norm normalized).

const VIEW = 1.15; // half-extent of the plotted region (a little past the unit circle)

function mapper(size, pad, view = VIEW) {
  // map data coord in [-view, view] to pixel in [pad, size-pad]
  return (v) => pad + ((v + view) / (2 * view)) * (size - 2 * pad);
}

// Build the data→pixel projector shared by every 2D renderer: sx/sy map data
// coords into one fixed canvas frame (y flipped so +y points up), with an
// optional center offset so off-origin content sits in the middle. Centralizing
// it here keeps all panels on one framing convention instead of three copies.
function projector(W, H, pad, view, center = [0, 0]) {
  const [cx, cy] = center;
  const mx = mapper(W, pad, view);
  const my = mapper(H, pad, view);
  return { sx: (v) => mx(v - cx), sy: (v) => H - my(v - cy) };
}

// Stroke an × marker (two diagonals) of arm radius r at pixel (px,py). The
// caller sets strokeStyle/lineWidth beforehand; this owns its own path so the
// glyph geometry lives in one place (endpoint crosses + trajectory markers).
function strokeCross(ctx, px, py, r) {
  ctx.beginPath();
  ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
  ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
  ctx.stroke();
}

// Chaikin's corner-cutting subdivision: smooths a polyline by repeatedly
// replacing each interior segment with its 1/4 and 3/4 points (cutting corners),
// while pinning the two endpoints. Used to render the stochastic trajectory
// polylines as clean curves without distorting the actual sample positions.
export function chaikinSmooth(points, iterations = 2) {
  let out = points;
  for (let it = 0; it < iterations; it++) {
    if (out.length < 3) break;
    const next = [out[0]]; // pin the first endpoint
    for (let i = 0; i < out.length - 1; i++) {
      const [x0, y0] = out[i];
      const [x1, y1] = out[i + 1];
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]); // Q: 1/4 in
      next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]); // R: 3/4 in
    }
    next.push(out[out.length - 1]); // pin the last endpoint
    out = next;
  }
  return out;
}

// Analytic diffused marginal q(x_t) along one axis, evaluated on a grid over
// [-view, view] and normalized to its own max. The forward closed form
// x_t = √ᾱ_t·x0 + √(1−ᾱ_t)·ε makes q(x_t) EXACTLY a Gaussian mixture: one
// Gaussian per clean data point, centered at √ᾱ_t·x0_i with variance (1−ᾱ_t).
// This is the textbook "Diffused Data Distributions" curve — multimodal data at
// small t collapsing to a single N(0,1) bell at large t — with no sampling
// noise. A small additive DATA_VAR represents the finite data points as a smooth
// density (instead of deltas) at t≈0; it is negligible once (1−ᾱ_t) grows.
const DENSITY_GRID = 160;
const DATA_VAR = 0.01; // σ≈0.1 data-smoothing floor so x0 reads as a smooth density
export function diffusedMarginal1d(x0, axis, abarT, view) {
  const n = x0.length;
  const sa = Math.sqrt(abarT);
  const varT = (1 - abarT) + DATA_VAR;
  const norm = 1 / Math.sqrt(2 * Math.PI * varT);
  const out = new Array(DENSITY_GRID);
  for (let k = 0; k < DENSITY_GRID; k++) {
    const g = -view + (2 * view) * (k / (DENSITY_GRID - 1));
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = g - sa * x0[i][axis];
      s += Math.exp(-(d * d) / (2 * varT));
    }
    out[k] = (s * norm) / n;
  }
  const mx = Math.max(...out, 1e-9);
  return out.map((d) => d / mx);
}

// The faint ghost underlay (q(x0), the ORIGINAL distribution) is invariant while
// scrubbing a shape — same x0/axis/ghostAbar/view every frame — so cache it per
// canvas instead of recomputing its ~DENSITY_GRID×N Gaussian sum each tick. The
// key fields are compared on every call; a shape switch (new x0) recomputes once.
const _ghostCache = new WeakMap(); // canvas -> { x0, axis, abar, view, g }

// Draw the q(x_t) marginal as a filled density curve in a fixed [-view, view]
// frame (so it does not rescale while scrubbing). Reuses the canonical mapper().
// Exposes data-peak-count (local maxima of the normalized curve) and
// data-curve-sum so tests can confirm the multimodal→unimodal morph.
export function renderDensityCurve(canvas, x0, abarT, opts = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, pad = 14;
  const view = opts.view || VIEW;
  const sx = mapper(W, pad, view);
  const axis = opts.axis || 0;
  const d = diffusedMarginal1d(x0, axis, abarT, view);
  const yOf = (v) => (H - pad) - v * (H - 2 * pad);
  const xOf = (k) => pad + (k / (DENSITY_GRID - 1)) * (W - 2 * pad);
  const traceFill = (arr, style) => {
    ctx.beginPath();
    ctx.moveTo(xOf(0), H - pad);
    for (let k = 0; k < DENSITY_GRID; k++) ctx.lineTo(xOf(k), yOf(arr[k]));
    ctx.lineTo(xOf(DENSITY_GRID - 1), H - pad);
    ctx.closePath();
    ctx.fillStyle = style; ctx.fill();
  };
  const traceLine = (arr, style, w, dash) => {
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    for (let k = 0; k < DENSITY_GRID; k++) (k ? ctx.lineTo : ctx.moveTo).call(ctx, xOf(k), yOf(arr[k]));
    ctx.strokeStyle = style; ctx.lineWidth = w; ctx.stroke();
    ctx.setLineDash([]);
  };

  ctx.clearRect(0, 0, W, H);
  const color = opts.color || "#6d28d9";

  // faint underlay of the ORIGINAL data distribution q(x0) (opts.ghostAbar),
  // so the live curve reads against the shape it morphed from / toward.
  const hasGhost = opts.ghostAbar != null;
  if (hasGhost) {
    let entry = _ghostCache.get(canvas);
    if (!entry || entry.x0 !== x0 || entry.axis !== axis || entry.abar !== opts.ghostAbar || entry.view !== view) {
      entry = { x0, axis, abar: opts.ghostAbar, view, g: diffusedMarginal1d(x0, axis, opts.ghostAbar, view) };
      _ghostCache.set(canvas, entry);
    }
    traceFill(entry.g, "rgba(120,120,120,0.08)");
    traceLine(entry.g, "rgba(120,120,120,0.45)", 1, [4, 3]); // dashed = the original shape
  }

  // live q(x_t) curve: filled area + thin (1px) outline
  traceFill(d, opts.fill || "rgba(109,40,217,0.18)");
  traceLine(d, color, 1);

  // count local maxima above a threshold (data → multimodal, noise → 1 bell)
  let peaks = 0, sum = 0;
  for (let k = 0; k < DENSITY_GRID; k++) {
    sum += d[k];
    if (k > 0 && k < DENSITY_GRID - 1 && d[k] > 0.2 && d[k] > d[k - 1] && d[k] >= d[k + 1]) peaks++;
  }
  canvas.dataset.peakCount = String(peaks);
  canvas.dataset.curveSum = sum.toFixed(3);
  canvas.dataset.lineWidth = "1";
  canvas.dataset.ghostShown = String(hasGhost);
  canvas.dataset.view = String(view);
  // touch sx so the shared mapper is genuinely reused (x-axis is in data coords)
  canvas.dataset.xRange = `${sx(-view).toFixed(1)},${sx(view).toFixed(1)}`;
}

export function renderScatter(canvas, points, opts = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const pad = 12;
  const view = opts.view || VIEW; // half-extent; pass a data-fit value to avoid clipping
  // optional center offset (data coords): a positive x shifts the whole cloud
  // left, so a panel can nudge off-balance content without changing its scale.
  const { sx, sy } = projector(W, H, pad, view, opts.center || [0, 0]);

  ctx.clearRect(0, 0, W, H);

  const r = opts.radius || 2;
  // optional faint ground-truth underlay drawn BEHIND the main points, so you
  // can see how well they overlap the target. Excluded from the checksum.
  const ghost = opts.ghost || null;
  const ghostColor = opts.ghostColor || "#9ca3af";
  if (ghost && ghost.length) {
    ctx.save();
    ctx.globalAlpha = opts.ghostAlpha != null ? opts.ghostAlpha : 0.32;
    ctx.fillStyle = ghostColor;
    const gr = opts.ghostRadius || r;
    for (let i = 0; i < ghost.length; i++) {
      ctx.beginPath();
      ctx.arc(sx(ghost[i][0]), sy(ghost[i][1]), gr, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  const fillColor = opts.color || "#6d28d9";
  ctx.fillStyle = fillColor;
  let checksum = 0;
  for (let i = 0; i < points.length; i++) {
    const x = points[i][0];
    const y = points[i][1];
    ctx.beginPath();
    ctx.arc(sx(x), sy(y), r, 0, 2 * Math.PI);
    ctx.fill();
    checksum += x * 1.000001 + y; // order/value-sensitive content fingerprint
  }

  // Expose render facts for tests + later modules.
  canvas.dataset.shape = opts.shape || "";
  canvas.dataset.pointCount = String(points.length);
  canvas.dataset.cloudSum = checksum.toFixed(4);
  canvas.dataset.color = fillColor;
  canvas.dataset.ghostCount = String(ghost ? ghost.length : 0);
  canvas.dataset.ghostColor = ghost ? ghostColor : "";
  canvas.dataset.view = String(view);
}

// Endpoints-only figure (the left "what" panel of the transport plot): start
// points (x_T) as faint crosses and end points (x_0) as solid crosses colored
// per-point by the mode each one reached. No trajectories — just the clusters.
export function renderEndpoints(canvas, starts, ends, opts = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, pad = 12;
  const view = opts.view || VIEW;
  const [cx, cy] = opts.center || [0, 0]; // shift so offset content is centered
  const { sx, sy } = projector(W, H, pad, view, [cx, cy]);

  ctx.clearRect(0, 0, W, H);
  ctx.lineWidth = 1.6;
  // x_T starts (noise) — red DOTS (a distinct symbol from the x_0 crosses)
  const startColor = opts.startColor || "rgba(220,38,38,0.7)";
  ctx.fillStyle = startColor;
  for (const [x, y] of starts) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 2.6, 0, 2 * Math.PI); ctx.fill(); }
  // x_0 ends — solid, colored by mode
  const colors = opts.colors || null;
  for (let i = 0; i < ends.length; i++) {
    ctx.strokeStyle = colors ? colors[i] : (opts.color || "#6d28d9");
    strokeCross(ctx, sx(ends[i][0]), sy(ends[i][1]), 3.5);
  }

  canvas.dataset.pointCount = String(ends.length);
  canvas.dataset.startCount = String(starts.length);
  canvas.dataset.modeCount = String(colors ? new Set(colors).size : 1);
  canvas.dataset.view = String(view);
  canvas.dataset.center = `${cx},${cy}`;
  canvas.dataset.marker = "cross";       // x_0 ends
  canvas.dataset.startMarker = "dot";     // x_T starts
  canvas.dataset.startColor = startColor;
}

// Forward-diffusion frame: draws, in one fixed coordinate frame so nothing
// rescales while scrubbing —
//   1) a faint persistent ghost of the original t=0 data,
//   2) the cumulative per-point trail of frames[0..index] (where each point has
//      travelled as it noises), and
//   3) the current x_t points solid on top.
// `frames` is index→[[x,y]…]; `opts.view` fixes the half-extent across all frames.
export function renderForwardFrame(canvas, frames, index, opts = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, pad = 12;
  const view = opts.view || VIEW;
  // optional center offset to frame shifted content (e.g. the modes figure)
  const { sx, sy } = projector(W, H, pad, view, opts.center || [0, 0]);

  ctx.clearRect(0, 0, W, H);

  // 0) optional faint endpoint backdrop: the full x_T + x_0 clouds drawn behind
  // the paths (the modes figure's right panel), so the selected trajectories
  // read against the same clusters shown solid on the left. Each group may opt
  // into a marker: x_T as dots, x_0 modes as × crosses.
  const backdrop = opts.backdrop || null;
  let backdropCount = 0;
  if (backdrop) {
    ctx.save();
    ctx.globalAlpha = opts.backdropAlpha || 0.12;
    ctx.lineWidth = 1.4;
    const bxr = 3.2;
    for (const grp of backdrop) {
      const asDot = grp.marker === "dot";
      ctx.strokeStyle = grp.color;
      ctx.fillStyle = grp.color;
      for (const [x, y] of grp.points) {
        const px = sx(x), py = sy(y);
        if (asDot) {
          ctx.beginPath();
          ctx.arc(px, py, 2.4, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          strokeCross(ctx, px, py, bxr);
        }
        backdropCount++;
      }
    }
    ctx.restore();
  }

  const ghost = frames[0] || [];
  const current = frames[index] || [];
  const n = current.length;
  // optional per-point colors (used by the modes figure to color each
  // trajectory by the mode it reaches); falls back to a single color.
  const colors = opts.colors || null;
  // single trajectory color (drives BOTH the trail line and the dots), so each
  // panel's trail matches its samples: forward purple, reverse green.
  const baseColor = opts.color || "#6d28d9";

  // 1) faint ghost of the original (t=0) shape (or the x_T noise starts).
  const ghostColor = opts.ghostColor || "rgba(109,40,217,0.18)";
  ctx.fillStyle = ghostColor;
  for (const [x, y] of ghost) {
    ctx.beginPath();
    ctx.arc(sx(x), sy(y), 1.6, 0, 2 * Math.PI);
    ctx.fill();
  }

  // 2) cumulative per-point trail through frames[0..index]. Optionally drawn
  // through Chaikin corner-cutting (opts.smooth) so a stochastic random-walk path
  // (the reverse/transport trajectories) reads as a clean curve. This is COSMETIC:
  // only the drawn polyline is smoothed; the dots below (actual x_t) and the data
  // are untouched, and the endpoints (x_T and current x_t) stay pinned.
  const showTrail = opts.trail !== false; // "show trajectories" toggle (default on)
  const doSmooth = !!opts.smooth;
  const iters = opts.smoothIterations || 3;
  // Cap the control points fed to Chaikin so the drawn vertex count stays bounded
  // (~maxCtrl x 2^iters) regardless of how many frames the trail spans — Chaikin
  // over all ~400 raw points would explode the polyline and stall the slider.
  const maxCtrl = opts.maxControlPoints || 256;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = colors ? 0.35 : 0.16;
  let trailSum = 0;
  let trailVertices = 0;
  let trailHead = 0;
  // Fixed control-point stride based on the FULL trajectory length (not the
  // current index), so the sampled raw frames {0, stride, 2*stride, ...} are the
  // same set at every slider position — the early smoothed curve stays put and
  // only the leading edge extends.
  const stride = doSmooth ? Math.max(1, Math.ceil((frames.length - 1) / (maxCtrl - 1))) : 1;
  for (let p = 0; showTrail && p < n; p++) {
    ctx.strokeStyle = colors ? colors[p] : baseColor;
    let pts = [];
    if (doSmooth) {
      for (let s = 0; s <= index; s += stride) pts.push(frames[s][p]);
      const tip = frames[index][p];
      if (pts.length === 0 || pts[pts.length - 1] !== tip) pts.push(tip); // current x_t
      pts = chaikinSmooth(pts, iters);
    } else {
      for (let s = 0; s <= index; s++) pts.push(frames[s][p]);
    }
    trailVertices = pts.length;
    // fingerprint the START of path 0's drawn polyline; it must NOT change as the
    // slider advances (the already-drawn early curve should stay put).
    if (p === 0) {
      const head = Math.min(8, pts.length);
      for (let h = 0; h < head; h++) trailHead += pts[h][0] * 1.000001 + pts[h][1];
    }
    ctx.beginPath();
    for (let j = 0; j < pts.length; j++) {
      const dx = pts[j][0], dy = pts[j][1];
      trailSum += dx * 1.000001 + dy;
      j ? ctx.lineTo(sx(dx), sy(dy)) : ctx.moveTo(sx(dx), sy(dy));
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 3) current x_t points solid on top. At the final step the paths have reached
  // x_0, so they're drawn as x crosses (matching the x_0 mode symbol) instead of
  // dots when opts.currentMarker === "cross".
  let checksum = 0;
  const r = opts.radius || 2;
  const asCross = opts.currentMarker === "cross";
  ctx.lineWidth = 1.8;
  for (let i = 0; i < n; i++) {
    const c = colors ? colors[i] : baseColor;
    const x = current[i][0], y = current[i][1];
    const px = sx(x), py = sy(y);
    if (asCross) {
      ctx.strokeStyle = c;
      strokeCross(ctx, px, py, r + 1.8);
    } else {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    }
    checksum += x * 1.000001 + y;
  }

  // 4) the SELECTED x_T starts solid (same opacity as the left panel), marking
  // where the traced paths begin while the rest of the cloud stays faint. They
  // use the x_T symbol — dots — when solidStartMarker === "dot".
  const solidStarts = opts.solidStarts || [];
  const ssMarker = opts.solidStartMarker || "cross";
  const ssColor = opts.solidStartColor || "#dc2626";
  ctx.strokeStyle = ssColor;
  ctx.fillStyle = ssColor;
  ctx.lineWidth = 1.8;
  const ssr = 3.8;
  for (const [x, y] of solidStarts) {
    const px = sx(x), py = sy(y);
    if (ssMarker === "dot") {
      ctx.beginPath();
      ctx.arc(px, py, ssr * 0.7, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      strokeCross(ctx, px, py, ssr);
    }
  }

  canvas.dataset.shape = opts.shape || "";
  canvas.dataset.pointCount = String(n);
  canvas.dataset.cloudSum = checksum.toFixed(4);
  canvas.dataset.trailSteps = String(index + 1);
  canvas.dataset.ghostCount = String(ghost.length);
  canvas.dataset.view = String(view);
  canvas.dataset.trailShown = String(showTrail);
  canvas.dataset.trailSmoothed = String(doSmooth);
  canvas.dataset.smoothMethod = doSmooth ? "chaikin" : "none";
  canvas.dataset.trailSum = trailSum.toFixed(3);
  canvas.dataset.trailVertices = String(trailVertices);
  canvas.dataset.trailHead = trailHead.toFixed(3);
  canvas.dataset.modeCount = String(colors ? new Set(colors).size : 1);
  canvas.dataset.ghostColor = ghostColor;
  canvas.dataset.trailColor = colors ? "multi" : baseColor;
  canvas.dataset.backdropCount = String(backdropCount);
  canvas.dataset.solidStartCount = String(solidStarts.length);
  canvas.dataset.solidStartMarker = ssMarker;
  canvas.dataset.currentMarker = asCross ? "cross" : "dot";
}

// Loss-convergence panel: the GLOBAL per-checkpoint training loss drawn as a
// step->loss curve, with a marker at the snapshot the slider currently selects.
// Unlike renderDensityCurve (a self-normalized density in a fixed data frame),
// this is an absolute-scale time series on a LOG y-axis, so the multi-order
// descent from the untrained model reads as convergence — hence its own
// renderer rather than a mode bolted onto the density curve. `losses`/`steps`
// are index-aligned (one entry per training snapshot); `index` is the slider
// position shared with the samples panel.
export function renderLossCurve(canvas, losses, steps, index, opts = {}) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const padL = 12, padR = 12, padT = 12, padB = 12; // uniform frame (no axis labels)
  ctx.clearRect(0, 0, W, H);

  const n = losses.length;
  const i = Math.max(0, Math.min(n - 1, index));
  // x: checkpoint index -> pixel (uniform across checkpoints, matching the slider)
  const xOf = (k) => padL + (n <= 1 ? 0 : (k / (n - 1)) * (W - padL - padR));
  // y: loss on a LOG scale (absolute, not self-normalized) so the early high loss
  // and the late low loss are both legible. lo/hi from the positive finite losses.
  const pos = losses.filter((v) => v > 0 && isFinite(v));
  const lo = pos.length ? Math.min(...pos) : 1;
  const hi = pos.length ? Math.max(...pos) : 1;
  const lhi = Math.log(hi), llo = Math.log(lo);
  const span = lhi - llo || 1; // guard a flat curve
  // high loss near the top (small y), low loss near the bottom (large y)
  const yOf = (v) => padT + ((lhi - Math.log(Math.max(v, lo))) / span) * (H - padT - padB);

  const curveColor = opts.color || "#6d28d9"; // page accent (matches density curve)
  const markColor = opts.markerColor || "#16a34a"; // ties to the green samples panel

  // axes: a faint L (left + bottom)
  ctx.strokeStyle = "rgba(120,120,120,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, H - padB); ctx.lineTo(W - padR, H - padB);
  ctx.stroke();

  // filled area under the curve, then the curve line on top
  ctx.beginPath();
  ctx.moveTo(xOf(0), H - padB);
  for (let k = 0; k < n; k++) ctx.lineTo(xOf(k), yOf(losses[k]));
  ctx.lineTo(xOf(n - 1), H - padB);
  ctx.closePath();
  ctx.fillStyle = opts.fill || "rgba(109,40,217,0.12)";
  ctx.fill();
  ctx.beginPath();
  for (let k = 0; k < n; k++) (k ? ctx.lineTo : ctx.moveTo).call(ctx, xOf(k), yOf(losses[k]));
  ctx.strokeStyle = curveColor; ctx.lineWidth = 1.5; ctx.stroke();

  // current-snapshot marker: a vertical guide + a filled dot at (i, loss[i])
  const mx = xOf(i), my = yOf(losses[i]);
  ctx.strokeStyle = "rgba(22,163,74,0.35)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(mx, padT); ctx.lineTo(mx, H - padB); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = markColor;
  ctx.beginPath(); ctx.arc(mx, my, 3.2, 0, 2 * Math.PI); ctx.fill();

  // render facts for the panel + tests
  let sum = 0;
  for (let k = 0; k < n; k++) sum += losses[k];
  canvas.dataset.lossCount = String(n);
  canvas.dataset.currentStep = String(steps[i]);
  canvas.dataset.currentLoss = String(losses[i]);
  canvas.dataset.curveSum = sum.toFixed(4);
  canvas.dataset.lossMin = lo.toFixed(6);
  canvas.dataset.lossMax = hi.toFixed(6);
}

// n draws from N(0,1), reproducibly. The page seeds its own PRNG rather than
// calling Math.random() so the figure — and the tests that read it — get the
// same histogram on every run.
//
// mulberry32: a 32-bit counter-based PRNG. Small, fast, and good enough for a
// picture of a bell curve (it is not cryptographic).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller: two uniforms in, one standard normal out. The transform also
// yields a second normal from sin(), but taking only cos() keeps the uniform
// budget at exactly 2 per draw — which is what makes the sequence prefix-stable
// (see standardNormalSamples).
function randn(rand) {
  let u = 0, v = 0;
  while (u === 0) u = rand(); // log(0) is -Infinity; redraw the (measure-zero) zero
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Draw n standard normals from `seed`. The sequence is PREFIX-STABLE: a longer
// run extends a shorter one, because the generator is restarted from the same
// seed and each draw consumes a fixed two uniforms. So growing n on the MSE
// page's slider APPENDS draws to the histogram instead of resampling it.
export function standardNormalSamples(n, seed) {
  const rand = mulberry32(seed);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = randn(rand);
  return out;
}

const HIST_VIEW = 4; // draw ε over [-4, 4]; N(0,1) puts ~6e-5 of its mass outside
const HIST_BINS = 160;
const HIST_YMAX = 0.52; // headroom above the N(0,1) peak (≈0.399)
const RUG_MAX = 400; // rug ticks drawn; more than this and the baseline is a smear
const HIST_INK = "#6d28d9"; // same accent the forward panel's density curve uses
const HIST_FILL = "rgba(109,40,217,0.18)";

// The standard normal density N(x; 0, 1).
function normalPdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Bin `samples` into DENSITY units — each bin holds count / (n · binWidth), so
// the bars integrate to 1 and live on the same vertical scale as normalPdf.
// With no draws yet the bins are zero (not 0/0), because N = 0 is a real state:
// the play animation starts there.
export function densityHistogram(samples, bins, view) {
  const binWidth = (2 * view) / bins;
  const counts = new Array(bins).fill(0);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s >= -view && s < view) counts[Math.floor((s + view) / binWidth)]++;
  }
  if (samples.length === 0) return counts;
  return counts.map((c) => c / (samples.length * binWidth));
}

// The MSE page's figure: the empirical distribution of N draws from N(0,1),
// against the density itself. Both are in density units, which is the whole
// point — the reader watches the bars settle ONTO the curve as N grows, so the
// average over draws reproduces the density weighting with no explicit weight.
//
// Exposes data-baseline so tests can tell the rug (below it) from the bars and
// the ghost (above it); the density claim itself is tested on densityHistogram.
export function renderSampleHistogram(canvas, samples) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const padX = 16, padTop = 14, padBottom = 26;
  const baseline = H - padBottom;
  const view = HIST_VIEW;
  const bins = HIST_BINS;
  const binWidth = (2 * view) / bins;
  const steps = 240;

  const dens = densityHistogram(samples, bins, view);

  // At tiny N a single draw can overshoot the N(0,1) peak (N=10 gives 2.0), so
  // grow the vertical scale to contain the tallest bar rather than clipping it.
  let peak = 0, bars = 0;
  for (let i = 0; i < bins; i++) {
    if (dens[i] > 0) bars++;
    if (dens[i] > peak) peak = dens[i];
  }
  const yMax = Math.max(HIST_YMAX, peak * 1.05);

  const xOf = (v) => padX + ((v + view) / (2 * view)) * (W - 2 * padX);
  const yOf = (v) => baseline - (v / yMax) * (baseline - padTop);

  const traceCurve = () => {
    for (let i = 0; i <= steps; i++) {
      const x = -view + (2 * view * i) / steps;
      ctx.lineTo(xOf(x), yOf(normalPdf(x)));
    }
  };

  ctx.clearRect(0, 0, W, H);

  // ghost underlay: the analytic density the draws are converging to
  ctx.beginPath();
  ctx.moveTo(xOf(-view), baseline);
  traceCurve();
  ctx.lineTo(xOf(view), baseline);
  ctx.closePath();
  ctx.fillStyle = "rgba(120,120,120,0.08)";
  ctx.fill();

  // live bars: one rect per bin, each keeping its own edges, rather than a
  // single unioned silhouette that hides the boundaries between adjacent bins
  ctx.beginPath();
  for (let i = 0; i < bins; i++) {
    if (dens[i] <= 0) continue; // an empty bin is not a bar
    const left = xOf(-view + i * binWidth);
    const right = xOf(-view + (i + 1) * binWidth);
    const y = yOf(dens[i]);
    ctx.rect(left, y, right - left, baseline - y);
  }
  ctx.fillStyle = HIST_FILL;
  ctx.fill();
  ctx.strokeStyle = HIST_INK;
  ctx.lineWidth = 1;
  ctx.stroke();

  // ghost outline, drawn ABOVE the bars: at large N the two shapes coincide, so
  // a buried dashed line would vanish exactly where the reader wants to compare
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(xOf(-view), yOf(normalPdf(-view)));
  traceCurve();
  ctx.strokeStyle = "rgba(120,120,120,0.45)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // rug: the individual draws, subsampled so the baseline stays readable
  const stride = Math.max(1, Math.ceil(samples.length / RUG_MAX));
  let rug = 0;
  ctx.strokeStyle = "rgba(109,40,217,0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < samples.length; i += stride) {
    const x = samples[i];
    if (x < -view || x > view) continue;
    ctx.moveTo(xOf(x), baseline + 4);
    ctx.lineTo(xOf(x), baseline + 12);
    rug++;
  }
  ctx.stroke();

  canvas.dataset.sampleCount = String(samples.length);
  canvas.dataset.barCount = String(bars);
  canvas.dataset.rugCount = String(rug);
  canvas.dataset.baseline = String(baseline);
  canvas.dataset.yMax = yMax.toFixed(4);
}
