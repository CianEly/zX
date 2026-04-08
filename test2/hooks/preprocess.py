import os
from pathlib import Path

def preprocess(row: dict, state: dict, run_dir: Path) -> None:
    """Prepare input files/config in run_dir for the CLI application."""
    # Example: write a simple config file
    with open(run_dir / "input.csv", "w") as f:
        f.write(f"x1,x2\n{row.get('x1', 0)},{row.get('x2', 0)}\n")
