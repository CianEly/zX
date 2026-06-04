import pandas as pd
from pathlib import Path
import csv

def preprocess(row: dict, state: dict, run_dir: Path) -> None:
    dimensions = state.get("dimensions", 10)
    
    input_data = {}
    for d in range(1, dimensions + 1):
        input_data[f"x{d}"] = row[f"x{d}"]
        
    with open(run_dir / "input.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(input_data.keys()))
        writer.writeheader()
        writer.writerow(input_data)
