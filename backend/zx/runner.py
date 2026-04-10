import asyncio
import pandas as pd
import os
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import List, Callable, Dict, Any, Optional
import contextlib

from .hooks import HookManager

class ExecutionRunner:
    def __init__(self, project_path: str, db_filename: str = "zx_database.csv", on_update: Callable = None):
        self.project_path = Path(os.path.expanduser(project_path)).resolve()
        
        # Search for the database file
        root_path = self.project_path / db_filename
        data_path = self.project_path / "data" / db_filename
        
        if root_path.exists():
            self.db_path = root_path
        elif data_path.exists():
            self.db_path = data_path
        else:
            # Default to root if not found, it will raise FileNotFoundError on read
            self.db_path = root_path
            
        self.hook_manager = HookManager(str(self.project_path))
        self.on_update = on_update
        
        self.is_running = False
        self.should_stop = False
        self.current_task = None
        self.state = {}

    async def _emit_update(self, row_id: int, status: str, stage: str = "", error: str = ""):
        if self.on_update:
            data = {
                "row_id": int(row_id),
                "status": status,
                "stage": stage,
                "error": error,
                "updated_at": datetime.now().isoformat()
            }
            if asyncio.iscoroutinefunction(self.on_update):
                await self.on_update(data)
            else:
                self.on_update(data)

    def _update_csv(self, row_id: int, updates: Dict[str, Any]):
        df = pd.read_csv(self.db_path)
        
        # Ensure _zx_ columns exist and are treated as strings
        zx_cols = ["_zx_status", "_zx_hook_stage", "_zx_error", "_zx_started_at", "_zx_completed_at", "_zx_run_dir"]
        for col in zx_cols:
            if col not in df.columns:
                df[col] = "" # Initialize as string
            else:
                # Force to string if currently float/NaN
                df[col] = df[col].fillna("").astype(object)

        # Force any new update keys to be strings initially if they don't exist
        for k in updates.keys():
            if k not in df.columns:
                df[k] = ""
                df[k] = df[k].astype(object)

        # Update specific row
        # row_id should correspond to _zx_row_id column if present, or index
        if "_zx_row_id" in df.columns:
            mask = df["_zx_row_id"] == row_id
            for k, v in updates.items():
                df.loc[mask, k] = v
        else:
            # Fallback to index if _zx_row_id is not yet initialized
            for k, v in updates.items():
                df.at[row_id, k] = v
        
        df.to_csv(self.db_path, index=False)

    def _setup_run_dir(self, row_id: int) -> Path:
        run_dir = self.project_path / f"run_{row_id}"
        run_dir.mkdir(parents=True, exist_ok=True)
        return run_dir

    @contextlib.contextmanager
    def _capture_logs(self, run_dir: Path):
        log_path = run_dir / "zx_hook.log"
        with open(log_path, "a", encoding="utf-8") as f:
            # We wrap the file so it can handle being passed around
            # but for simple stdout/stderr capture we can just redirect
            old_stdout = sys.stdout
            old_stderr = sys.stderr
            sys.stdout = f
            sys.stderr = f
            try:
                yield f
            finally:
                sys.stdout = old_stdout
                sys.stderr = old_stderr

    async def run_rows(self, row_ids: List[int], dry_run: bool = False):
        if self.is_running:
            return
        
        self.is_running = True
        self.should_stop = False
        
        try:
            # 1. Initialize (Optional)
            init_hook = self.hook_manager.get_initialize()
            if init_hook and not dry_run:
                print(f"Running initialization hook...")
                # We might need to pass the whole table here if the spec says so
                df = pd.read_csv(self.db_path)
                # tuple[list[dict], dict]
                new_rows, new_state = init_hook(df, self.state)
                self.state.update(new_state)
                # Note: If init generates rows, we'd need to append them to the CSV here.
                # For now, following the simple loop.

            for rid in row_ids:
                if self.should_stop:
                    print("Execution stopped by user.")
                    break

                await self._execute_row(rid, dry_run)

        finally:
            self.is_running = False
            self.should_stop = False

    async def _execute_row(self, row_id: int, dry_run: bool):
        run_dir = self._setup_run_dir(row_id)
        
        # Start
        await self._emit_update(row_id, "running", "starting")
        self._update_csv(row_id, {
            "_zx_status": "running",
            "_zx_started_at": datetime.now().isoformat(),
            "_zx_run_dir": str(run_dir)
        })

        df = pd.read_csv(self.db_path)
        if "_zx_row_id" in df.columns:
            row_dict = df[df["_zx_row_id"] == row_id].iloc[0].to_dict()
        else:
            row_dict = df.iloc[row_id].to_dict()

        stages = [
            ("preprocessing", self.hook_manager.get_preprocess()),
            ("launching", self.hook_manager.get_launch()),
            ("extracting", self.hook_manager.get_extract())
        ]

        try:
            for stage_name, hook_func in stages:
                if self.should_stop: return
                
                await self._emit_update(row_id, "running", stage_name)
                self._update_csv(row_id, {"_zx_hook_stage": stage_name})

                if hook_func:
                    if dry_run:
                        print(f"[DRY RUN] Would execute {stage_name} hook for row {row_id}")
                    else:
                        with self._capture_logs(run_dir):
                            print(f"--- Stage: {stage_name} at {datetime.now().isoformat()} ---")
                            # We run hook in a thread if it's CPU bound, but for now simple call
                            # In a real app, we'd use run_in_executor
                            result = await asyncio.to_thread(hook_func, row_dict, self.state, run_dir)
                            
                            if stage_name == "extracting" and isinstance(result, dict):
                                # Merge extraction results back into data
                                self._update_csv(row_id, result)
                                # Update row_dict for potential subsequent hooks in same loop
                                row_dict.update(result)

            # Success
            await self._emit_update(row_id, "completed")
            self._update_csv(row_id, {
                "_zx_status": "completed",
                "_zx_hook_stage": "",
                "_zx_completed_at": datetime.now().isoformat()
            })

        except Exception as e:
            err_msg = traceback.format_exc()
            print(f"Error executing row {row_id}: {err_msg}")
            await self._emit_update(row_id, "failed", error=str(e))
            self._update_csv(row_id, {
                "_zx_status": "failed",
                "_zx_error": err_msg,
                "_zx_completed_at": datetime.now().isoformat()
            })

    def stop(self):
        self.should_stop = True
