import subprocess
import sys
from pathlib import Path

def launch(row: dict, state: dict, run_dir: Path) -> subprocess.CompletedProcess:
    # Run the zdt1_cli.py script which is located in the project root
    cli_path = run_dir.parent.parent / "zdt1_cli.py"
    return subprocess.run([sys.executable, str(cli_path)], cwd=run_dir, capture_output=True, text=True, check=True)
