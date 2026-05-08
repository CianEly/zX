# zX: Next Steps Roadmap

We have successfully implemented the core Iterative Exploration Loop and a stable Visualization Dashboard. The next phase will focus on improving the developer experience and ensuring full feature parity in remote environments.

## 1. Advanced IDE Features
- **Monaco Editor Integration**: Replace the simple text area in the "Hooks" tab with a full Monaco instance (VS Code-like editing).
- **File Tree Explorer**: Add a sidebar to the workspace to allow users to browse and open hook/data files directly.
- **Terminal Emulator**: Integrate `xterm.js` into the "Terminal" tab to allow direct shell access to the execution environment (local or remote).

## 2. Remote Environment Validation (CRITICAL)
- **Feature Parity**: Ensure that the new Exploration Loop and Plotly Dashboard work seamlessly when connected to a remote target.
- **Dependency Management**: Verify that `plotly.js-dist` and other new dependencies are correctly handled during remote deployment (SFTing the wheel).
- **Security**: Double-check that the API token and CORS settings are correctly enforced on remote FastAPI instances.

## 3. Parametric Enhancements
- **Multi-Objective Support**: Test and refine the `explore` hook for multi-objective optimization (e.g., ZDT1).
- **Dynamic Chart Configuration**: Allow users to customize chart types and axes from the UI without editing `plot.py`.
- **Row Interactions**: Enable "Click on Plot to Select Row" functionality to bridge the gap between visualization and data management.

## 4. UI/UX Polish
- **Execution Progress**: Add a global progress bar for the entire exploration cycle.
- **Theme Sync**: Ensure Monaco and Plotly themes are perfectly synchronized with the zX dark mode.

---

> [!IMPORTANT]
> **REMOTE NOTE**: Before the next major feature, we must perform a full end-to-end test on a remote Linux target to ensure the `to_json_ready` serialization and the Plotly bundling behave correctly over the network.
