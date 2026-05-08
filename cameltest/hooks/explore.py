def explore(table, state: dict) -> list[dict]:
    # Ensure we don't loop forever
    current_iter = state.get("_zx_iteration", 0)
    if current_iter >= 2: # Only 2 iterations for testing
        return []
        
    print(f"Exploration Hook: generating new rows for iteration {current_iter + 1}")
    
    # Just generate 2 more random points
    import random
    return [
        {"x": random.uniform(-2, 2), "y": random.uniform(-1, 1)},
        {"x": random.uniform(-2, 2), "y": random.uniform(-1, 1)}
    ]
