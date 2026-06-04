import pandas as pd
import plotly.express as px

def plot(table: pd.DataFrame, state: dict) -> dict:
    completed = table[table["_zx_status"] == "completed"].copy()
    if len(completed) == 0 or "f1" not in completed.columns or "f2" not in completed.columns:
        return {}
        
    fig = px.scatter(
        completed, 
        x="f1", 
        y="f2", 
        color="_zx_iteration",
        title="ZDT1 Pareto Front Evolution",
        labels={"f1": "Objective 1 (f1)", "f2": "Objective 2 (f2)"},
        color_continuous_scale="Viridis"
    )
    
    fig.update_layout(
        template="plotly_dark",
        margin=dict(l=40, r=40, t=60, b=40)
    )
    
    return {"pareto_front": fig}
