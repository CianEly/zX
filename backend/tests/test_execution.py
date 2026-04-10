import os
import requests
import json
import time
import pandas as pd
from pathlib import Path

# Config
BASE_URL = "http://127.0.0.1:8000"
TOKEN = "test-token" # We'll need to set this in the environment when running
PROJECT_DIR = Path("/tmp/zx_test_project") # Use a directory we can easily clean up

def setup_mock_project():
    print(f"Setting up mock project at {PROJECT_DIR}...")
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    (PROJECT_DIR / "hooks").mkdir(exist_ok=True)
    (PROJECT_DIR / "data").mkdir(exist_ok=True)

    # 1. Create CSV
    df = pd.DataFrame([
        {"_zx_row_id": 0, "x": 10},
        {"_zx_row_id": 1, "x": 20}
    ])
    df.to_csv(PROJECT_DIR / "zx_database.csv", index=False)

    # 2. Create Hooks
    # Preprocess
    with open(PROJECT_DIR / "hooks" / "preprocess.py", "w") as f:
        f.write("""
def preprocess(row, state, run_dir):
    with open(run_dir / "input.txt", "w") as f:
        f.write(str(row['x']))
""")

    # Launch
    with open(PROJECT_DIR / "hooks" / "launch.py", "w") as f:
        f.write("""
import subprocess
def launch(row, state, run_dir):
    # Simple mock: cat input.txt to output.txt
    subprocess.run(["cp", "input.txt", "output.txt"], cwd=run_dir, check=True)
""")

    # Extract
    with open(PROJECT_DIR / "hooks" / "extract.py", "w") as f:
        f.write("""
def extract(row, state, run_dir):
    with open(run_dir / "output.txt", "r") as f:
        val = int(f.read().strip())
    return {"y": val * 2}
""")

def run_test():
    headers = {"Authorization": f"Bearer {TOKEN}"}
    
    # 1. Trigger Execution
    print("Triggering execution for row 0 and 1...")
    payload = {
        "project_path": str(PROJECT_DIR),
        "row_ids": [0, 1],
        "dry_run": False
    }
    
    resp = requests.post(f"{BASE_URL}/execute", json=payload, headers=headers)
    print("Response:", resp.json())
    
    if resp.status_code != 200:
        print("Failed to trigger execution")
        return

    # 2. Poll for completion
    print("Polling for status updates...")
    for _ in range(10):
        time.sleep(1)
        df = pd.read_csv(PROJECT_DIR / "zx_database.csv")
        print(df[["_zx_row_id", "_zx_status", "_zx_hook_stage", "y"]].to_string())
        
        if all(df["_zx_status"] == "completed"):
            print("--- SUCCESS: All rows completed ---")
            break
    else:
        print("--- TIMEOUT: rows did not complete in time ---")

if __name__ == "__main__":
    setup_mock_project()
    # Note: This assumes the backend is running with ZX_API_TOKEN=test-token
    # run_test()
