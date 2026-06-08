# Intuitions about DDPM [<img src="media/external-link-light.svg#gh-light-mode-only" width="25" height="25" alt="open in new tab" /><img src="media/external-link-dark.svg#gh-dark-mode-only" width="25" height="25" alt="" />](https://parkcheolhee-lab.github.io/intuitions-about-ddpm/)

<p align="justify">
Diffusion models power most of today's image, video, and audio generators — yet how they actually work (slowly destroy data with noise, then train a network to undo it step by step) tends to stay abstract, buried behind the math. This repo turns that process into something you can watch.
</p>

<p align="justify">
It strips diffusion down to its simplest form — 2D point clouds shaped like the Datasaurus dino, plus a dozen other shapes — so every step is visible on screen: a shape dissolving into pure Gaussian noise, a small network learning to reverse it, and noise being walked back into data one timestep at a time. In high dimensions (images) that geometry is hidden; in 2D you can literally see the distribution spread out into a single Gaussian and then gather back into structure — the same intuition that underlies DDPMs, score-based models, and flow matching.
</p>

<p align="justify">
The point is understanding, not generation. There is nothing to install and no model to download: a real PyTorch DDPM is trained offline, every frame of the forward, reverse, and training processes is precomputed, and a dependency-free static page replays them — so you just open it and scrub through diffusion at your own pace, pausing on any timestep to see exactly what happens.
</p>

![Sampling trajectories: noise → data](media/sampling-trajectories.png)

![Forward diffusion](media/forward-diffusion.png)
