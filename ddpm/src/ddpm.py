import torch
import torch.nn as nn


class SinusoidalEncoder(nn.Module):
    # positional embedding for coordinates
    
    def __init__(self, embedding_dim: int) -> None:
        super().__init__()

        self.embedding_dim = embedding_dim
        
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

        embedding = tensor_to_encode @ w
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
        
        # set coordinate encoder
        if self.configs["coordinate_encoder_type"] == "sinusoidal":
            self.coordinate_encoder_x = SinusoidalEncoder(self.configs["coordinate_embedding_dim"])
            self.coordinate_encoder_y = SinusoidalEncoder(self.configs["coordinate_embedding_dim"])
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

        denoiser_layers = [
            nn.Linear(self.denoiser_input_dim, self.configs["denoiser_hidden_dim"]),
            getattr(nn, self.configs["denoiser_activation"])(),
        ]
        
        for _ in range(self.configs["num_denoiser_hidden_layers"]):
            denoiser_layers.extend(
                [
                    nn.Linear(self.configs["denoiser_hidden_dim"], self.configs["denoiser_hidden_dim"]),
                    getattr(nn, self.configs["denoiser_activation"])(),
                ]
            )
            
        denoiser_layers.append(
            nn.Linear(self.configs["denoiser_hidden_dim"], self.configs["denoiser_output_dim"]),
        )

        self.denoiser = nn.Sequential(*denoiser_layers)

        self.to(self.configs["device"])
    
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
        
    def p(self, x_t: torch.Tensor, t: torch.Tensor, noise: torch.Tensor) -> torch.Tensor:
        """do reverse diffusion process.
        
        Note: 
            x_t = sqrt(alpha_bar_t) * x_0 + sqrt(1 - alpha_bar_t) * epsilon
            x_t - sqrt(1 - alpha_bar_t) * epsilon = sqrt(alpha_bar_t) * x_0
            1 / sqrt(alpha_bar_t) * (x_t - sqrt(1 - alpha_bar_t) * epsilon) = x_0
            
        Args:
            x_t (torch.Tensor): x_t
            t (torch.Tensor): time steps
            noise (torch.Tensor): noise sampled from N(0, 1)

        Returns:
            torch.Tensor: x_{t-1}
        """
        
        return (
            1 / self.beta_scheduler.alphas_bar_sqrt[t] 
            * (x_t - self.beta_scheduler.one_minus_alphas_bar_sqrt[t] * noise)
        )
        
    def forward(
        self, 
        coordinates: torch.Tensor, 
        t: torch.Tensor, 
        label_embeddings: torch.Tensor
    ) -> torch.Tensor:

        time_encoded = self.time_encoder(t)
        coordinate_x_encoded = self.coordinate_encoder_x(coordinates[:, [0]])
        coordinate_y_encoded = self.coordinate_encoder_y(coordinates[:, [1]])
        
        denoiser_input = torch.cat(
            [
                time_encoded,
                coordinate_x_encoded,
                coordinate_y_encoded,
                label_embeddings,
            ],
            dim=-1
        )
        
        noise_predicted = self.denoiser(denoiser_input)

        return noise_predicted