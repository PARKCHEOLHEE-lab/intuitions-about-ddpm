import os
import torch

from torch.utils.data import DataLoader

from dataset import Datasaurus
from ddpm import DDPM, BetaScheduler


class Trainer:
    def __init__(
        self,
        ddpm: DDPM,
        dataset: Datasaurus,
        optimizer: torch.optim.Optimizer,
        configs: dict,
    ) -> None:

        self.ddpm = ddpm
        self.dataset = dataset
        self.optimizer = optimizer
        self.configs = configs
        
        self.dataloader = DataLoader(
            self.dataset,
            batch_size=self.configs["batch_size"],
            shuffle=True
        )

    def train(self) -> None:
        
        for epoch in range(1, self.configs["epoch"] + 1):

            for xylabels_batch in self.dataloader:
                coordinates = xylabels_batch[:, :2]
                labels = xylabels_batch[:, 2].long()
                
                t = torch.randint(
                    0, 
                    self.configs["num_timesteps"], 
                    size=(self.configs["batch_size"], 1), 
                    device=self.configs["device"]
                )
                
                noise = torch.randn_like(coordinates)
                x_t = self.ddpm.q(x_0=coordinates, t=t, noise=noise)
                
                noise_predicted = self.ddpm(
                    coordinates=x_t,
                    t=t.float(),
                    label_embeddings=self.ddpm.label_embeddings(labels),
                )
                
                loss = torch.nn.functional.mse_loss(noise_predicted, noise)
                
                loss.backward()
                self.optimizer.step()
                self.optimizer.zero_grad()
                
            if epoch % self.configs["visualize_interval"] == 0:
                pass


if __name__ == "__main__":

    configs = {
        "epoch": 100,
        "batch_size": 32,
        "learning_rate": 1e-4,
        "device": "cuda",
        "label_embedding_dim": 32,
        "coordinate_embedding_dim": 128,
        "coordinate_encoder_type": ["linear", "sinusoidal"][1],
        "time_embedding_dim": 128,
        "time_encoder_type": ["linear", "sinusoidal"][1],
        "num_points": 1000,
        "num_timesteps": 1000,
        "num_denoiser_hidden_layers": 4,
        "denoiser_hidden_dim": 128,
        "denoiser_output_dim": 2,
        "denoiser_activation": ["GELU", "ReLU"][0],
        "beta_start": 0.0001,
        "beta_end": 0.02,
        "beta_schedule_type": ["linear", "cosine", "quadratic"][0],
        "visualize_interval": 10,
    }

    dataset = Datasaurus(
        path=os.path.abspath(os.path.join(__file__, "../../data/datasaurus.csv")),
        num_points=configs["num_points"],
        device=configs["device"],
        labels_to_use=["dino"],
    )
    
    beta_scheduler = BetaScheduler(configs=configs)
    
    ddpm = DDPM(
        configs=configs,
        labels=dataset.labels,
        beta_scheduler=beta_scheduler,
    )

    optimizer = torch.optim.AdamW(
        params=ddpm.parameters(),
        lr=configs["learning_rate"],
    )
    
    trainer = Trainer(
        ddpm=ddpm,
        dataset=dataset,
        optimizer=optimizer,
        configs=configs,
    )
    
    trainer.train()