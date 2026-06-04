// Minimal 2D scatter renderer on a <canvas>, reused by every module.
// Points are expected in roughly the unit range (max-norm normalized).

const VIEW = 1.15; // half-extent of the plotted region (a little past the unit circle)

function mapper(size, pad, view = VIEW) {
  // map data coord in [-view, view] to pixel in [pad, size-pad]
  return (v) => pad + ((v + view) / (2 * view)) * (size - 2 * pad);
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
    const g = diffusedMarginal1d(x0, axis, opts.ghostAbar, view);
    traceFill(g, "rgba(120,120,120,0.08)");
    traceLine(g, "rgba(120,120,120,0.45)", 1, [4, 3]); // dashed = the original shape
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
  const sx = mapper(W, pad, view);
  const syRaw = mapper(H, pad, view);
  const sy = (v) => H - syRaw(v); // flip y so +y points up

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
  const mx = mapper(W, pad, view);
  const myRaw = mapper(H, pad, view);
  const sx = (v) => mx(v - cx);
  const sy = (v) => H - myRaw(v - cy);
  const cross = (px, py, r) => {
    ctx.beginPath();
    ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r);
    ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r);
    ctx.stroke();
  };

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
    cross(sx(ends[i][0]), sy(ends[i][1]), 3.5);
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
  const [cx, cy] = opts.center || [0, 0]; // optional offset to frame shifted content
  const sxm = mapper(W, pad, view);
  const sym = mapper(H, pad, view);
  const sx = (v) => sxm(v - cx);
  const sy = (v) => H - sym(v - cy); // flip y so +y points up

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
        ctx.beginPath();
        if (asDot) {
          ctx.arc(px, py, 2.4, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.moveTo(px - bxr, py - bxr); ctx.lineTo(px + bxr, py + bxr);
          ctx.moveTo(px + bxr, py - bxr); ctx.lineTo(px - bxr, py + bxr);
          ctx.stroke();
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
      ctx.beginPath();
      ctx.moveTo(px - r - 1.8, py - r - 1.8); ctx.lineTo(px + r + 1.8, py + r + 1.8);
      ctx.moveTo(px + r + 1.8, py - r - 1.8); ctx.lineTo(px - r - 1.8, py + r + 1.8);
      ctx.stroke();
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
    ctx.beginPath();
    if (ssMarker === "dot") {
      ctx.arc(px, py, ssr * 0.7, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.moveTo(px - ssr, py - ssr); ctx.lineTo(px + ssr, py + ssr);
      ctx.moveTo(px + ssr, py - ssr); ctx.lineTo(px - ssr, py + ssr);
      ctx.stroke();
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
