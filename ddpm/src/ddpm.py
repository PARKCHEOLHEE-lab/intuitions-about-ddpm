import torch
import torch.nn as nn


class SinusoidalEncoder(nn.Module):
    # positional embedding. `scale` widens the frequency range: the 10000-base
    # scheme is tuned for large integer positions (time t), so for small float
    # coordinates we scale the input up (Fourier features) to expose the high
    # frequencies needed to represent fine 2D structure.

    def __init__(self, embedding_dim: int, scale: float = 1.0) -> None:
        super().__init__()

        self.embedding_dim = embedding_dim
        self.scale = scale

    def forward(self, tensor_to_encode: torch.Tensor) -> torch.Tensor:
        """do sinusoidal encoding for a tensor.

        Note:
            a^b = e^{b log(a)}
            10000^{-2i/d} = exp(-2i/d log(10000))
            d = 2*half, 10000^{-2i/(2*half)} = 10000^{-i/half}

        Args:
            tensor_to_encode (torch.Tensor): _description_

        Returns:
            torch.Tensor: embedding
        """

        half = self.embedding_dim // 2

        i = torch.arange(half)
        f = torch.log(torch.tensor(10000)) / (half - 1)
        w = torch.exp(-f * i).unsqueeze(0).to(tensor_to_encode.device)

        embedding = (tensor_to_encode * self.scale) @ w
        embedding = torch.cat((torch.sin(embedding), torch.cos(embedding)), dim=-1)

        return embedding

        
class BetaScheduler:
    def __init__(self, configs: dict):
        self.configs = configs
        
        if self.configs["beta_schedule_type"] == "linear":

            # linear schedule
            betas = torch.linspace(
                self.configs["beta_start"],
                self.configs["beta_end"],
                self.configs["num_timesteps"],
            )

        elif self.configs["beta_schedule_type"] == "cosine":

            # cosine schedule (Nichol & Dhariwal 2021): alpha_bar follows a cos^2
            # curve so signal is preserved longer than linear; betas derived from
            # the alpha_bar ratio and clamped for numerical stability.
            import math

            num_timesteps = self.configs["num_timesteps"]
            s = self.configs.get("cosine_s", 0.008)
            steps = torch.arange(num_timesteps + 1, dtype=torch.float64)
            f = torch.cos(((steps / num_timesteps + s) / (1 + s)) * math.pi / 2) ** 2
            alphas_bar = f / f[0]
            betas = 1 - alphas_bar[1:] / alphas_bar[:-1]
            betas = betas.clamp(min=0.0, max=0.999).float()

        else:
            raise ValueError

        self.alphas = 1 - betas
        self.alphas_bar = torch.cumprod(self.alphas, axis=0)
        self.alphas_bar_sqrt = torch.sqrt(self.alphas_bar)

        self.one_minus_alphas_bar = 1 - self.alphas_bar
        self.one_minus_alphas_bar_sqrt = torch.sqrt(self.one_minus_alphas_bar)
        
        # set device
        for k, v in self.__dict__.items():
            if isinstance(v, torch.Tensor):
                self.__dict__[k] = v.to(self.configs["device"])


class DDPM(nn.Module):
    def __init__(self, configs: dict, labels: dict[str, int], beta_scheduler: BetaScheduler):
        super().__init__()
        
        self.configs = configs
        self.labels = labels
        self.beta_scheduler = beta_scheduler
        
        # set label embeddings
        self.label_embeddings = nn.Embedding(len(self.labels), self.configs["label_embedding_dim"])
        
        # set time encoder
        if self.configs["time_encoder_type"] == "sinusoidal":
            self.time_encoder = SinusoidalEncoder(self.configs["time_embedding_dim"])
        elif self.configs["time_encoder_type"] == "linear":
            self.time_encoder = nn.Linear(1, self.configs["time_embedding_dim"])
        else:
            raise ValueError
        
        # set coordinate encoder. For sinusoidal, scale the coordinates up
        # (Fourier features) so the encoder spans high frequencies — without
        # this the 10000-base scheme is near-constant over the small data range
        # and the denoiser cannot represent fine 2D structure.
        coordinate_encoder_scale = self.configs.get("coordinate_encoder_scale", 25.0)
        if self.configs["coordinate_encoder_type"] == "sinusoidal":
            self.coordinate_encoder_x = SinusoidalEncoder(
                self.configs["coordinate_embedding_dim"], scale=coordinate_encoder_scale
            )
            self.coordinate_encoder_y = SinusoidalEncoder(
                self.configs["coordinate_embedding_dim"], scale=coordinate_encoder_scale
            )
        elif self.configs["coordinate_encoder_type"] == "linear":
            self.coordinate_encoder_x = nn.Linear(1, self.configs["coordinate_embedding_dim"])
            self.coordinate_encoder_y = nn.Linear(1, self.configs["coordinate_embedding_dim"])
        else:
            raise ValueError
        
        # set denoiser
        self.denoiser_input_dim = (
            self.configs["coordinate_embedding_dim"] * 2
            + self.configs["time_embedding_dim"]
            + self.configs["label_embedding_dim"]
        )

        hidden = self.configs["denoiser_hidden_dim"]
        self.denoiser_activation_fn = getattr(nn, self.configs["denoiser_activation"])()
        self.denoiser_residual = self.configs.get("denoiser_residual", True)

        self.denoiser_input = nn.Linear(self.denoiser_input_dim, hidden)
        self.denoiser_blocks = nn.ModuleList(
            nn.Linear(hidden, hidden)
            for _ in range(self.configs["num_denoiser_hidden_layers"])
        )
        self.denoiser_output = nn.Linear(hidden, self.configs["denoiser_output_dim"])

        self.to(self.configs["device"])

    def denoiser(self, x: torch.Tensor) -> torch.Tensor:
        """Denoiser MLP with optional residual connections after each block."""
        act = self.denoiser_activation_fn
        h = act(self.denoiser_input(x))
        for block in self.denoiser_blocks:
            out = act(block(h))
            h = h + out if self.denoiser_residual else out
        return self.denoiser_output(h)
    
    def q(self, x_0: torch.Tensor, t: torch.Tensor, noise: torch.Tensor) -> torch.Tensor:
        """do forward diffusion process.
        
        Note: 
            x_t = sqrt(alpha_bar_t) * x_0 + sqrt(1 - alpha_bar_t) * epsilon

        Args:
            x_0 (torch.Tensor): x_0
            t (torch.Tensor): time steps
            noise (torch.Tensor): noise sampled from N(0, 1)

        Returns:
            torch.Tensor: x_t
        """
        
        return (
            self.beta_scheduler.alphas_bar_sqrt[t] * x_0
            + self.beta_scheduler.one_minus_alphas_bar_sqrt[t] * noise
        )
        
    def p(self, x_t: torch.Tensor, t: torch.Tensor, noise: torch.Tensor, clip_x0=None) -> torch.Tensor:
        """reverse diffusion step — the posterior mean of x_{t-1} given x_t.

        Note:
            mu_t = 1 / sqrt(alpha_t) * (x_t - beta_t / sqrt(1 - alpha_bar_t) * eps)

            (To draw x_{t-1}, add sqrt(beta_t) * z, z ~ N(0, 1), for t > 0.)

        Args:
            x_t (torch.Tensor): x_t
            t (torch.Tensor): time steps
            noise (torch.Tensor): the model-predicted noise eps

        Returns:
            torch.Tensor: posterior mean mu_t (the deterministic part of x_{t-1})
        """

        alpha_t = self.beta_scheduler.alphas[t]
        beta_t = 1 - alpha_t

        if clip_x0 is None:
            # standard eps-form posterior mean
            return (
                1 / torch.sqrt(alpha_t)
                * (x_t - beta_t / self.beta_scheduler.one_minus_alphas_bar_sqrt[t] * noise)
            )

        # clip_denoised best practice: reconstruct the predicted x_0 from eps,
        # clamp it to the (normalized) data range, then recompute the posterior
        # mean q(x_{t-1} | x_t, x_0). This keeps ancestral sampling bounded even
        # when eps is far off (e.g. an untrained model), instead of diverging.
        lo, hi = clip_x0
        x0 = (
            x_t - self.beta_scheduler.one_minus_alphas_bar_sqrt[t] * noise
        ) / self.beta_scheduler.alphas_bar_sqrt[t]
        x0 = x0.clamp(lo, hi)

        alpha_bar_t = self.beta_scheduler.alphas_bar[t]
        alpha_bar_prev = (
            self.beta_scheduler.alphas_bar[t - 1] if t > 0 else torch.ones_like(alpha_bar_t)
        )
        one_minus_alpha_bar_t = 1 - alpha_bar_t
        coef_x0 = beta_t * torch.sqrt(alpha_bar_prev) / one_minus_alpha_bar_t
        coef_xt = (1 - alpha_bar_prev) * torch.sqrt(alpha_t) / one_minus_alpha_bar_t
        return coef_x0 * x0 + coef_xt * x_t
        
    def forward(
        self,
        coordinates: torch.Tensor,
        t: torch.Tensor,
        label_embeddings: torch.Tensor,
    ) -> torch.Tensor:

        time_encoded = self.time_encoder(t)
        coordinate_x_encoded = self.coordinate_encoder_x(coordinates[:, [0]])
        coordinate_y_encoded = self.coordinate_encoder_y(coordinates[:, [1]])

        denoiser_input = torch.cat(
            [time_encoded, coordinate_x_encoded, coordinate_y_encoded, label_embeddings],
            dim=-1,
        )

        noise_predicted = self.denoiser(denoiser_input)

        return noise_predicted
