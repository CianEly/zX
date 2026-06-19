# zX: Parametric Exploration Engine
**Comprehensive Application Documentation**

zX is a powerful, desktop-based parametric exploration engine designed to automate the iterative testing of complex engineering, mathematical, or scientific models. It provides a visual IDE for defining parameter spaces, writing lifecycle hooks in Python, executing multi-threaded exploration loops, and analyzing results in real-time.

---

## Architecture Overview

zX is built on a modern, hybrid architecture designed for performance and flexibility:

- **Frontend (UI)**: Built with **React**, **TypeScript**, and **Vite**, packaged as a native desktop application using **Electron**. It uses `xterm.js` for integrated terminals and `Plotly.js` for high-performance 2D/3D data visualization.
- **Backend (Execution Engine)**: Built with **Python** and **FastAPI**. The backend runs as an invisible background process that manages the execution of user-defined Python hooks, file I/O operations, and parallel multiprocessing for the parametric sweeps.
- **IPC Bridge**: Communication between the Electron frontend and the Python backend occurs via an Inter-Process Communication (IPC) bridge, leveraging WebSockets and REST APIs for real-time streaming of logs, progress, and chart data.

---

## Core Features & Interface

### 1. Connection Wizard (Local & Remote)
zX supports running your parametric explorations either locally on your own machine or securely on a remote server. The Connection Wizard acts as the gatekeeper, ensuring the backend engine is running and reachable before you can interact with your project.

**Local Connection Flow:**
- The Electron frontend automatically locates the bundled Python executable or the local `uv` environment.
- It spawns the FastAPI backend natively as a background child process.
- Once the backend is live on localhost, the UI connects and unlocks the exploration tools.

**Remote Connection Flow (SSH Bootstrapping):**
When connecting to a remote Linux server or Docker container, zX orchestrates a complex, fully-automated bootstrapping sequence over SSH (`ssh2` library):
1. **Upload Local Project (Optional)**: If selected, zX compresses your local project directory into a tarball, transfers it via SFTP, and extracts it directly into the remote path. This prevents you from needing external tools to sync your existing projects.
2. **Authentication**: Establishes an SSH connection using your Host IP, Port, Username, and Password/Identity File.
2. **Environment Prep**: Uses `curl` to silently install `uv` (Astral's lightning-fast Python package manager) onto the remote machine.
3. **Deployment**: Uses SFTP to securely upload the `zx_backend` Python `.whl` (wheel) binary from your local machine to the remote server.
4. **Virtual Environment**: Creates a fresh, isolated Python virtual environment (`venv`) on the remote server using `uv` and installs the uploaded backend wheel.
5. **Launch Engine**: Spawns the `uvicorn` FastAPI server on the remote machine as a background process.
6. **Port Forwarding**: Establishes a secure SSH tunnel (e.g., forwarding local port `8000` to remote port `8000`). This ingenious step makes the Electron frontend think it's communicating with a local backend, requiring zero changes to the UI's API logic.

### 2. Parameter Grid (Design Space)
The starting point for any exploration. 
- You define your variables, bounds, and constants in a `.csv` format (default: `zx_database.csv`).
- The grid visually represents your design space, allowing you to seamlessly import, edit, and export your testing parameters.

### 3. Hook Editor (Execution Logic)
zX uses a "Hook" based lifecycle. Instead of writing a massive monolithic script, you write small, focused Python scripts (`hooks`) that execute at specific points in the exploration loop.
- **`initialize.py`**: Runs once at the very beginning to set up the environment or load heavy ML models into memory.
- **`launch.py`**: The core execution script. It receives a specific parameter combination and runs your simulation or logic.
- **`extract.py`**: Runs after launch to extract meaningful data, metrics, or KPIs from the raw simulation output.
- **`evaluate.py`**: Aggregates the extracted data to determine success/failure or calculate a fitness score.

*The Hook Editor provides a built-in code editor with syntax highlighting to edit these files directly within the app.*

### 4. File Explorer
A fully integrated file manager that handles both local directories and remote SFTP file systems.
- Automatically scaffolds the required `data`, `hooks`, and `runs` directories when a new project is initialized.
- Allows you to view, rename, read, and delete files on the remote server without ever leaving the application.

### 5. Parametric Execution & Visualization
Once the parameters and hooks are defined, you can hit **Run**.
- The backend automatically calculates the permutations of your parameter space and spins up multi-threaded worker pools to execute `launch.py` in parallel.
- **Real-Time Visuals**: As data is extracted and evaluated, the results are streamed back to the frontend via WebSockets and rendered onto a dynamic, interactive Plotly dashboard.

### 6. Global App Console (Terminal)
An IDE-like developer console built into the app.
- **App Console**: A persistent, read-only terminal that intercepts and displays all standard output (`stdout`) and error (`stderr`) logs from the Python backend. It shows initialization steps, SSH handshakes, and Python `print()` statements.
- **Interactive Shells**: You can horizontally or vertically split the terminal view to spawn standard, interactive bash/zsh shells directly into your local machine or remote server.

---

## The Execution Lifecycle

When you trigger a run, the following automated sequence occurs behind the scenes:

1. **Bootstrap**: The backend parses `zx_database.csv` to generate a list of all parameter combinations (Runs).
2. **Setup**: The `initialize.py` hook is executed once to prepare global state.
3. **Dispatch**: The backend creates a unique directory in the `runs/` folder for each parameter combination (e.g., `runs/run_0`, `runs/run_1`).
4. **Execution**: A multiprocessing pool distributes the runs. For each run:
   - `input.json` is generated containing the specific parameters.
   - `launch.py` is invoked.
   - `extract.py` is invoked to produce `results.json`.
5. **Aggregation**: `evaluate.py` processes the collective results, and the final data points are streamed to the frontend plotting engine.

> [!TIP]
> **Best Practice**: Keep your hooks modular. `launch.py` should only handle the execution of your core logic, while `extract.py` should solely focus on parsing the output files. This separation makes your exploration robust and easier to debug.

---

## Quick-Start Tutorial: Connecting Remotely

If you are running computationally expensive models, you'll likely want to offload the execution to a remote Linux server or cloud instance. Here is a step-by-step guide on how to establish a remote connection in zX:

### Step 1: Launch the Connection Wizard
1. Open zX and click the **Remote** toggle on the starting Connection Wizard screen.
2. Under "Project Path", enter the absolute path on your remote server where you want your project to live (e.g., `~/my_exploration` or `/root/remote_project`).

### Step 2: Enter SSH Credentials
Fill in the SSH connection details for your remote machine:
- **Host**: The IP address or hostname of your server (e.g., `192.168.1.100` or `ec2-xxx.compute.amazonaws.com`).
- **Port**: Typically `22` (or `2222` if you are connecting to a local Docker container for testing).
- **Username**: Your SSH username (e.g., `ubuntu`, `root`, `ec2-user`).
- **Authentication**: Enter your password, OR provide the absolute path to your private identity file (e.g., `~/.ssh/id_rsa` or `C:\Users\Name\.ssh\id_ed25519`).
### Step 3: Upload Local Project (Optional)
If you already have a local zX project on your machine (like `cameltest`), you can seamlessly push it to the remote server:
1. Check the **Upload a local project to this remote path** box.
2. Click **Browse** and select your local project folder.

### Step 4: Connect and Scaffold
Click **Connect**. You can switch over to the **Terminal** tab to watch the **App Console** perform the remote handshake. 

Behind the scenes, zX is:
1. Connecting to the server.
2. Installing Python `uv`.
3. Pushing the `zx_backend` executable.
4. Setting up a secure SSH port-forwarding tunnel.
5. (Optional) Zipping, uploading, and extracting your local project.

*Once the connection succeeds, the UI will unlock. If you didn't upload a local project, zX will automatically scaffold the `data/`, `hooks/`, and `runs/` directories inside your designated project path on the remote server.*

### Step 5: Define Parameters & Hooks
1. Navigate to the **Files** tab. You should see your newly scaffolded (or uploaded) directories.
2. Go to the **Parameters** tab and create a new `zx_database.csv`. Define the variables you want to sweep across.
3. Switch to the **Hooks** tab. zX will have populated default templates for `initialize.py`, `launch.py`, `extract.py`, and `evaluate.py`. Edit these scripts directly in the app to integrate your custom logic.

### Step 6: Run Your Exploration
With your parameters defined and your hooks ready, head over to the **Explore** tab and click **Run**. zX will dispatch the execution pool on your remote server, and you'll see the results stream live into your local dashboard!
