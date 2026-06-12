# zX: Parametric Exploration Engine

**zX** is a desktop application designed to orchestrate and execute automated parametric exploration and multi-objective optimization loops. It provides a robust, visual interface to connect to local or remote compute environments, manage optimization parameters, and interactively explore results.

## 🚀 The Vision
Parametric modeling and simulation tools (like EnergyPlus, OpenFOAM, etc.) are often incredibly tedious to run sequentially. Setting up an optimization loop usually requires writing messy, one-off bash or Python scripts. 

zX solves this by acting as a **language-agnostic, decoupled orchestration engine**. You provide the simulation logic via simple Python hooks, and zX handles the heavy lifting: state management, execution looping, remote SSH tunneling, progress tracking, and live visualization.

## 🏗 Architecture

zX uses a dual-backend architecture to bridge the gap between a sleek desktop UI and heavy-duty scientific computing.

- **Frontend (UI)**: Built with **React, TypeScript, and Vite**, running inside **Electron**. This provides the desktop container and handles all user interactions, file management, and Plotly-based data visualization.
- **Node Layer (Electron Main Process)**: Handles local file I/O, spawns the local Python backend, and manages SSH tunnels to connect the UI to remote High-Performance Computing (HPC) clusters.
- **Python Backend**: A **FastAPI** server that runs the actual optimization loop. It uses `pandas` for data state and `pymoo` for executing genetic algorithms like NSGA-II.

## ⚙️ How It Works (The Hook System)

zX knows nothing about your specific simulation. Instead, it relies on a set of user-defined Python scripts (Hooks) stored in your project's `hooks/` directory. 

The backend iterates over your parameter database and calls your hooks at specific lifecycle stages:
1. `initialize.py`: Generates the initial population of parameters.
2. `preprocess.py`: Reads the parameters and writes input files for your simulation.
3. `launch.py`: Triggers your external simulation CLI via a subprocess.
4. `extract.py`: Parses your simulation's output files and returns the objective scores.
5. `explore.py`: Reads the completed database, runs an optimization algorithm, and generates the next iteration of parameters.
6. `plot.py`: Generates custom Plotly JSON schemas for the UI to render.

## 💻 Running the App Locally

To develop or run the application locally on your machine:

1. **Install Node dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```
   *Note: This command concurrently starts the Vite dev server, compiles the Electron main process, and spawns the Python FastAPI backend in the background.*

## 📂 Project Structure

```text
zX/
├── src/                  # React Frontend (UI Components, Views, CSS)
├── electron/             # Electron Main Process (IPC, SSH, Spawning)
├── backend/              # Python FastAPI Server (The Runner Engine)
│   ├── zx/               # Core Python modules
│   └── pyproject.toml    # Python dependencies
└── package.json          # Node dependencies and scripts
```
