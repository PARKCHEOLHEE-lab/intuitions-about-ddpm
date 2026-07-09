# Intuitions about DDPM — interactive page

A **static** site that teaches diffusion models (DDPM) on the 2D
**Datasaurus** toy shapes. The model is trained **offline in PyTorch**; an
export step precomputes every visualization frame to JSON, and the browser is a
**pure-JavaScript viewer** that fetches and replays them. There is no Python in
the browser (no Pyodide) and no server-side runtime — just static files.

## Architecture

```
ddpm/src/export_viz.py  (offline, torch)  →  docs/data/precomputed/
    ├─ meta.json               shape list + shared view + per-shape x0 + ᾱ_t schedule
    ├─ modes.json              intro "Sampling trajectories" figure (Gaussian-mode toy)
    ├─ forward_<shape>.json    forward x_t frames, per shape
    ├─ training_<shape>.json   generated-sample snapshots, per shape
    └─ reverse_<shape>.json    reverse trajectory + final x0, per shape

docs/js/app.js  (browser, pure JS)  →  fetches the above, renders via docs/js/plot.js
```

`export_viz.py`'s `__main__` runs two steps into `docs/data/precomputed/`:
`export_all_shapes()` (per-shape `forward_/training_/reverse_<shape>.json` plus a
single `meta.json`) and `export_modes_figure()` (`modes.json`).

- **`docs/data/precomputed/`**
  - `meta.json` — shape order, the shared view/scale, each shape's clean `x0`
    scatter, and the cumulative `alphas_bar` (ᾱ_t) schedule the JS reads.
  - `modes.json` — the intro figure: a tiny DDPM on a few 2D Gaussian modes,
    with endpoint clouds + per-trajectory coloring.
  - `forward_<shape>.json` / `training_<shape>.json` / `reverse_<shape>.json` —
    one set per Datasaurus shape (lazy-loaded when the shape selector changes).
- **`docs/js/app.js`** — bootstrap viewer for `index.html` (fetch + wire
  sliders/play/toggles). Runs `boot()` at import time.
- **`docs/js/controls.js`** — the shared figure transport (`trackFill`,
  `attachPlay`): a play/pause button driving a range slider. Kept out of
  `app.js` so a second page can wire a play button without dragging the index
  bootstrap along with it.
- **`docs/js/plot.js`** — shared canvas renderers (`renderScatter`,
  `renderForwardFrame`, `renderEndpoints`, `renderDensityCurve`,
  `renderLossCurve`, `renderSampleHistogram`) plus the pure helpers they build
  on (`chaikinSmooth`, `diffusedMarginal1d`, `densityHistogram`,
  `standardNormalSamples`).
- **`docs/js/mse.js`** — bootstrap for `mse.html` (below).
- **`docs/js/math.js`** — renders the inline/display math via vendored KaTeX.

## The second page: `mse.html`

`docs/mse.html` — *The Expectation Behind the MSE* — hangs off the word "MSE" in
the training section of `index.html`. It answers a question the main page raises
and never settles: the loss is written as an expectation $\mathbb{E}[\cdot]$, a
*weighted* average, but training averages a minibatch uniformly. Where did the
weights go? (In the sampling: a weight becomes the frequency of a draw.) It also
records the one weight that is genuinely dropped — the ELBO's per-timestep
$\lambda_t$, which `L_simple` discards on purpose.

It is a plain sibling file, not a route: the Pages workflow publishes all of
`docs/`, so `/mse.html` is served with no extra configuration. It shares
`css/style.css`, the vendored KaTeX, `js/math.js`, and the transport in
`js/controls.js` with the index page.

**One architectural exception.** Its figure is the only thing in `docs/` that
computes rather than replays: it draws N samples from $\mathcal{N}(0,1)$ in the
browser (`standardNormalSamples`) instead of loading precomputed JSON. Sampling
*is* the subject of the page, there is no model output to precompute, and 50,000
draws would be an absurd thing to ship as a JSON file. The draws are **seeded**
(mulberry32 + Box–Muller), so the figure is deterministic: every reload and
every CI run paints the same histogram.

One **conditional** model is trained over **all** Datasaurus shapes, so the
shape selector near the top switches every panel between shapes (the page loads
**dino** first); the data per shape is lazy-loaded on demand.

## The page

Top to bottom:

1. **What is a diffusion model?** — prose framing (forward noising + learned
   reverse).
2. **What does "diffusion" mean?** — the physical-spreading intuition (Gaussian
   random walk), prose only.
3. **Sampling trajectories: noise → data** — the intro figure (`modes.json`):
   a few Gaussian modes, with each reverse-sampling trajectory carried from
   noise into one mode. Endpoints panel + trajectories panel.
4. **Forward diffusion** — scrub the timestep `t` to watch a shape dissolve into
   noise. Three canvases: static `x0`, the per-point `x_t` trajectory, and the
   analytic marginal `q(x_t)`.
5. **Training the denoiser** — step through generated-sample snapshots. Snapshots
   are recorded **densely** (every optimizer step up to step 300, where the
   shape forms fastest) and coarsely afterward.
6. **Reverse sampling** — three canvases: generated `x0`, the reverse
   trajectories (noise → data), and the marginal `q(x_t)` gathering back into the
   multimodal data.

The word "MSE" in section 5 links out to `mse.html`.

## Model / schedule

The exported model uses **T = 400** timesteps and a **cosine** ᾱ_t schedule
(Nichol & Dhariwal), sampled from **EMA-averaged** weights for cleaner output.
See the `cfg` in `ddpm/src/export_viz.py` for the full hyperparameters. (Note:
`ddpm/src/train.py` exposes only the config-agnostic `Trainer` class — the viz
data is produced by `export_viz.py`'s own training loop and config, not by
`train.py`.)

## Regenerate the precomputed data

```bash
./.venv/bin/python ddpm/src/export_viz.py
```

This retrains and overwrites the files under `docs/data/precomputed/`.

## Run locally

```bash
npm run serve                                  # python http.server on :5173 over docs/
# or directly:
python3 -m http.server 5173 --directory docs   # then open http://127.0.0.1:5173/
```

## Tests

```bash
# real-browser end-to-end (Chromium via a static http.server host)
npx playwright test            # (or: npm test)

# Python: the offline export pipeline + model/scheduler
./.venv/bin/python -m pytest tests/ -q
```

## Deploy

`../.github/workflows/pages.yml` publishes this `docs/` directory to GitHub
Pages. The site is fully client-side and static — no build step, no server-side
runtime — so the page is served as files and all rendering happens in the
browser from the precomputed JSON.
