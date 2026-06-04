import pandas as pd
from pathlib import Path
import csv

def extract(row: dict, state: dict, run_dir: Path) -> dict:
    results = {}
    output_csv = run_dir / "output.csv"
    if output_csv.exists():
        with open(output_csv, "r") as f:
            reader = csv.DictReader(f)
            res = next(reader)
            results["f1"] = float(res["f1"])
            results["f2"] = float(res["f2"])
    return results
