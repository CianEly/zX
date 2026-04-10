import json
def extract(row, state, run_dir):
    with open(run_dir / "results.json", "r") as f:
        data = json.load(f)
    # The keys in this dict will become NEW columns in your CSV!
    return {"calculated_z": data['result']}
