import subprocess
from pathlib import Path

def launch(row: dict, state: dict, run_dir: Path) -> subprocess.CompletedProcess:
    """Launch the CLI application in run_dir. Returns the completed process."""
    # Example: run a bash script or python command
    # result = subprocess.run(["python", "-c", "print('hello world')"], cwd=run_dir, capture_output=True, text=True)
    # return result
    
    # Simple placeholder: just create a DONE file
    (run_dir / "DONE").touch()
    return subprocess.CompletedProcess(args=[], returncode=0, stdout="", stderr="")
