import torch
import torch.nn as nn


class SinusoidalEncoder(nn.Module):
    # positional embedding for coordinates
    
    def __init__(self, embedding_dim: int) -> None:
        super().__init__()

        self.embedding_dim = embedding_dim
        
    def forward(self, coordinate: torch.Tensor) -> torch.Tensor:
        # a^b = e^{b log(a)}
        # 10000^{-2i/d} = exp(-2i/d log(10000))
        # d = 2*half, 10000^{-2i/(2*half)} = 10000^{-i/half} 
        
        half = self.embedding_dim // 2
        
        i = torch.arange(half)
        f = torch.log(torch.tensor(10000)) / (half - 1)
        w = torch.exp(-f * i).unsqueeze(0).to(coordinate.device)

        embedding = coordinate @ w
        embedding = torch.cat((torch.sin(embedding), torch.cos(embedding)), dim=-1)

        return embedding

        
class NoiseScheduler:
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
    
    def q_sample(self, x0, t):
        return (
            self.alphas_bar_sqrt[t] * x0
            + self.one_minus_alphas_bar_sqrt[t] * torch.randn_like(x0)
            )


class DDPM(nn.Module):
    def __init__(self, configs: dict, labels: dict[str, int]):
        super().__init__()
        
        self.configs = configs
        self.labels = labels
        
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
            self.configs["coordinate_embedding_dim"] 
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
        
    def p(self):
        return
        
    def forward(self, coordinates: torch.Tensor, t: torch.Tensor, label_embeddings: torch.Tensor):

        time_encoded = self.time_encoder(t)
        coordinate_x_encoded = self.coordinate_encoder_x(coordinates[:, [0]])
        coordinate_y_encoded = self.coordinate_encoder_y(coordinates[:, [1]])

        torch.cat()
        
        return