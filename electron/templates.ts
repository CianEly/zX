export const hookTemplates: Record<string, string> = {
  'initialize.py': `def initialize(table, state: dict) -> tuple[list[dict], dict]:
    """
    Returns (rows, state).
      - rows: list of input parameter dicts (one dict per row).
      - state: shared global state dict passed to all subsequent hooks.
    If table is empty, generate rows from scratch (e.g., DOE).
    If table has data, transform/augment it as needed.
    """
    # Example: return initial parameters
    rows = [
        {"x1": 0.5, "x2": 0.5},
        {"x1": -0.5, "x2": 0.5}
    ]
    state["max_iterations"] = 10
    
    return rows, state
`,

  'preprocess.py': `import os
from pathlib import Path

def preprocess(row: dict, state: dict, run_dir: Path) -> None:
    """Prepare input files/config in run_dir for the CLI application."""
    # Example: write a simple config file
    with open(run_dir / "input.csv", "w") as f:
        f.write(f"x1,x2\\n{row.get('x1', 0)},{row.get('x2', 0)}\\n")
`,

  'launch.py': `import subprocess
from pathlib import Path

def launch(row: dict, state: dict, run_dir: Path) -> subprocess.CompletedProcess:
    """Launch the CLI application in run_dir. Returns the completed process."""
    # Example: run a bash script or python command
    # result = subprocess.run(["python", "-c", "print('hello world')"], cwd=run_dir, capture_output=True, text=True)
    # return result
    
    # Simple placeholder: just create a DONE file
    (run_dir / "DONE").touch()
    return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
`,

  'extract.py': `import csv
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
`,

  'explore.py': `def explore(table, state: dict) -> list[dict]:
    """
    Analyze completed results and generate new parameter sets.
    Return an empty list to terminate the exploration loop.
    Use state['max_iterations'] to limit iterations.
    """
    current_iter = state.get("iteration", 0)
    if current_iter >= state.get("max_iterations", 10):
        return []
        
    state["iteration"] = current_iter + 1
    
    # Example: suggest simple random mutations
    import random
    new_rows = []
    # logic here to inspect 'table' and pick new points
    # new_rows.append({"x1": random.random(), "x2": random.random()})
    
    return new_rows
`,

  'plot.py': `def plot(table, state: dict) -> dict:
    """
    Generate custom plots.
    Returns a dictionary of plotly figure objects.
    Figures are serialized as Plotly JSON and rendered via react-plotly.js.
    """
    # Example: return empty dict
    return {}
`
}
