import csv
from pathlib import Path

def extract(row: dict, state: dict, run_dir: Path) -> dict:
    """Extract output parameters from run_dir. Returns dict of results to merge into CSV."""
    # Example: Parse output.csv
    # with open(run_dir / "output.csv", "r") as f:
    #     reader = csv.DictReader(f)
    #     for out_row in reader:
    #         return {"f1": float(out_row["f1"])}
    
    # Placeholder return
    return {"obj_value": 42.0}
