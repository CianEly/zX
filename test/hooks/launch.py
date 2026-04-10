import subprocess
import sys
def launch(row, state, run_dir):
    # This simulates a complex math solver
    script = """
import json
import math
with open('input.json', 'r') as f:
    data = json.load(f)
x = data['x']
y = data['y']
# Six-hump camel function: 
# f(x,y) = (4 - 2.1*x^2 + x^4/3)*x^2 + x*y + (-4 + 4*y^2)*y^2
z = (4 - 2.1*x**2 + x**4/3)*x**2 + x*y + (-4 + 4*y**2)*y**2
with open('results.json', 'w') as f:
    json.dump({'result': z}, f)
"""
    # Run the script inside the run directory
    subprocess.run([sys.executable, "-c", script], cwd=run_dir, check=True)