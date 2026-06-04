import pandas as pd
import random

def initialize(table: pd.DataFrame, state: dict) -> tuple[list[dict], dict]:
    """
    Generate initial population for ZDT1 multi-objective optimization.
    """
    population_size = 40
    dimensions = 10
    
    rows = []
    for _ in range(population_size):
        row = {}
        for d in range(1, dimensions + 1):
            row[f"x{d}"] = random.uniform(0, 1)
        rows.append(row)
        
    state["max_iterations"] = 15
    state["dimensions"] = dimensions
    state["population_size"] = population_size
    
    return rows, state
