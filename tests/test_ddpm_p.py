"""KR2 — DDPM.p must return the reverse-step POSTERIOR MEAN (matching its
"returns x_{t-1}" docstring):

    mu = 1/sqrt(alpha_t) * (x_t - beta_t/sqrt(1 - alpha_bar_t) * eps)

The original code returned the x_0 ESTIMATE (1/sqrt(alpha_bar_t) * (...)), a
different quantity, so ancestral sampling built on it was wrong.
"""
import os
import sys

import torch

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ddpm", "src"))
if SRC not in sys.path:
    sys.path.insert(0, SRC)

from ddpm import DDPM, BetaScheduler  # noqa: E402


def _cfg():
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
    }


def test_p_returns_posterior_mean():
    torch.manual_seed(0)
    cfg = _cfg()
    sch = BetaScheduler(configs=cfg)
    model = DDPM(configs=cfg, labels={"dino": 0}, beta_scheduler=sch)

    t = 10
    x_t = torch.randn(5, 2)
    eps = torch.randn(5, 2)

    alpha_t = sch.alphas[t]
    beta_t = 1.0 - alpha_t
    sqrt_one_minus_abar = sch.one_minus_alphas_bar_sqrt[t]
    expected = (1.0 / torch.sqrt(alpha_t)) * (x_t - (beta_t / sqrt_one_minus_abar) * eps)

    got = model.p(x_t, t, eps)
    assert torch.allclose(got, expected, atol=1e-6), (
        "p() must return the DDPM posterior mean 1/sqrt(alpha)*(x_t - beta/sqrt(1-abar)*eps)"
    )


def test_p_clips_predicted_x0_to_range():
    # clip_denoised best practice: clamp the predicted x0 to the data range each
    # reverse step so an out-of-range (e.g. untrained) eps cannot make sampling
    # diverge. At t=0 the posterior mean reduces to the (clipped) x0 estimate.
    torch.manual_seed(0)
    cfg = _cfg()
    sch = BetaScheduler(configs=cfg)
    model = DDPM(configs=cfg, labels={"dino": 0}, beta_scheduler=sch)

    # at t=0 the x0 estimate ~= x_t, so a far-out-of-range x_t exposes the clamp
    x_t = torch.full((5, 2), 50.0)
    eps = torch.randn(5, 2)
    lo, hi = -3.0, 3.0

    clipped = model.p(x_t, 0, eps, clip_x0=(lo, hi))
    assert clipped.min() >= lo - 1e-5 and clipped.max() <= hi + 1e-5, (
        "with clip_x0 the returned x_{t-1} (==clipped x0 at t=0) must lie in [lo, hi]"
    )

    # control: without clipping, the same call blows past the range
    unclipped = model.p(x_t, 0, eps)
    assert unclipped.abs().max() > hi
