import torch

from torch.utils.data import DataLoader

from dataset import Datasaurus
from ddpm import DDPM


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

        for _ in range(self.configs["epoch"]):

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
