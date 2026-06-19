def initialize(table, state: dict) -> tuple[list[dict], dict]:
    """
    Returns (rows, state).
      - rows: list of input parameter dicts (one dict per row).
      - state: shared global state dict passed to all subsequent hooks.
    """
    state["max_iterations"] = 10

    # If the user has already imported or added rows, don't generate new ones!
    # Returning [] tells the engine to just run the pending rows in the database.
    if not table.empty:
        return [], state
        
    # Otherwise, generate a small grid of initial parameters
    import numpy as np
    
    x_vals = np.linspace(-2, 2, 5)
    y_vals = np.linspace(-1, 1, 5)
    
    rows = []
    for x in x_vals:
        for y in y_vals:
            rows.append({"x": round(float(x), 3), "y": round(float(y), 3)})
            
    return rows, state
