"""KR1 — the training loop must feed the NOISED x_t (q output) to the denoiser,
not the clean x_0. A diffusion denoiser that only ever sees clean inputs during
training cannot denoise the noisy inputs it gets at sampling time.
"""
import os
import sys

import torch

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ddpm", "src"))
if SRC not in sys.path:
    sys.path.insert(0, SRC)

from dataset import Datasaurus  # noqa: E402
from ddpm import DDPM, BetaScheduler  # noqa: E402
from train import Trainer  # noqa: E402

CSV = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ddpm", "data", "datasaurus.csv"))


def _config(n):
    return {
        "device": "cpu",
        "num_timesteps": 50,
        "beta_start": 1e-4,
        "beta_end": 0.02,
        "beta_schedule_type": "linear",
        "label_embedding_dim": 8,
        "coordinate_embedding_dim": 16,
        "coordinate_encoder_type": "linear",
        "time_embedding_dim": 16,
        "time_encoder_type": "sinusoidal",
        "num_denoiser_hidden_layers": 2,
        "denoiser_hidden_dim": 32,
        "denoiser_output_dim": 2,
        "denoiser_activation": "GELU",
        "batch_size": n,  # full-batch → exactly one step, one q call, one forward call
        "epoch": 1,
        "learning_rate": 1e-3,
        "visualize_interval": 10,
    }


def test_trainer_feeds_noised_xt_not_clean_x0():
    torch.manual_seed(0)
    n = 16
    cfg = _config(n)
    ds = Datasaurus(path=CSV, num_points=n, device="cpu", labels_to_use=["dino"])
    sch = BetaScheduler(configs=cfg)
    model = DDPM(configs=cfg, labels=ds.labels, beta_scheduler=sch)
    opt = torch.optim.AdamW(model.parameters(), lr=cfg["learning_rate"])

    captured = {}
    real_q = model.q
    real_forward = model.forward

    def q_spy(x_0, t, noise):
        out = real_q(x_0=x_0, t=t, noise=noise)
        captured["xt"] = out.detach().clone()
        return out

    def forward_spy(coordinates, t, label_embeddings):
        captured["forward_coords"] = coordinates.detach().clone()
        return real_forward(coordinates, t, label_embeddings)

    model.q = q_spy
    model.forward = forward_spy

    Trainer(ddpm=model, dataset=ds, optimizer=opt, configs=cfg).train()

    assert "xt" in captured and "forward_coords" in captured
    # The denoiser must receive the noised x_t, i.e. exactly what q produced —
    # not the clean coordinates (the bug fed clean x_0).
    assert torch.allclose(captured["forward_coords"], captured["xt"]), (
        "denoiser was fed clean x_0; it must be fed the noised x_t from q()"
    )
