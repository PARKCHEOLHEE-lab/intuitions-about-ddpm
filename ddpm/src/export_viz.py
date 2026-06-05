"""Export precomputed DDPM visualization data for the static browser viewer.

This module REUSES the root torch implementation:
  - ``DDPM`` and ``BetaScheduler`` from ``ddpm/src/ddpm.py``
  - ``Datasaurus`` from ``ddpm/src/dataset.py``

It trains the "dino" datasaurus shape on CPU and writes four precomputed JSON
files under ``docs/data/precomputed/`` consumed by the JS viewers. It does NOT
reimplement the model / scheduler / dataset and does NOT use the numpy port in
``docs/py/``.

The root modules use bare imports (``from ddpm import ...``,
``from dataset import ...``), so ``ddpm/src`` is added to ``sys.path`` here.
"""

import json
import os
import sys

import torch

_SRC_DIR = os.path.dirname(os.path.abspath(__file__))
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from dataset import Datasaurus  # noqa: E402
from ddpm import DDPM, BetaScheduler  # noqa: E402

NUM_POINTS_VIZ = 200  # rendered point count per shape (densified from the ~142-pt template)

#: occupancy-grid resolution for the IoU shape metric (used by tuning + tests)
IOU_GRID = 22


def occupancy_iou(data, gen, grid: int = IOU_GRID) -> float:
    """IoU of two point sets over a ``grid``x``grid`` lattice fit to ``data``'s bbox.

    A cell is "occupied" if any point falls in it. ``data`` and ``gen`` are
    array-likes of shape ``(N, 2)`` / ``(M, 2)``. The grid is fit to the bbox of
    ``data`` (the dino template); ``gen`` points are bucketed in the same frame
    (clamped into range). Returns ``|occ(data) ∩ occ(gen)| / |occ(data) ∪ occ(gen)|``.
    """

    import numpy as np

    data = np.asarray(data, dtype=float)
    gen = np.asarray(gen, dtype=float)

    lo = data.min(axis=0)
    hi = data.max(axis=0)
    span = hi - lo
    span[span == 0] = 1.0

    def _occ(pts):
        idx = np.floor((pts - lo) / span * grid).astype(int)
        idx = np.clip(idx, 0, grid - 1)
        return set(map(tuple, idx))

    occ_data = _occ(data)
    occ_gen = _occ(gen)
    union = occ_data | occ_gen
    if not union:
        return 0.0
    return len(occ_data & occ_gen) / len(union)


def chamfer_distance(data, gen) -> float:
    """Symmetric chamfer distance between two 2D point sets (lower = closer).

        mean_{g in gen} min_{d in data} ||g - d||   (precision: points off the shape)
      + mean_{d in data} min_{g in gen} ||d - g||   (recall: shape regions left bare)

    Unlike a one-directional nearest-neighbour mean, summing both directions
    penalizes a diffuse blob AND a partially-covered shape — neither can score
    low. Grid-free, continuous, bounded below by 0 (identical sets → 0).
    """
    import numpy as np

    data = np.asarray(data, dtype=float)
    gen = np.asarray(gen, dtype=float)
    d2 = ((gen[:, None, :] - data[None, :, :]) ** 2).sum(axis=-1)
    precision = np.sqrt(d2.min(axis=1)).mean()  # each gen point → nearest data point
    recall = np.sqrt(d2.min(axis=0)).mean()  # each data point → nearest gen point
    return float(precision + recall)


def _seed_everything(seed: int) -> None:
    import random

    random.seed(seed)
    torch.manual_seed(seed)


def _dino_template(csv_path: str, device: str) -> torch.Tensor:
    """Return the clean, max-norm-normalized dino template (NO jitter).

    Uses the exact same normalization Datasaurus applies: divide the (x, y) of
    the dino rows by the maximum row-norm over those rows.
    """

    import pandas as pd

    df = pd.read_csv(csv_path)
    df = df[df["dataset"] == "dino"]
    xy = torch.vstack(
        [
            torch.tensor(df.x.tolist(), dtype=torch.float32),
            torch.tensor(df.y.tolist(), dtype=torch.float32),
        ]
    ).T
    xy = xy / xy.norm(dim=1).max()
    return xy.to(device)


def _viz_dino_points(csv_path, n, mu, sd, device, jitter_scale, seed):
    """Return ``n`` standardized dino points for the viewer (forward x0 + ghost).

    The clean template only has 142 points; rendering a denser dino needs more
    distinct points ON the dino shape. Rather than write a new sampler, reuse
    Datasaurus' existing repeat+jitter sampling to densify the template to ``n``
    points, then standardize with the SAME mu/sd the model was trained under so
    the viewer's data/forward/reverse all live in one coordinate space.
    """

    _seed_everything(seed)
    ds = Datasaurus(
        path=csv_path,
        num_points=n,
        device=device,
        labels_to_use=["dino"],
        jitter_scale=jitter_scale,
    )
    xy = ds.xylabels[:, :2].to(device)  # (n, 2) in the same max-norm space
    return (xy - mu) / sd


def _round_points(points, nd=3):
    """Round (x, y) coords to ``nd`` decimals to keep the JSON small.

    On the standardized data (range ~±3.3) rendered to a 420px canvas, 3
    decimals is ~0.06px — sub-pixel, so this is lossless to the eye but shrinks
    the float JSON ~3x (full repr ~18 chars/coord -> ~6)."""
    return [[round(float(x), nd), round(float(y), nd)] for x, y in points]


# Mode palette for the intro "trajectory transport" figure (purple/orange/green/gray).
MODE_COLORS = ["#6d28d9", "#f59e0b", "#16a34a", "#6b7280"]


def _gaussian_modes(num_modes, points_per_mode, device, seed, radius=2.6, std=0.3):
    """A few 2D Gaussian blobs placed on an ARC offset from the origin.

    The data modes (x_0) sit in the upper-right; the noise prior x_T ~ N(0, I)
    lives at the origin (lower-left of the arc). Keeping them on one side — not
    a ring around the origin — separates x_T from x_0 so the reverse-sampling
    trajectories fan cleanly from the noise corner out to each mode.

    Returns ``(data, centers)``: ``data`` is ``(N, 3)`` rows of ``(x, y, 0)``
    (the training-loop format); ``centers`` is ``(num_modes, 2)``. RAW coords.
    """
    import math

    _seed_everything(seed)
    # spread the modes over a ~90deg arc in the upper-right quadrant
    a0, a1 = math.radians(12), math.radians(96)
    angles = [a0 + (a1 - a0) * k / (num_modes - 1) for k in range(num_modes)]
    centers = torch.tensor(
        [[radius * math.cos(a), radius * math.sin(a)] for a in angles],
        dtype=torch.float32,
    )
    blobs = [centers[k] + std * torch.randn(points_per_mode, 2) for k in range(num_modes)]
    xy = torch.vstack(blobs)
    data = torch.hstack([xy, torch.zeros(xy.shape[0], 1)]).to(device)  # (N, 3)
    return data, centers.to(device)


def record_forward_trajectory(scheduler, x0, T, seed):
    """Step-by-step forward Markov chain, recording x_t for t = 0..T-1.

    Uses the ORIGINAL forward process with FRESH noise at every step —
        x_t = sqrt(alpha_t) * x_{t-1} + sqrt(1 - alpha_t) * z,   z ~ N(0, I)
    — instead of the fixed-eps closed form ``x_t = sqrt(abar_t) x0 + ...``. The
    per-step marginal is identical, but the trajectory is a NOISY random walk
    (like reverse sampling) rather than a smooth deterministic arc. ``frames[0]``
    is the clean x0.
    """

    _seed_everything(seed)
    x = x0.clone()
    frames = [_round_points(x.detach().cpu().tolist())]  # t=0: the clean data
    for t in range(1, T):
        alpha_t = scheduler.alphas[t]  # per-step alpha_t = 1 - beta_t
        z = torch.randn_like(x)  # fresh noise every step -> stochastic walk
        x = torch.sqrt(alpha_t) * x + torch.sqrt(1 - alpha_t) * z
        frames.append(_round_points(x.detach().cpu().tolist()))
    return frames


def _label_emb(model, n: int, device: str, label_idx: int = 0) -> torch.Tensor:
    # conditioning embedding for `label_idx` (0 = the first/only label, e.g. dino)
    idx = torch.full((n,), int(label_idx), dtype=torch.long, device=device)
    return model.label_embeddings(idx)


def record_reverse_trajectory(model, scheduler, n, T, record_every, device, seed, clip_x0=None, x0=None, label_idx=0):
    """One ancestral sampling run from x_T ~ N(0,1) down to x_0.

    Reuses ``model.p`` (the DDPM posterior mean) for the deterministic part of
    each step, then adds the ancestral noise:
        eps  = model.forward(x, t_vec, label_emb)
        mean = model.p(x, t, eps)          # posterior mean mu_t
        x    = mean + sqrt(beta_t)*z  (z~N(0,1)) if t>0 else mean
    where ``beta_t = 1 - scheduler.alphas[t]``.

    Operates in standardized coordinate space (the space the model was trained
    in). When ``clip_x0=(lo, hi)`` is given it is forwarded to ``model.p`` to
    clamp the predicted x0 each step (clip_denoised), keeping sampling bounded.
    Records every ``record_every`` steps (oldest -> newest) and always records
    the final x_0. Returns ``(final, trajectory, timesteps)`` where ``timesteps``
    is the diffusion timestep t of each recorded frame (descending T-1 -> 0).
    """

    _seed_everything(seed)
    model.eval()

    label_emb = _label_emb(model, n, device, label_idx)

    # Optional fixed start: begin every run at x0 (broadcast to n rows) instead of
    # fresh noise, so the SAME x_T can be sampled multiple times. The seed still
    # drives the ancestral z draws, so different seeds give different paths.
    if x0 is not None:
        x = torch.as_tensor(x0, dtype=torch.float32, device=device).expand(n, 2).contiguous()
    else:
        x = torch.randn(n, 2, device=device)
    trajectory = []
    timesteps = []  # the diffusion timestep t for each recorded frame (T-1 -> 0)
    with torch.no_grad():
        for step, t in enumerate(reversed(range(T))):
            # Record the sample ENTERING timestep t as x_t (BEFORE stepping), so the
            # frame labeled t holds x_t — matching the forward viewer's convention.
            # The noisiest frame (t=T-1) is then the pure x_T noise itself, not a
            # state already advanced one step. t=0's clean x_0 is appended afterward.
            if t > 0 and step % record_every == 0:
                trajectory.append(_round_points(x.detach().cpu().tolist()))
                timesteps.append(t)

            t_vec = torch.full((n, 1), float(t), device=device)
            eps = model.forward(x, t_vec, label_emb)

            beta_t = 1 - scheduler.alphas[t]
            mean = model.p(x, t, eps, clip_x0=clip_x0)

            if t > 0:
                z = torch.randn(n, 2, device=device)
                x = mean + torch.sqrt(beta_t) * z
            else:
                x = mean

        # x is now the fully-denoised x_0; record it as the final t=0 frame.
        trajectory.append(_round_points(x.detach().cpu().tolist()))
        timesteps.append(0)

    final = _round_points(x.detach().cpu().tolist())
    model.train()
    return final, trajectory, timesteps


def _ema_update(ema: dict, model, decay: float) -> None:
    """In-place EMA: ema <- decay*ema + (1-decay)*param for float tensors (and a
    straight copy for non-float buffers). ``ema`` mirrors ``model.state_dict()``."""
    with torch.no_grad():
        for k, v in model.state_dict().items():
            if torch.is_floating_point(v):
                ema[k].mul_(decay).add_(v.detach(), alpha=1 - decay)
            else:
                ema[k].copy_(v)


def train_with_snapshots(model, dataset, scheduler, config, mu, sd, clip_x0=None, label_indices=None):
    """Train the model, capturing K ancestral-sampled snapshots during training.

    INLINE training loop (not the root ``Trainer``) — see module/report notes.
    The root ``Trainer`` hardcodes ``size=(batch_size, 1)`` when sampling ``t``,
    which mismatches the final partial batch, and its ``visualize_interval`` hook
    is epoch-based; we need exactly K snapshots at controlled optimizer-step
    counts captured via the reverse sampler. This loop reuses model / scheduler /
    dataset and only the snapshot scheduling is new.

    ``label_indices`` controls per-shape snapshotting:
      - ``None`` (default): sample ONLY label 0 at each checkpoint and return
        ``snapshots`` as a flat ``list`` (one entry per checkpoint). This is the
        exact original behavior — existing single-shape callers are unaffected.
      - a list of label indices: sample EACH label at each checkpoint (respecting
        the EMA weight swap) and return ``snapshots`` as a ``dict``
        ``{label_idx: [snapshot_per_checkpoint, ...]}``. ``steps`` is shared.
    """

    from torch.utils.data import DataLoader

    device = config["device"]
    k_snapshots = config["k_snapshots"]
    record_every = config["reverse_record_every"]
    seed = config["seed"]
    T = config["num_timesteps"]

    optimizer = torch.optim.AdamW(params=model.parameters(), lr=config["learning_rate"])
    dataloader = DataLoader(dataset, batch_size=config["batch_size"], shuffle=True)

    # Optional EMA of the weights (Nichol & Dhariwal): sampling from the averaged
    # weights gives noticeably cleaner samples than the last raw step. Enabled when
    # config["ema_decay"] is set; otherwise sampling uses the raw weights as before.
    ema_decay = config.get("ema_decay")
    ema = {k: v.detach().clone() for k, v in model.state_dict().items()} if ema_decay else None

    def _sample_one(label_idx):
        final, _, _ = record_reverse_trajectory(
            model, scheduler, NUM_POINTS_VIZ, T, record_every, device, seed,
            clip_x0=clip_x0, label_idx=label_idx,
        )
        return final

    def _sample():
        # ancestral sample(s) for a snapshot, from EMA weights if enabled. With
        # label_indices set, sample EACH label (under one EMA swap) and return a
        # dict {label_idx: final}; otherwise sample only label 0 and return the
        # flat list entry (original behavior).
        def _draw():
            if label_indices is None:
                return _sample_one(0)
            return {k: _sample_one(k) for k in label_indices}

        if ema is None:
            return _draw()
        backup = {k: v.detach().clone() for k, v in model.state_dict().items()}
        model.load_state_dict(ema)
        out = _draw()
        model.load_state_dict(backup)
        return out

    steps_per_epoch = len(dataloader)
    total_steps = steps_per_epoch * config["epoch"]
    # Cosine LR decay sharpens the final minimum. Plain constant-LR training
    # plateaus around IoU~0.25 no matter how many epochs are added; annealing
    # the LR to ~0 over training breaks that plateau and yields a crisp dino
    # (IoU~0.34). Enabled when lr_decay is truthy (default on for the real run).
    lr_scheduler = None
    if config.get("lr_decay", True):
        lr_scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=max(total_steps, 1)
        )
    # Snapshot checkpoints in optimizer-step count, always starting at step 0
    # (the UNTRAINED model) and ending at the final trained state.
    coarse_every = config.get("snapshot_coarse_every")
    if coarse_every:
        # The model changes fastest in the first few steps, so sample DENSELY
        # (every step up to snapshot_dense_until) there and COARSELY afterwards.
        dense_until = min(config.get("snapshot_dense_until", 0), total_steps)
        steps_set = set(range(0, dense_until + 1))  # 1-step dense region
        steps_set |= set(range(0, total_steps + 1, coarse_every))  # coarse elsewhere
        steps_set.add(total_steps)
        snapshot_steps = sorted(s for s in steps_set if s <= total_steps)
    elif k_snapshots == 1:
        snapshot_steps = [total_steps]
    else:
        # legacy: K snapshots evenly spaced across [0, total_steps]
        snapshot_steps = sorted(
            {round(total_steps * i / (k_snapshots - 1)) for i in range(k_snapshots)}
        )
        while len(snapshot_steps) < k_snapshots:  # pad if dedup collapsed (tiny runs)
            snapshot_steps.append(snapshot_steps[-1] + 1)

    steps = []
    # flat list (label_indices None) or dict {label_idx: [per-checkpoint]}
    snapshots = [] if label_indices is None else {k: [] for k in label_indices}
    global_step = 0
    pending = list(snapshot_steps)

    def _record_snapshot():
        out = _sample()
        if label_indices is None:
            snapshots.append(out)
        else:
            for k in label_indices:
                snapshots[k].append(out[k])

    # capture the step-0 (untrained) snapshot BEFORE any optimizer step, so it
    # reflects the randomly-initialized model rather than the post-first-batch one
    if pending and pending[0] == 0:
        pending.pop(0)
        steps.append(0)
        _record_snapshot()

    model.train()
    for _ in range(config["epoch"]):
        for batch in dataloader:
            # standardize coordinates into the zero-mean/unit-var space the
            # DDPM forward process targets (Datasaurus itself stays untouched).
            coordinates = (batch[:, :2] - mu) / sd
            labels = batch[:, 2].long()
            bsz = coordinates.shape[0]

            t = torch.randint(0, T, size=(bsz, 1), device=device)
            noise = torch.randn_like(coordinates)
            # forward diffusion (reuse model.q) — feed the NOISED x_t to the
            # denoiser so it learns to predict the added noise.
            x_t = model.q(x_0=coordinates, t=t, noise=noise)

            noise_predicted = model(
                coordinates=x_t,
                t=t.float(),
                label_embeddings=model.label_embeddings(labels),
            )
            loss = torch.nn.functional.mse_loss(
                noise_predicted, noise
            )
            loss.backward()
            optimizer.step()
            optimizer.zero_grad()
            if lr_scheduler is not None:
                lr_scheduler.step()
            global_step += 1
            if ema is not None:
                _ema_update(ema, model, ema_decay)

            if pending and global_step >= pending[0]:
                target = pending.pop(0)
                steps.append(target)
                _record_snapshot()

    # capture any remaining checkpoints (e.g. when total_steps rounding overshot)
    while pending:
        target = pending.pop(0)
        steps.append(target)
        _record_snapshot()

    # bake EMA weights into the returned model so downstream sampling (reverse.json)
    # also benefits from the averaged weights.
    if ema is not None:
        model.load_state_dict(ema)

    return model, steps, snapshots


def _base_model_config(config: dict, seed: int) -> dict:
    """The model_config keys shared by every export entry point (consumed by
    ``BetaScheduler`` / ``DDPM`` / ``train_with_snapshots``). Callers add the keys
    that legitimately differ per export — ``cosine_s``, ``ema_decay``, the
    ``snapshot_*`` / ``k_snapshots`` capture settings, and ``reverse_record_every``
    — so the long common block lives in one place instead of three near-identical
    copies that drift apart key by key."""
    return {
        "device": config.get("device", "cpu"),
        "num_timesteps": config["num_timesteps"],
        "beta_start": config["beta_start"],
        "beta_end": config["beta_end"],
        "beta_schedule_type": config.get("beta_schedule_type", "linear"),
        "label_embedding_dim": config["label_embedding_dim"],
        "coordinate_embedding_dim": config["coordinate_embedding_dim"],
        "coordinate_encoder_type": config["coordinate_encoder_type"],
        "coordinate_encoder_scale": config.get("coordinate_encoder_scale", 25.0),
        "time_embedding_dim": config["time_embedding_dim"],
        "time_encoder_type": config["time_encoder_type"],
        "num_denoiser_hidden_layers": config["num_denoiser_hidden_layers"],
        "denoiser_hidden_dim": config["denoiser_hidden_dim"],
        "denoiser_residual": config.get("denoiser_residual", True),
        "denoiser_output_dim": config.get("denoiser_output_dim", 2),
        "denoiser_activation": config["denoiser_activation"],
        "epoch": config["epoch"],
        "batch_size": config["batch_size"],
        "learning_rate": config["learning_rate"],
        "lr_decay": config.get("lr_decay", True),
        "seed": seed,
    }


def export_visualization(out_dir: str, config: dict) -> dict:
    """Train + record + write the 4 precomputed JSON files; return them too."""

    device = config.get("device", "cpu")
    csv_path = config["csv_path"]
    T = config["num_timesteps"]
    seed = config.get("seed", 0)

    os.makedirs(out_dir, exist_ok=True)
    _seed_everything(seed)

    # --- scheduler config consumed by root BetaScheduler / DDPM ---
    model_config = _base_model_config(config, seed)
    model_config.update({
        # capture settings carried for train_with_snapshots
        "k_snapshots": config["k_snapshots"],
        "snapshot_dense_until": config.get("snapshot_dense_until", 0),
        "snapshot_coarse_every": config.get("snapshot_coarse_every"),
        "reverse_record_every": config["reverse_record_every"],
    })

    dataset = Datasaurus(
        path=csv_path,
        num_points=config["num_points"],
        device=device,
        labels_to_use=["dino"],
        jitter_scale=config.get("jitter_scale", 1.0),
    )

    scheduler = BetaScheduler(configs=model_config)
    model = DDPM(configs=model_config, labels=dataset.labels, beta_scheduler=scheduler)

    # --- clean dino template (defines the mu/sd standardization space) ---
    raw_template = _dino_template(csv_path, device)  # (142, 2), max-norm space

    # Standardization at the export boundary: everything the model sees or
    # produces lives in zero-mean/unit-var space. mu/sd are per-dim, computed
    # from the clean dino template (matches the model's training standardization).
    mu = raw_template.mean(dim=0)
    sd = raw_template.std(dim=0)

    # The rendered dino (meta "data" / ghost + forward x0) is densified to
    # NUM_POINTS_VIZ distinct points via Datasaurus jitter, in the same space.
    viz_points = _viz_dino_points(
        csv_path, NUM_POINTS_VIZ, mu, sd, device, config.get("jitter_scale", 1.0), seed
    )

    # clip_denoised range: clamp the predicted x0 to the (standardized) data
    # extent + 10% margin during ancestral sampling. Keeps even the untrained
    # model's reverse sample bounded instead of diverging to ~±40.
    clip_val = float(viz_points.abs().max()) * 1.1
    clip_x0 = (-clip_val, clip_val)

    # --- meta.json ---
    meta = {
        "label": config.get("label", "dino"),
        "num_timesteps": T,
        "num_points_viz": NUM_POINTS_VIZ,
        "beta_start": config["beta_start"],
        "beta_end": config["beta_end"],
        "k_snapshots": config["k_snapshots"],
        "mu": mu.detach().cpu().tolist(),
        "sd": sd.detach().cpu().tolist(),
        # one common half-extent for ALL viewer panels so the same dino renders
        # at the same size everywhere. == clip range, so bounded reverse/training
        # samples fit; the dino (~±2.6) fills ~90% and forward's t=T noise tail
        # spills slightly off the edges (its spread is still clearly visible).
        "view": clip_val,
        "data": _round_points(viz_points.detach().cpu().tolist()),
    }

    # --- forward.json: step-by-step Markov chain (fresh noise each step), one
    # frame per timestep t = 0..T-1, so the trajectory is a noisy walk ---
    forward_frames = record_forward_trajectory(scheduler, viz_points, T, seed)
    forward = {"ts": list(range(T)), "frames": forward_frames}

    # --- training.json: K snapshots captured during training ---
    model, steps, snapshots = train_with_snapshots(
        model, dataset, scheduler, model_config, mu, sd, clip_x0=clip_x0
    )
    training = {"steps": steps, "snapshots": snapshots}

    # --- reverse.json: one ancestral run recording every record_every steps ---
    record_every = config["reverse_record_every"]
    final, trajectory, rev_timesteps = record_reverse_trajectory(
        model, scheduler, NUM_POINTS_VIZ, T, record_every, device, seed, clip_x0=clip_x0
    )
    reverse = {
        # diffusion timestep t per recorded frame (T-1 noise -> 0 dino), so the
        # viewer scrubs by t like the forward viewer (not an opaque frame index)
        "timesteps": rev_timesteps,
        "trajectory": trajectory,
        "final": final,
    }

    result = {
        "meta": meta,
        "forward": forward,
        "training": training,
        "reverse": reverse,
    }
    for name, obj in result.items():
        with open(os.path.join(out_dir, f"{name}.json"), "w") as f:
            json.dump(obj, f)

    return result


def export_all_shapes(out_dir: str, config: dict) -> dict:
    """Train ONE conditional model on ALL selected Datasaurus shapes and export
    per-shape visualization data into ``out_dir``.

    Mirrors ``export_visualization`` (model_config, scheduler, mu/sd standardization,
    NUM_POINTS_VIZ densification, clip_denoised, _round_points) but:
      - trains a single model conditioned on every shape (one shared coordinate
        space via global mu/sd over all shapes),
      - captures per-shape training snapshots in one pass via the extended
        ``train_with_snapshots(..., label_indices=...)``,
      - writes ``forward_<shape>.json`` / ``reverse_<shape>.json`` /
        ``training_<shape>.json`` per shape plus a single ``meta.json``.

    Returns ``{"meta": ..., "forward": {...}, "reverse": {...}, "training": {...}}``
    keyed by shape for the file dicts.
    """

    device = config.get("device", "cpu")
    csv_path = config["csv_path"]
    T = config["num_timesteps"]
    seed = config.get("seed", 0)
    jitter_scale = config.get("jitter_scale", 1.0)
    record_every = config["reverse_record_every"]
    shapes = config.get("shapes")  # None == all mapped shapes

    os.makedirs(out_dir, exist_ok=True)
    _seed_everything(seed)

    # --- training dataset over ALL selected shapes; labels define the order ---
    dataset = Datasaurus(
        path=csv_path,
        num_points=config["num_points"],
        device=device,
        labels_to_use=shapes,
        jitter_scale=jitter_scale,
    )
    # ordered shape -> integer label index (e.g. bullseye=0, circle=1, ...)
    shape_order = list(dataset.labels.keys())

    # --- global standardization over ALL shapes (one consistent coord space) ---
    mu = dataset.xylabels[:, :2].mean(dim=0)
    sd = dataset.xylabels[:, :2].std(dim=0)

    # --- scheduler config consumed by root BetaScheduler / DDPM ---
    model_config = _base_model_config(config, seed)
    model_config.update({
        "cosine_s": config.get("cosine_s", 0.008),
        # capture settings carried for train_with_snapshots
        "k_snapshots": config["k_snapshots"],
        "snapshot_dense_until": config.get("snapshot_dense_until", 0),
        "snapshot_coarse_every": config.get("snapshot_coarse_every"),
        "reverse_record_every": record_every,
        "ema_decay": config.get("ema_decay"),
    })

    scheduler = BetaScheduler(configs=model_config)
    model = DDPM(configs=model_config, labels=dataset.labels, beta_scheduler=scheduler)

    # --- viz points per shape: densify each shape's template to NUM_POINTS_VIZ in
    # the SAME max-norm space, then standardize with the shared mu/sd ---
    _seed_everything(seed)
    viz_dataset = Datasaurus(
        path=csv_path,
        num_points=NUM_POINTS_VIZ,
        device=device,
        labels_to_use=shapes,
        jitter_scale=jitter_scale,
    )
    viz_points = {}
    for shape in shape_order:
        idx = dataset.labels[shape]
        block = viz_dataset.xylabels[idx * NUM_POINTS_VIZ:(idx + 1) * NUM_POINTS_VIZ, :2].to(device)
        viz_points[shape] = (block - mu) / sd

    # --- shared clip / view: the max abs over ALL standardized shapes + 10% so
    # every shape renders at the same scale and reverse stays bounded ---
    clip_val = max(float(viz_points[s].abs().max()) for s in shape_order) * 1.1
    clip_x0 = (-clip_val, clip_val)

    # --- train ONE conditional model, snapshotting EVERY shape per checkpoint ---
    label_indices = [dataset.labels[s] for s in shape_order]
    model, steps, snaps_by_shape = train_with_snapshots(
        model, dataset, scheduler, model_config, mu, sd,
        clip_x0=clip_x0, label_indices=label_indices,
    )

    # --- per-shape files ---
    forward_by_shape = {}
    reverse_by_shape = {}
    training_by_shape = {}
    for shape in shape_order:
        idx = dataset.labels[shape]

        forward_frames = record_forward_trajectory(scheduler, viz_points[shape], T, seed)
        forward = {"ts": list(range(T)), "frames": forward_frames}

        final, trajectory, rev_timesteps = record_reverse_trajectory(
            model, scheduler, NUM_POINTS_VIZ, T, record_every, device, seed,
            clip_x0=clip_x0, label_idx=idx,
        )
        reverse = {"timesteps": rev_timesteps, "trajectory": trajectory, "final": final}

        training = {"steps": steps, "snapshots": snaps_by_shape[idx]}

        with open(os.path.join(out_dir, f"forward_{shape}.json"), "w") as f:
            json.dump(forward, f)
        with open(os.path.join(out_dir, f"reverse_{shape}.json"), "w") as f:
            json.dump(reverse, f)
        with open(os.path.join(out_dir, f"training_{shape}.json"), "w") as f:
            json.dump(training, f)

        forward_by_shape[shape] = forward
        reverse_by_shape[shape] = reverse
        training_by_shape[shape] = training

    # --- meta.json: shape order + shared framing + per-shape clean scatter ---
    meta = {
        "shapes": shape_order,
        "num_timesteps": T,
        "num_points_viz": NUM_POINTS_VIZ,
        "mu": mu.detach().cpu().tolist(),
        "sd": sd.detach().cpu().tolist(),
        "view": clip_val,
        # cumulative ᾱ_t (one per timestep) so the viewer can draw the analytic
        # diffused marginal q(x_t) = Gaussian mixture without re-deriving the
        # schedule in JS. Source of truth is the BetaScheduler above.
        "alphas_bar": scheduler.alphas_bar.detach().cpu().tolist(),
        "data": {shape: _round_points(viz_points[shape].detach().cpu().tolist()) for shape in shape_order},
    }
    with open(os.path.join(out_dir, "meta.json"), "w") as f:
        json.dump(meta, f)

    return {
        "meta": meta,
        "forward": forward_by_shape,
        "reverse": reverse_by_shape,
        "training": training_by_shape,
    }


def export_modes_figure(out_dir: str, config: dict) -> dict:
    """Intro "trajectory transport" figure: a tiny DDPM trained on a few 2D
    Gaussian modes, then a handful of reverse-sampling trajectories colored by
    which mode each one reaches. Reuses the same training loop, reverse sampler,
    and rounding as the main dino export — only the data and the per-trajectory
    coloring are new. Writes ``modes.json`` and returns it.
    """
    os.makedirs(out_dir, exist_ok=True)
    device = config.get("device", "cpu")
    T = config["num_timesteps"]
    seed = config.get("seed", 0)
    num_modes = config.get("num_modes", 4)
    ppm = config.get("modes_points_per_mode", 120)
    record_every = config.get("modes_record_every", 8)
    n_starts = config.get("modes_num_starts", 3)
    runs_per_start = config.get("modes_runs_per_start", 5)
    cloud_size = config.get("modes_cloud_size", 20)
    mode_cloud_points = config.get("modes_mode_cloud_points", 12)

    _seed_everything(seed)
    data, centers = _gaussian_modes(num_modes, ppm, device, seed)  # raw (N,3), (K,2)
    # Do NOT recenter: the model trains in the raw (offset) coords so x_T ~ N(0,I)
    # stays at the origin, spatially apart from the offset x_0 modes. Identity mu/sd.
    mu = torch.zeros(2, device=device)
    sd = torch.ones(2, device=device)
    centers_cpu = centers.detach().cpu()  # mode centers (raw == standardized here)
    clip_val = float(data[:, :2].abs().max()) * 1.1
    clip_x0 = (-clip_val, clip_val)

    model_config = _base_model_config(config, seed)
    model_config.update({
        "k_snapshots": 1,  # we only want the final trained model, not the panel
        "reverse_record_every": record_every,
    })

    scheduler = BetaScheduler(configs=model_config)
    model = DDPM(configs=model_config, labels={"mode": 0}, beta_scheduler=scheduler)
    model, _, _ = train_with_snapshots(model, data, scheduler, model_config, mu, sd, clip_x0=clip_x0)

    # x_T noise cloud (the red prior samples, N(0, I)); the first n_starts of them
    # are the FIXED starts we trace, so the selected starts belong to the cloud.
    _seed_everything(seed)
    xT_cloud_t = torch.randn(cloud_size, 2, device=device)
    starts_t = xT_cloud_t[:n_starts]

    # From each fixed start, run `runs_per_start` reverse trajectories in one batch:
    # all rows share the start (x0) but get independent ancestral z, so a single
    # x_T fans out — possibly into DIFFERENT modes (the point of the figure).
    trajectory = None  # frames[index] accumulates all paths across starts
    timesteps = None
    finals = []
    for s in range(n_starts):
        final_s, traj_s, ts_s = record_reverse_trajectory(
            model, scheduler, runs_per_start, T, record_every, device,
            seed + s, clip_x0=clip_x0, x0=starts_t[s],
        )
        finals.extend(final_s)
        timesteps = ts_s
        if trajectory is None:
            trajectory = [list(frame) for frame in traj_s]
        else:
            for f, frame in enumerate(traj_s):
                trajectory[f].extend(frame)

    # color each path by the mode (nearest center) its endpoint reaches
    finals_t = torch.tensor(finals, dtype=torch.float32)  # (P, 2)
    nearest = torch.cdist(finals_t, centers_cpu).argmin(dim=1).tolist()
    colors = [MODE_COLORS[k % len(MODE_COLORS)] for k in nearest]

    # endpoint clouds for the panels: x_T noise (red) + a few points per x_0 mode.
    # `data` is row-blocked by mode (ppm rows each); subsample for a clean scatter.
    xT_cloud = _round_points(xT_cloud_t.detach().cpu().tolist())
    mode_clouds = []
    for k in range(num_modes):
        pts = data[k * ppm : k * ppm + mode_cloud_points, :2]
        mode_clouds.append({
            "color": MODE_COLORS[k % len(MODE_COLORS)],
            "points": _round_points(pts.detach().cpu().tolist()),
        })

    # display framing: bbox over every drawn point (trajectories + both clouds),
    # so the offset content is centered in the canvas rather than off in a corner
    flat = [pt for frame in trajectory for pt in frame] + xT_cloud
    flat += [pt for mc in mode_clouds for pt in mc["points"]]
    all_pts = torch.tensor(flat, dtype=torch.float32)
    mins = all_pts.min(dim=0).values
    maxs = all_pts.max(dim=0).values
    center = [round(float(c), 3) for c in ((mins + maxs) / 2)]
    view = round(float((maxs - mins).max()) / 2 * 1.1, 3)

    modes = {
        "center": center,
        "view": view,
        "trajectories": trajectory,
        "timesteps": timesteps,
        "colors": colors,
        "num_modes": num_modes,
        "xT_cloud": xT_cloud,
        "mode_clouds": mode_clouds,
        "starts": _round_points(starts_t.detach().cpu().tolist()),
    }
    with open(os.path.join(out_dir, "modes.json"), "w") as f:
        json.dump(modes, f)
    return modes


if __name__ == "__main__":
    repo_root = os.path.abspath(os.path.join(_SRC_DIR, "..", ".."))
    cfg = {
        "csv_path": os.path.join(repo_root, "ddpm", "data", "datasaurus.csv"),
        "device": "cpu",
        "label": "dino",
        "num_timesteps": 400,
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": "cosine",  # preserves signal longer -> crisper shapes
        "ema_decay": 0.999,  # sample from EMA-averaged weights (cleaner samples)
        # ONE conditional model over all 10 shapes => ~10x the data per epoch, so
        # fewer epochs keep the optimizer-step count (and wall-clock) reasonable.
        "epoch": 1200,
        "batch_size": 256,
        "learning_rate": 2e-3,
        "lr_decay": True,
        "num_points": 2000,
        "jitter_scale": 0.25,
        "label_embedding_dim": 8,
        "coordinate_embedding_dim": 128,
        "coordinate_encoder_type": "sinusoidal",
        "coordinate_encoder_scale": 25.0,
        "time_embedding_dim": 128,
        "time_encoder_type": "sinusoidal",
        "num_denoiser_hidden_layers": 4,
        "denoiser_hidden_dim": 256,
        "denoiser_residual": True,
        "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
        # UNIFORM snapshots: record a checkpoint every 200 optimizer steps
        # (0, 200, 400, ... through the final step). dense_until=0 disables the
        # dense early region, so the interval is even throughout.
        # k_snapshots is ignored when coarse_every is set.
        "k_snapshots": 1,
        "snapshot_dense_until": 0,
        "snapshot_coarse_every": 200,
        "reverse_record_every": 1,  # record every diffusion timestep (t=399..0)
        "shapes": None,  # None == all mapped Datasaurus shapes
        "seed": 0,
    }
    out = os.path.join(repo_root, "docs", "data", "precomputed")
    result = export_all_shapes(out, cfg)

    # intro "trajectory transport" figure (a few Gaussian modes, colored paths)
    modes_cfg = {
        **{k: cfg[k] for k in (
            "device", "num_timesteps", "beta_start", "beta_end", "beta_schedule_type",
            "batch_size", "learning_rate", "lr_decay", "label_embedding_dim",
            "coordinate_embedding_dim", "coordinate_encoder_type", "coordinate_encoder_scale",
            "time_embedding_dim", "time_encoder_type", "num_denoiser_hidden_layers",
            "denoiser_hidden_dim", "denoiser_residual", "denoiser_output_dim",
            "denoiser_activation", "seed",
        )},
        "epoch": 1200,
        "num_modes": 4,
        "modes_points_per_mode": 300,
        "modes_record_every": 1,  # transport slider snaps by timestep 1 (t=399..0)
        "modes_num_starts": 3,  # a few FIXED x_T starts we trace
        "modes_runs_per_start": 3,  # each sampled this many times (fans into modes)
        "modes_cloud_size": 20,  # x_T noise cloud points (red), reference-style
        "modes_mode_cloud_points": 12,  # points shown per x_0 mode cluster
    }
    export_modes_figure(out, modes_cfg)

    # report achieved shape quality per shape (IoU + chamfer)
    meta = result["meta"]
    for shape in meta["shapes"]:
        data = meta["data"][shape]
        final = result["reverse"][shape]["final"]
        iou = occupancy_iou(data, final)
        ch = chamfer_distance(data, final)
        print(f"{shape:12s} IoU={iou:.4f}  chamfer={ch:.4f}")
