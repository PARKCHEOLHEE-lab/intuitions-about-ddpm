import os
import torch
import pandas as pd

from typing import List
from torch.utils.data import Dataset


class Datasaurus(Dataset):
    """Dataset from https://www.openintro.org/data/csv/datasaurus.csv
    """
        
    def __init__(
        self,
        path: str,
        num_points: int = 1000,
        device: str = "cuda",
        labels_to_use: List[str] = None,
        jitter_scale: float = 1.0,
    ) -> None:

        super().__init__()

        assert os.path.exists(path)
        assert isinstance(num_points, int) and num_points > 0

        self.path = path
        self.num_points = num_points
        self.device = device
        self.labels_to_use = labels_to_use
        # scales the per-shape jitter; < 1 keeps the template sharp (useful when
        # the goal is to reproduce the exact point set, not a broad density)
        self.jitter_scale = jitter_scale
        
        self.labels = {
            "bullseye":None,
            "circle":None,
            "dino":None,
            "dots":None,
            "h_lines":None,
            "slant_down":None,
            "slant_up":None,
            "star":None,
            "v_lines": None,
            "x_shape": None,
        }
        
        if self.labels_to_use is not None:
            self.labels = {label: self.labels[label] for label in self.labels_to_use}
            
        for li, label in enumerate(self.labels.keys()):
            self.labels[label] = li
        
        self._dataframe = pd.read_csv(self.path)
        self.dataframe = self._dataframe.copy()
        self.dataframe = self.dataframe[self.dataframe["dataset"].isin(self.labels.keys())]
        
        # convert text label into integer label
        self.dataframe["label"] = [self.labels[label] for label in self.dataframe["dataset"].tolist()]
        
        # (x, y, label)
        templates = torch.vstack(
            [
                torch.tensor(self.dataframe.x.tolist()),
                torch.tensor(self.dataframe.y.tolist()),
                torch.tensor(self.dataframe.label.tolist())
            ]
        ).T
        
        # normalize using max norm
        templates[:, :2] = templates[:, :2] / templates[:, :2].norm(dim=1).max()
        
        jitter_x_std = templates[:, 0].var() * 0.25 * self.jitter_scale
        jitter_y_std = templates[:, 1].var() * 0.25 * self.jitter_scale
        
        xylabels = []
        for label in self.labels.values():
            jitter_x = torch.normal(mean=0, std=jitter_x_std, size=(self.num_points, 1))
            jitter_y = torch.normal(mean=0, std=jitter_y_std, size=(self.num_points, 1))
            jitter = torch.hstack([jitter_x, jitter_y])
            
            template = templates[templates[:, 2] == label]
            xylabel = template.repeat((self.num_points // template.shape[0]) + 1, 1)[:self.num_points]
            xylabel[:, :2] += jitter

            xylabels.append(xylabel)

        # shape: (len(LABELS) * num_points, 3)
        self.xylabels = torch.vstack(xylabels)
        
        assert self.xylabels.shape == (len(self.labels) * num_points, 3)
        
    def __len__(self) -> int:
        return self.xylabels.shape[0]
    
    def __getitem__(self, i: int) -> torch.Tensor:
        return self.xylabels[i].to(self.device)
    