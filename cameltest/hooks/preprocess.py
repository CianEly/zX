def preprocess(row, state, run_dir):
    # Pass the x and y values to the simulation
    with open(run_dir / "input.json", "w") as f:
        import json
        json.dump({"x": float(row['x']), "y": float(row['y'])}, f)