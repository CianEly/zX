def initialize(table, state: dict) -> tuple[list[dict], dict]:
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
