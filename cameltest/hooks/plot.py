import plotly.express as px
import pandas as pd

def plot(table, state):
    if table.empty or 'calculated_z' not in table.columns:
        return {}
        
    df = table.copy()
    # Ensure numeric
    df['calculated_z'] = pd.to_numeric(df['calculated_z'], errors='coerce')
    df = df.dropna(subset=['calculated_z'])
    
    if df.empty:
        return {}

    fig = px.scatter(df, x='x', y='y', color='calculated_z', 
                     title="Six-Hump Camel Exploration Results",
                     template="plotly_dark")
    
    # Returning the whole figure is now safe because the backend cleans it
    return {"Surface Exploration": fig}
