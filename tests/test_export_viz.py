import json
import os
import sys

import pytest

# The root modules use bare imports (`from ddpm import ...`, `from dataset import ...`),
# so ddpm/src must be on sys.path before importing export_viz.
SRC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ddpm", "src"))
if SRC_DIR not in sys.path:
    sys.path.insert(0, SRC_DIR)

import export_viz  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PRECOMPUTED_DIR = os.path.join(REPO_ROOT, "docs", "data", "precomputed")
CSV_PATH = os.path.join(REPO_ROOT, "ddpm", "data", "datasaurus.csv")

NUM_POINTS_VIZ = export_viz.NUM_POINTS_VIZ  # single source of truth
K_SNAPSHOTS = 8


def _is_pointlist(obj, n=NUM_POINTS_VIZ):
    if not isinstance(obj, list) or len(obj) != n:
        return False
    return all(
        isinstance(p, list) and len(p) == 2 and all(isinstance(c, (int, float)) for c in p)
        for p in obj
    )


def test_export_structure_tiny(tmp_path):
    tiny_config = {
        "csv_path": CSV_PATH,
        "device": "cpu",
        "label": "dino",
        "num_timesteps": 20,
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": "linear",
        "epoch": 2,
        "batch_size": 32,
        "learning_rate": 1e-3,
        "num_points": 128,
        "label_embedding_dim": 8,
        "coordinate_embedding_dim": 16,
        "coordinate_encoder_type": "linear",
        "time_embedding_dim": 16,
        "time_encoder_type": "sinusoidal",
        "num_denoiser_hidden_layers": 2,
        "denoiser_hidden_dim": 32,
        "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
        "k_snapshots": K_SNAPSHOTS,
        "reverse_record_every": 5,
        "seed": 0,
    }

    result = export_viz.export_visualization(str(tmp_path), tiny_config)

    meta_p = tmp_path / "meta.json"
    forward_p = tmp_path / "forward.json"
    training_p = tmp_path / "training.json"
    reverse_p = tmp_path / "reverse.json"

    assert meta_p.exists()
    assert forward_p.exists()
    assert training_p.exists()
    assert reverse_p.exists()

    meta = json.loads(meta_p.read_text())
    forward = json.loads(forward_p.read_text())
    training = json.loads(training_p.read_text())
    reverse = json.loads(reverse_p.read_text())

    # meta
    assert _is_pointlist(meta["data"])
    assert meta["num_points_viz"] == NUM_POINTS_VIZ
    assert meta["label"] == "dino"

    # forward: ts strictly increasing, starts at 0; frames match ts; each 142x2
    ts = forward["ts"]
    assert ts[0] == 0
    assert all(ts[i] < ts[i + 1] for i in range(len(ts) - 1))
    frames = forward["frames"]
    assert len(frames) == len(ts)
    assert all(_is_pointlist(f) for f in frames)
    # frames[0] (t=0) must equal the clean data
    assert frames[0] == meta["data"]

    # training: exactly K snapshots, each NUM_POINTS_VIZ x 2
    snapshots = training["snapshots"]
    assert len(snapshots) == K_SNAPSHOTS == 8
    assert all(_is_pointlist(s) for s in snapshots)
    assert len(training["steps"]) == K_SNAPSHOTS
    # the first snapshot is the UNTRAINED model captured at optimizer step 0
    steps = training["steps"]
    assert steps[0] == 0
    assert all(steps[i] < steps[i + 1] for i in range(len(steps) - 1))

    # reverse: >=2 recorded steps, each NUM_POINTS_VIZ x 2, final NUM_POINTS_VIZ x 2
    traj = reverse["trajectory"]
    assert len(traj) >= 2
    assert all(_is_pointlist(s) for s in traj)
    assert _is_pointlist(reverse["final"])

    # each recorded frame carries its diffusion timestep t, descending from near
    # T-1 (pure noise) down to 0 (the dino) — so the viewer can show t, not "frame i"
    tsr = reverse["timesteps"]
    assert len(tsr) == len(traj)
    assert tsr[0] == tiny_config["num_timesteps"] - 1  # first frame is the noisiest
    assert tsr[-1] == 0  # final frame is x_0
    assert all(tsr[i] > tsr[i + 1] for i in range(len(tsr) - 1))

    # returned in-memory dict mirrors the written files
    assert set(result.keys()) >= {"meta", "forward", "training", "reverse"}


def test_modes_export_tiny(tmp_path):
    # The intro "trajectory transport" figure: a tiny DDPM on a few Gaussian
    # modes, a handful of trajectories colored by which mode each one reaches.
    cfg = {
        "csv_path": CSV_PATH,
        "device": "cpu",
        "num_timesteps": 20,
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": "linear",
        "epoch": 3,
        "batch_size": 64,
        "learning_rate": 1e-3,
        "label_embedding_dim": 8,
        "coordinate_embedding_dim": 16,
        "coordinate_encoder_type": "sinusoidal",
        "coordinate_encoder_scale": 25.0,
        "time_embedding_dim": 16,
        "time_encoder_type": "sinusoidal",
        "num_denoiser_hidden_layers": 2,
        "denoiser_hidden_dim": 32,
        "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
        "num_modes": 4,
        "modes_points_per_mode": 120,
        "modes_record_every": 4,
        "modes_num_starts": 3,
        "modes_runs_per_start": 4,
        "modes_cloud_size": 20,
        "modes_mode_cloud_points": 12,
        "seed": 0,
    }
    export_viz.export_modes_figure(str(tmp_path), cfg)
    p = tmp_path / "modes.json"
    assert p.exists()
    m = json.loads(p.read_text())

    # endpoint clouds for the static (left) + faint backdrop (right) panels
    assert len(m["xT_cloud"]) == cfg["modes_cloud_size"]
    assert len(m["mode_clouds"]) == cfg["num_modes"]
    for mc in m["mode_clouds"]:
        assert mc["color"] in export_viz.MODE_COLORS
        assert len(mc["points"]) == cfg["modes_mode_cloud_points"]

    # selected trajectories: num_starts * runs_per_start paths, grouped by start
    runs = cfg["modes_runs_per_start"]
    P = cfg["modes_num_starts"] * runs
    traj = m["trajectories"]
    assert all(len(f) == P for f in traj)
    assert len(m["colors"]) == P
    assert set(m["colors"]).issubset(set(export_viz.MODE_COLORS))
    assert m["timesteps"][0] == cfg["num_timesteps"] - 1
    assert m["timesteps"][-1] == 0

    # every run from the same fixed start begins at that identical start point
    starts = m["starts"]
    assert len(starts) == cfg["modes_num_starts"]
    for s in range(cfg["modes_num_starts"]):
        group = [traj[0][s * runs + r] for r in range(runs)]
        assert all(g == group[0] for g in group), "runs from one start must share x_T"
    assert "view" in m and "center" in m


def _tiny_reverse_model(T=20):
    # A minimal untrained DDPM + scheduler for exercising record_reverse_trajectory
    # directly (no training needed — we only check frame/timestep ALIGNMENT).
    from ddpm import DDPM, BetaScheduler

    cfg = {
        "device": "cpu",
        "num_timesteps": T,
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": "linear",
        "label_embedding_dim": 8,
        "coordinate_embedding_dim": 32,
        "coordinate_encoder_type": "sinusoidal",
        "coordinate_encoder_scale": 25.0,
        "time_embedding_dim": 32,
        "time_encoder_type": "sinusoidal",
        "num_denoiser_hidden_layers": 2,
        "denoiser_hidden_dim": 64,
        "denoiser_residual": True,
        "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
    }
    scheduler = BetaScheduler(configs=cfg)
    model = DDPM(configs=cfg, labels={"dino": 0}, beta_scheduler=scheduler)
    return model, scheduler


def test_reverse_first_frame_is_initial_noise():
    # The frame labeled t=T-1 must be the sample ENTERING the first denoising step
    # (the pure x_T noise), matching forward's "frame t == x_t" convention. The bug
    # was recording x AFTER the step, so frame[0] held x_{T-2} and the noisiest
    # state was off by one from its timestep label (the visualization desync).
    import torch

    T, n, seed = 20, 6, 0
    model, scheduler = _tiny_reverse_model(T)
    _, traj, ts = export_viz.record_reverse_trajectory(model, scheduler, n, T, 1, "cpu", seed)

    # reconstruct the exact initial noise the function sampled (seed -> randn(n,2))
    export_viz._seed_everything(seed)
    init = export_viz._round_points(torch.randn(n, 2).tolist())

    assert ts[0] == T - 1  # the first frame is labeled as the noisiest timestep
    assert traj[0] == init, "frame t=T-1 is not the initial x_T noise (off-by-one)"
    # alignment must not corrupt the descending-by-1 schedule ending at clean x_0
    assert ts[-1] == 0
    assert len(traj) == len(ts)
    diffs = {ts[i] - ts[i + 1] for i in range(len(ts) - 1)}
    assert diffs == {1}


def test_ema_update_applies_decay():
    # EMA: ema <- decay*ema + (1-decay)*param, so one update moves a zero-init
    # shadow a (1-decay) fraction toward the current weights.
    import torch

    ema = {"w": torch.zeros(4)}

    class _M:
        def state_dict(self):
            return {"w": torch.ones(4)}

    export_viz._ema_update(ema, _M(), decay=0.9)
    assert torch.allclose(ema["w"], torch.full((4,), 0.1), atol=1e-6)
    export_viz._ema_update(ema, _M(), decay=0.9)  # 0.9*0.1 + 0.1*1 = 0.19
    assert torch.allclose(ema["w"], torch.full((4,), 0.19), atol=1e-6)


def test_cosine_beta_schedule():
    # Cosine schedule (Nichol & Dhariwal): alphas_bar follows a cos^2 curve, so it
    # preserves signal LONGER than linear (higher alpha_bar at the midpoint), with
    # betas clamped to (0, 0.999]. Improves sample quality on structured data.
    import torch
    from ddpm import BetaScheduler

    T = 400
    base = {"device": "cpu", "num_timesteps": T, "beta_start": 1e-4, "beta_end": 0.02}
    lin = BetaScheduler(configs={**base, "beta_schedule_type": "linear"})
    cos = BetaScheduler(configs={**base, "beta_schedule_type": "cosine"})

    ab = cos.alphas_bar
    betas = 1.0 - cos.alphas  # per-step betas implied by the schedule
    assert ab[0] < 1.0 and float(ab[-1]) < 0.05  # starts ~clean, ends ~pure noise
    assert torch.all(ab[1:] <= ab[:-1] + 1e-6)  # monotonically non-increasing
    assert float(betas.max()) <= 0.999 + 1e-6 and float(betas.min()) >= 0.0
    # cosine keeps more signal at the midpoint than linear (its whole point)
    assert float(cos.alphas_bar[T // 2]) > float(lin.alphas_bar[T // 2])


def test_forward_trajectory_is_stochastic_noisy_walk():
    # The forward viz uses the step-by-step Markov chain (fresh noise each step),
    # NOT the fixed-eps closed form — so the trajectory is a NOISY random walk
    # (path length >> net displacement) and stochastic across seeds, matching the
    # reverse panel's look. The per-step marginal is unchanged.
    import numpy as np
    import torch
    from ddpm import BetaScheduler

    cfg = {
        "device": "cpu",
        "num_timesteps": 60,
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": "linear",
    }
    sch = BetaScheduler(configs=cfg)
    T = 60
    x0 = torch.tensor([[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0], [0.0, -1.0]])

    fa = export_viz.record_forward_trajectory(sch, x0, T, seed=1)
    fb = export_viz.record_forward_trajectory(sch, x0, T, seed=2)

    assert fa[0] == export_viz._round_points(x0.tolist())  # starts at clean data
    assert len(fa) == T
    assert fa[-1] != fb[-1]  # stochastic: fresh noise -> different paths

    p = np.asarray(fa, dtype=float)  # (T, 4, 2)
    pathlen = np.linalg.norm(np.diff(p, axis=0), axis=2).sum(0)  # per-point path length
    disp = np.linalg.norm(p[-1] - p[0], axis=1)  # per-point net displacement
    # a noisy walk wanders far more than its straight-line displacement; a smooth
    # closed-form arc would have a ratio near 1.
    assert float(np.median(pathlen / (disp + 1e-9))) > 2.5


def test_record_reverse_trajectory_conditions_on_label():
    # The reverse sampler can be conditioned on ANY shape's label via label_idx;
    # different labels feed different embeddings, so (same seed) the samples differ.
    from ddpm import BetaScheduler, DDPM

    cfg = {
        "device": "cpu", "num_timesteps": 20, "beta_start": 1e-4, "beta_end": 0.02,
        "beta_schedule_type": "linear", "label_embedding_dim": 8,
        "coordinate_embedding_dim": 32, "coordinate_encoder_type": "sinusoidal",
        "coordinate_encoder_scale": 25.0, "time_embedding_dim": 32,
        "time_encoder_type": "sinusoidal", "num_denoiser_hidden_layers": 2,
        "denoiser_hidden_dim": 64, "denoiser_residual": True, "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
    }
    sch = BetaScheduler(configs=cfg)
    model = DDPM(configs=cfg, labels={"a": 0, "b": 1, "c": 2}, beta_scheduler=sch)

    f0, _, _ = export_viz.record_reverse_trajectory(model, sch, 4, 20, 1, "cpu", seed=0, label_idx=0)
    f2, _, _ = export_viz.record_reverse_trajectory(model, sch, 4, 20, 1, "cpu", seed=0, label_idx=2)
    assert f0 != f2, "label_idx not used — sampling is not conditioned on the label"


def test_reverse_trajectory_fixed_start():
    # KR1: passing a fixed initial start x0 makes every run begin at that point,
    # and varying the seed varies the ancestral z, so the SAME start can take
    # different stochastic paths (the basis for "one x_T -> different x_0 modes").
    import torch

    T = 20
    model, scheduler = _tiny_reverse_model(T)
    x0 = torch.tensor([[0.5, -0.3]])  # one fixed start (n=1)

    _, traj_a, _ = export_viz.record_reverse_trajectory(
        model, scheduler, 1, T, 1, "cpu", seed=1, clip_x0=None, x0=x0
    )
    _, traj_b, _ = export_viz.record_reverse_trajectory(
        model, scheduler, 1, T, 1, "cpu", seed=2, clip_x0=None, x0=x0
    )

    start = export_viz._round_points(x0.tolist())
    assert traj_a[0] == start, "fixed start x0 not used as the first frame"
    assert traj_b[0] == start
    assert traj_a != traj_b, "different seeds should give different stochastic paths"


def test_chamfer_distance_metric_is_valid():
    import numpy as np

    rng = np.random.default_rng(0)
    gt = rng.normal(0, 1, (142, 2))

    # identical sets → 0
    assert export_viz.chamfer_distance(gt, gt) == 0.0

    near = gt + rng.normal(0, 0.02, gt.shape)  # near-perfect reproduction
    blob = rng.uniform(gt.min(0), gt.max(0), (142, 2))  # diffuse blob over bbox
    # mode collapse onto a few EXACT gt points: precision is 0 (every gen point
    # sits on a real data point) but coverage is terrible (most of the shape is
    # unrepresented). Only the recall direction penalizes this.
    collapsed = np.repeat(gt[:5], 30, axis=0)[:142]

    near_d = export_viz.chamfer_distance(gt, near)
    # a near-perfect copy must score much closer than a diffuse blob
    assert near_d < export_viz.chamfer_distance(gt, blob)
    # ...and closer than the collapsed set. A one-directional (precision-only)
    # metric would rate `collapsed` as perfect (0) and FAIL this assertion.
    assert near_d < export_viz.chamfer_distance(gt, collapsed)


def test_committed_reverse_is_dense():
    # The committed reverse trajectory (per-shape; dino) must be recorded densely
    # enough that the per-point trail reads as a smooth path, not discrete jumps.
    reverse_p = os.path.join(PRECOMPUTED_DIR, "reverse_dino.json")
    meta_p = os.path.join(PRECOMPUTED_DIR, "meta.json")
    if not (os.path.exists(reverse_p) and os.path.exists(meta_p)):
        pytest.skip("committed precomputed artifacts not present")

    with open(reverse_p) as f:
        reverse = json.load(f)
    with open(meta_p) as f:
        meta = json.load(f)

    traj = reverse["trajectory"]
    T = meta["num_timesteps"]
    # >= T//5 frames proves record_every <= 5 (denser than the old 10).
    assert len(traj) >= T // 5, f"reverse has {len(traj)} frames, expected >= {T // 5} (denser sampling)"
    # timesteps stays aligned 1:1 with the recorded frames
    assert len(reverse["timesteps"]) == len(traj)


DENSE_UNTIL = 300  # committed training snapshots record EVERY step up to here


def test_committed_snapshots_interval():
    # Per-shape training snapshots (dino): the EARLY region is recorded at a
    # 1-step interval (snapshot_dense_until) so the fast initial shape formation
    # is visible, then COARSE checkpoints cover the rest. The old uniform layout
    # jumped ~2400 steps at once and hid the early dynamics.
    training_p = os.path.join(PRECOMPUTED_DIR, "training_dino.json")
    if not os.path.exists(training_p):
        pytest.skip("committed precomputed artifacts not present")

    with open(training_p) as f:
        training = json.load(f)

    steps = training["steps"]
    assert steps[0] == 0  # first snapshot is the untrained model
    assert all(steps[i] < steps[i + 1] for i in range(len(steps) - 1))
    assert len(training["snapshots"]) == len(steps)

    # the first DENSE_UNTIL+1 checkpoints step by EXACTLY 1 (0,1,2,...,DENSE_UNTIL)
    assert steps[: DENSE_UNTIL + 1] == list(range(DENSE_UNTIL + 1)), (
        "early snapshots must snap at 1-step interval through "
        f"step {DENSE_UNTIL}; got {steps[:5]}...{steps[DENSE_UNTIL - 2:DENSE_UNTIL + 2]}"
    )
    # beyond the dense region the checkpoints are coarse (a gap larger than 1)
    assert steps[-1] > DENSE_UNTIL
    assert any(steps[i + 1] - steps[i] > 1 for i in range(len(steps) - 1)), (
        "expected coarse checkpoints (gap > 1) after the dense region"
    )


def test_committed_reverse_records_every_timestep():
    # The reverse trajectory records ONE frame per diffusion timestep (t = T-1
    # down to 0), so the viewer scrubs by timestep like the forward viewer.
    reverse_p = os.path.join(PRECOMPUTED_DIR, "reverse_dino.json")
    meta_p = os.path.join(PRECOMPUTED_DIR, "meta.json")
    if not (os.path.exists(reverse_p) and os.path.exists(meta_p)):
        pytest.skip("committed precomputed artifacts not present")

    with open(reverse_p) as f:
        reverse = json.load(f)
    with open(meta_p) as f:
        meta = json.load(f)

    T = meta["num_timesteps"]
    tsr = reverse["timesteps"]
    assert tsr[0] == T - 1
    assert tsr[-1] == 0
    diffs = {tsr[i] - tsr[i + 1] for i in range(len(tsr) - 1)}
    assert diffs == {1}, f"reverse is not per-timestep (record_every>1): diffs {diffs}"


def test_committed_forward_records_every_timestep():
    # The forward viewer's slider should snap by timestep 1: forward.json records
    # ONE frame per diffusion timestep t = 0,1,...,T-1 (ascending), so scrubbing
    # the slider advances t by exactly 1 each step (not the old ~T/40 linspace).
    forward_p = os.path.join(PRECOMPUTED_DIR, "forward_dino.json")
    meta_p = os.path.join(PRECOMPUTED_DIR, "meta.json")
    if not (os.path.exists(forward_p) and os.path.exists(meta_p)):
        pytest.skip("committed precomputed artifacts not present")

    with open(forward_p) as f:
        forward = json.load(f)
    with open(meta_p) as f:
        meta = json.load(f)

    T = meta["num_timesteps"]
    ts = forward["ts"]
    assert ts == list(range(T)), "forward ts is not the full 0..T-1 per-timestep range"
    assert len(forward["frames"]) == len(ts)


def test_committed_modes_records_every_timestep():
    # The transport ("noise -> data") figure's slider should snap by timestep 1:
    # modes.json records ONE frame per diffusion timestep (t = T-1 down to 0), so
    # the displayed t descends by exactly 1 each slider step (not record_every=8).
    p = os.path.join(PRECOMPUTED_DIR, "modes.json")
    meta_p = os.path.join(PRECOMPUTED_DIR, "meta.json")
    if not (os.path.exists(p) and os.path.exists(meta_p)):
        pytest.skip("committed modes.json not present")

    m = json.loads(open(p).read())
    with open(meta_p) as f:
        meta = json.load(f)

    T = meta["num_timesteps"]
    tsm = m["timesteps"]
    assert tsm[0] == T - 1
    assert tsm[-1] == 0
    diffs = {tsm[i] - tsm[i + 1] for i in range(len(tsm) - 1)}
    assert diffs == {1}, f"modes is not per-timestep (record_every>1): diffs {diffs}"


def test_committed_untrained_snapshot_is_bounded():
    # KR2: clip_denoised must keep even the untrained (step-0) reverse sample
    # within the data range. Without clipping a random model diverges to ~±40,
    # which dominated the shared view and shrank the trained dino to a blob.
    import numpy as np

    training_p = os.path.join(PRECOMPUTED_DIR, "training_dino.json")
    if not os.path.exists(training_p):
        pytest.skip("committed precomputed artifacts not present")

    with open(training_p) as f:
        training = json.load(f)

    assert training["steps"][0] == 0  # first snapshot is the untrained model
    snap0 = np.asarray(training["snapshots"][0], dtype=float)
    m = float(np.abs(snap0).max())
    assert m <= 3.5, f"untrained snapshot max|coord|={m:.2f} > 3.5 (clip_denoised not applied)"


def test_committed_modes_trajectories():
    # Intro transport figure: a few FIXED x_T starts, each sampled multiple times,
    # so one x_T fans out into possibly-different modes (colored by destination).
    p = os.path.join(PRECOMPUTED_DIR, "modes.json")
    if not os.path.exists(p):
        pytest.skip("committed modes.json not present")
    m = json.loads(open(p).read())

    P = len(m["trajectories"][0])  # total paths = num_starts * runs_per_start
    assert all(len(f) == P for f in m["trajectories"])
    assert len(m["colors"]) == P
    assert set(m["colors"]).issubset(set(export_viz.MODE_COLORS))
    assert len(set(m["colors"])) >= 2
    assert m["timesteps"][0] > m["timesteps"][-1] and m["timesteps"][-1] == 0

    # endpoint clouds for the two panels
    assert len(m["xT_cloud"]) >= 1
    assert len(m["mode_clouds"]) == m["num_modes"]
    for mc in m["mode_clouds"]:
        assert mc["color"] in export_viz.MODE_COLORS and len(mc["points"]) >= 1

    # at least one fixed start fans out to >= 2 distinct modes (the whole point)
    starts = m["starts"]
    nst = len(starts)
    runs = P // nst
    assert nst * runs == P
    split = any(
        len({m["colors"][s * runs + r] for r in range(runs)}) >= 2 for s in range(nst)
    )
    assert split, "no fixed x_T start reaches >= 2 modes"

    # x_T (noise starts) and x_0 (modes) must be SEPARATED clusters
    import numpy as np

    sep = float(
        np.linalg.norm(
            np.asarray(m["trajectories"][0], dtype=float).mean(0)
            - np.asarray(m["trajectories"][-1], dtype=float).mean(0)
        )
    )
    assert sep > 1.5, f"x_T and x_0 centroids only {sep:.2f} apart (not separated)"
    assert "center" in m and len(m["center"]) == 2
    assert "view" in m


def test_committed_artifact_quality():
    import numpy as np

    reverse_p = os.path.join(PRECOMPUTED_DIR, "reverse_dino.json")
    meta_p = os.path.join(PRECOMPUTED_DIR, "meta.json")
    if not (os.path.exists(reverse_p) and os.path.exists(meta_p)):
        pytest.skip("committed precomputed artifacts not present")

    with open(reverse_p) as f:
        reverse = json.load(f)
    with open(meta_p) as f:
        meta = json.load(f)

    final = np.asarray(reverse["final"], dtype=float)
    data = np.asarray(meta["data"]["dino"], dtype=float)

    assert final.shape == (NUM_POINTS_VIZ, 2)

    # Shape quality: symmetric chamfer distance (lower = closer). ONE conditional
    # model now shares capacity across all 10 shapes (and uses fewer viz points),
    # so the per-shape dino reproduction is looser than a dino-only model — a
    # diffuse blob still scores ~0.4+, so this bound still catches a failed shape.
    chamfer = export_viz.chamfer_distance(data, final)
    assert chamfer <= 0.30, f"reverse-final dino chamfer {chamfer:.4f} > 0.30 (shape not reproduced)"


def test_export_all_shapes_tiny(tmp_path):
    # ONE conditional model trained on MULTIPLE Datasaurus shapes, then per-shape
    # forward / reverse / training viz exported. Conditioning on each shape's label
    # must give DIFFERENT reverse finals (not one shape repeated).
    shapes = ["dino", "circle", "star"]
    tiny_config = {
        "csv_path": CSV_PATH,
        "device": "cpu",
        "shapes": shapes,
        "num_timesteps": 10,
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": "cosine",
        "epoch": 2,
        "batch_size": 64,
        "learning_rate": 1e-3,
        "num_points": 64,
        "jitter_scale": 1.0,
        "label_embedding_dim": 8,
        "coordinate_embedding_dim": 16,
        "coordinate_encoder_type": "sinusoidal",
        "coordinate_encoder_scale": 25.0,
        "time_embedding_dim": 16,
        "time_encoder_type": "sinusoidal",
        "num_denoiser_hidden_layers": 2,
        "denoiser_hidden_dim": 32,
        "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
        "k_snapshots": 2,
        "snapshot_coarse_every": 10_000,  # large -> few snapshots
        "reverse_record_every": 5,
        "seed": 0,
    }

    result = export_viz.export_all_shapes(str(tmp_path), tiny_config)

    meta_p = tmp_path / "meta.json"
    assert meta_p.exists()
    meta = json.loads(meta_p.read_text())
    assert meta["shapes"] == shapes
    assert meta["num_timesteps"] == tiny_config["num_timesteps"]
    assert meta["num_points_viz"] == NUM_POINTS_VIZ
    # alphas_bar (one ᾱ per timestep) is exported for the analytic q(x_t) curve,
    # monotonically decreasing from ~1 (data) toward ~0 (noise).
    ab = meta["alphas_bar"]
    assert len(ab) == tiny_config["num_timesteps"]
    assert ab[0] > ab[-1]
    assert all(ab[i] >= ab[i + 1] - 1e-6 for i in range(len(ab) - 1))

    finals = []
    for shape in shapes:
        forward_p = tmp_path / f"forward_{shape}.json"
        reverse_p = tmp_path / f"reverse_{shape}.json"
        training_p = tmp_path / f"training_{shape}.json"
        assert forward_p.exists()
        assert reverse_p.exists()
        assert training_p.exists()

        reverse = json.loads(reverse_p.read_text())
        tsr = reverse["timesteps"]
        assert tsr[0] == tiny_config["num_timesteps"] - 1
        assert tsr[-1] == 0
        finals.append(reverse["final"])

        training = json.loads(training_p.read_text())
        assert len(training["snapshots"]) == len(training["steps"])
        assert len(training["snapshots"]) >= 1

        # per-shape clean data scatter in meta.data
        assert isinstance(meta["data"][shape], list) and len(meta["data"][shape]) > 0

    # conditioning differs: at least two shapes' reverse finals are NOT identical
    assert any(finals[i] != finals[j] for i in range(len(finals)) for j in range(i + 1, len(finals))), \
        "all shapes' reverse finals identical — conditioning has no effect"

    # returned dict carries meta
    assert "meta" in result
