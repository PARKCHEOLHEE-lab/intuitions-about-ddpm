import os
import torch
import pandas as pd

from torch.utils.data import Dataset, DataLoader


class Datasaurus(Dataset):
    # https://www.openintro.org/data/csv/datasaurus.csv
    
    LABELS = {
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
    
    for li, label in enumerate(LABELS.keys()):
        LABELS[label] = li
    
    def __init__(
        self, 
        path: str, 
        num_points: int = 1000, 
        device: str = "cuda"
    ) -> None:
    
        super().__init__()
        
        assert os.path.exists(path)
        assert isinstance(num_points, int) and num_points > 0
        
        self.path = path
        self.num_points = num_points
        self.device = device
        
        self._dataframe = pd.read_csv(self.path)
        self.dataframe = self._dataframe.copy()
        self.dataframe = self.dataframe[self.dataframe["dataset"].isin(self.LABELS.keys())]
        
        # convert text label into integer label
        self.dataframe["label"] = [self.LABELS[label] for label in self.dataframe["dataset"].tolist()]
        
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
        
        jitter_x_std = templates[:, 0].var() * 0.25
        jitter_y_std = templates[:, 1].var() * 0.25
        
        xylabels = []
        for label in self.LABELS.values():
            jitter_x = torch.normal(mean=0, std=jitter_x_std, size=(self.num_points, 1))
            jitter_y = torch.normal(mean=0, std=jitter_y_std, size=(self.num_points, 1))
            jitter = torch.hstack([jitter_x, jitter_y])
            
            template = templates[templates[:, 2] == label]
            xylabel = template.repeat((self.num_points // template.shape[0]) + 1, 1)[:self.num_points]
            xylabel[:, :2] += jitter

            xylabels.append(xylabel)

        # shape: (len(LABELS) * num_points, 3)
        self.xylabels = torch.vstack(xylabels)
        
        assert self.xylabels.shape == (len(self.LABELS) * num_points, 3)
        
    def __len__(self) -> int:
        return self.xylabels.shape[0]
    
    def __getitem__(self, i: int) -> torch.Tensor:
        return self.xylabels[i].to(self.device)
    