# ddpm — visual intuition for diffusion models

Diffusion models power most of today's image, video, and audio generators — yet
how they actually work (slowly destroy data with noise, then train a network to
undo it step by step) tends to stay abstract, buried behind the math. **This repo
turns that process into something you can watch.**

It strips diffusion down to its simplest form — 2D point clouds shaped like the
Datasaurus dino, plus a dozen other shapes — so every step is visible on screen:
a shape dissolving into pure Gaussian noise, a small network learning to reverse
it, and noise being walked back into data one timestep at a time. In high
dimensions (images) that geometry is hidden; in 2D you can literally see the
distribution spread out into a single Gaussian and then gather back into
structure — the same intuition that underlies DDPMs, score-based models, and flow
matching.

The point is **understanding, not generation**. There is nothing to install and
no model to download: a real PyTorch DDPM is trained offline, every frame of the
forward, reverse, and training processes is precomputed, and a dependency-free
static page replays them — so you just open it and scrub through diffusion at
your own pace, pausing on any timestep to see exactly what happens.

**Live demo →** https://parkcheolhee-lab.github.io/ddpm/

![Sampling trajectories: noise → data](media/sampling-trajectories.png)

![Forward diffusion](media/forward-diffusion.png)

## What it shows

Four interactive views, each scrubbable timestep by timestep:

- **Sampling trajectories** — on a few Gaussian modes, watch each path get carried from the noise prior into one of the data modes.
- **Forward diffusion** — a shape dissolving into Gaussian noise, alongside the analytic marginal _q(xₜ)_ widening into a bell.
- **Training the denoiser** — generated samples sharpening into the target shape as the network learns.
- **Reverse sampling** — ancestral sampling walking pure noise back into the data.
