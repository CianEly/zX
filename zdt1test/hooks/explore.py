import pandas as pd
import numpy as np
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import Problem
from pymoo.operators.crossover.sbx import SBX
from pymoo.operators.mutation.pm import PM
from pymoo.core.population import Population
from pymoo.core.evaluator import Evaluator
from pymoo.core.individual import Individual

class CustomZDT1(Problem):
    def __init__(self, n_var):
        super().__init__(n_var=n_var, n_obj=2, n_eq_ineq=0, xl=0.0, xu=1.0)
        
    def _evaluate(self, x, out, *args, **kwargs):
        # We don't actually evaluate in pymoo, we just need the problem definition for operators
        pass

def explore(table: pd.DataFrame, state: dict) -> list[dict]:
    max_iters = state.get("max_iterations", 15)
    
    1/0

    if max_iters <= 0:
        return [] # Terminate
        
    state["max_iterations"] = max_iters - 1
    
    dimensions = state.get("dimensions", 10)
    pop_size = state.get("population_size", 40)
    
    # Get the latest completed population
    completed = table[table["_zx_status"] == "completed"].copy()
    if len(completed) < pop_size or "f1" not in completed.columns or "f2" not in completed.columns:
        return []
        
    # Take the last `pop_size` rows (this assumes the last pop_size rows are the current generation)
    # A safer way is to group by _zx_iteration, but this works fine for our simple cascade loop
    latest_pop = completed.tail(pop_size)
    
    X = []
    F = []
    for _, row in latest_pop.iterrows():
        x_row = [float(row[f"x{d}"]) for d in range(1, dimensions + 1)]
        X.append(x_row)
        F.append([float(row["f1"]), float(row["f2"])])
        
    X = np.array(X)
    F = np.array(F)
    
    problem = CustomZDT1(n_var=dimensions)
    
    pop = Population.new(X=X)
    pop.set("F", F)
    pop.set("CV", np.zeros((pop_size, 1)))
    pop.set("CV", np.zeros((pop_size, 1)))
    
    algorithm = NSGA2(pop_size=pop_size)
    algorithm.setup(problem)
    
    # Assign Rank and Crowding Distance
    survivors = algorithm.survival.do(problem, pop, n_survive=pop_size, algorithm=algorithm)
    
    # Mating
    offspring = algorithm.mating.do(problem, survivors, pop_size, algorithm=algorithm)
    
    X_new = offspring.get("X")
    
    new_rows = []
    for i in range(pop_size):
        x_val = np.clip(X_new[i], 0.0, 1.0)
        row_dict = {}
        for d in range(1, dimensions + 1):
            row_dict[f"x{d}"] = float(x_val[d-1])
        new_rows.append(row_dict)
        
    return new_rows
