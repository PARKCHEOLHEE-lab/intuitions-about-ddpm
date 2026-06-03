# Intuitions about Diffusion Models — interactive page

A **static** site that teaches diffusion models (DDPM) on the 2D **dino**
(datasaurus) toy dataset. The model is trained **offline in PyTorch**; an export
step precomputes every visualization frame to JSON, and the browser is a
**pure-JavaScript viewer** that fetches and replays them. There is no Python in
the browser (no Pyodide) and no server-side runtime — just static files.

## Architecture

```
ddpm/src/export_viz.py   (offline, torch)   →   docs/data/precomputed/*.json
                                             →   docs/data/source/*.py  (real torch source for the code panels)
docs/js/app.js           (browser, pure JS) →   fetches the above and renders with docs/js/plot.js
```

- **`docs/data/precomputed/`** — `meta.json` (dino template + schedule meta),
  `forward.json` (x_t frames), `training.json` (generated-sample snapshots),
  `reverse.json` (sampling trajectory + final x_0).
- **`docs/data/source/`** — `ddpm.py` and `train.py`, the real torch source
  shown verbatim in the code panels.
- **`docs/js/app.js`** — bootstrap viewer; **`docs/js/plot.js`** — shared
  `renderScatter` / `renderTrajectory` canvas renderers.

Only **dino** is precomputed, so the page renders dino only; the old
multi-shape switcher has been removed.

## The three modules

1. **Forward diffusion `q(x₀, t, ε)`** — scrub the slider to step through the
   precomputed forward frames and watch the data turn into noise. The slider
   index maps to the real timestep `t`. The torch `q()` source is shown.
2. **Training** — step through the K=5 precomputed sample snapshots (samples
   generated after increasing numbers of optimizer steps). The torch training
   source is shown.
3. **Reverse sampling `x_T → … → x₀`** — the two-panel reference figure (final
   x₀ cluster + per-point trajectories), replayed from `reverse.json`. The
   torch `p()` source is shown.

## Regenerate the precomputed data

```bash
./.venv/bin/python ddpm/src/export_viz.py
```

This retrains/exports and overwrites the files under `docs/data/`.

## Run locally

```bash
# serve the static site (no backend — files only)
python3 -m http.server 5173 --directory docs   # then open http://127.0.0.1:5173/
# or, from the repo root:
npm run serve
```

## Tests

```bash
# real-browser end-to-end (Chromium via a static http.server host)
npx playwright test

# Python: the offline export pipeline
./.venv/bin/python -m pytest tests/ -q
```

## Deploy

`../.github/workflows/pages.yml` publishes this `docs/` directory to GitHub
Pages. The site is fully client-side and static — no build step, no server-side
runtime — so the page is served as files and all rendering happens in the
browser from the precomputed JSON.
