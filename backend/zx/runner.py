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

    async def _emit_update(self, row_id: int, status: str, stage: str = "", error: str = "", extra_data: Dict = None):
        if self.on_update:
            data = {
                "row_id": int(row_id),
                "status": status,
                "stage": stage,
                "error": error,
                "extra_data": extra_data or {},
                "updated_at": datetime.now().isoformat()
            }
            if asyncio.iscoroutinefunction(self.on_update):
                await self.on_update(data)
            else:
                self.on_update(data)

    def _read_db(self) -> pd.DataFrame:
        if self.db_path.exists():
            try:
                return pd.read_csv(self.db_path)
            except Exception:
                pass
        return pd.DataFrame()

    def _update_csv(self, row_id: int, updates: Dict[str, Any]):
        df = self._read_db()
        
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
        mask = None
        if "_zx_row_id" in df.columns:
            # Ensure numeric comparison
            row_id_col = pd.to_numeric(df["_zx_row_id"], errors='coerce')
            mask = row_id_col == row_id
        
        if mask is not None and mask.any():
            for k, v in updates.items():
                df.loc[mask, k] = v
        elif row_id < len(df):
            # Fallback to index
            for k, v in updates.items():
                df.at[row_id, k] = v
        
        df.to_csv(self.db_path, index=False)

    def _setup_run_dir(self, row_id: int) -> Path:
        run_dir = self.project_path / "runs" / f"run_{row_id}"
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

    def _append_rows(self, new_rows: List[Dict[str, Any]], iteration: int) -> List[int]:
        df = self._read_db()
        
        # Ensure _zx_ columns exist
        zx_cols = ["_zx_row_id", "_zx_status", "_zx_hook_stage", "_zx_error", "_zx_started_at", "_zx_completed_at", "_zx_run_dir", "_zx_iteration"]
        for col in zx_cols:
            if col not in df.columns:
                if col == "_zx_row_id":
                    df[col] = range(len(df))
                else:
                    df[col] = ""

        # Determine next row_id
        # We use pd.to_numeric to handle mixed types or NaNs in the ID column
        row_id_col = pd.to_numeric(df["_zx_row_id"], errors='coerce')
        if not df.empty:
            max_id = row_id_col.max()
            if pd.isna(max_id):
                # If column exists but is all empty/NaN, populate it now
                df["_zx_row_id"] = range(len(df))
                next_id = len(df)
            else:
                next_id = int(max_id + 1)
        else:
            next_id = 0
            
        added_ids = []
        new_df_rows = []
        for i, row in enumerate(new_rows):
            rid = next_id + i
            row_to_add = row.copy()
            row_to_add["_zx_row_id"] = rid
            row_to_add["_zx_status"] = "pending"
            row_to_add["_zx_iteration"] = iteration
            # Fill other zx columns with defaults
            for col in zx_cols:
                if col not in row_to_add:
                    row_to_add[col] = ""
            
            new_df_rows.append(row_to_add)
            added_ids.append(rid)
            
        if new_df_rows:
            df = pd.concat([df, pd.DataFrame(new_df_rows)], ignore_index=True)
            df.to_csv(self.db_path, index=False)
            
        return added_ids

    async def run_rows(self, row_ids: List[int], dry_run: bool = False):
        if self.is_running:
            return
        
        self.is_running = True
        self.should_stop = False
        
        try:
            # 1. Initialize (Optional)
            init_hook = self.hook_manager.get_initialize()
            current_row_ids = row_ids
            
            if not current_row_ids:
                self.state = {}
            
            if init_hook and not dry_run:
                print(f"Running initialization hook...")
                df = self._read_db()
                result = await asyncio.to_thread(init_hook, df, self.state)
                
                # Result can be (new_rows, new_state) or just new_rows
                if isinstance(result, tuple):
                    new_rows, new_state = result
                    self.state.update(new_state)
                else:
                    new_rows = result
                
                if new_rows:
                    # If we started with an empty set or want to ADD rows from init
                    added = self._append_rows(new_rows, 0)
                    if not current_row_ids:
                        current_row_ids = added
                    
                    df_all = self._read_db().fillna("")
                    added_df = df_all[df_all["_zx_row_id"].isin(added)]
                    added_rows = added_df.to_dict(orient="records")
                    await self._emit_update(-1, "exploration_new_rows", extra_data={"new_rows": added_rows, "iteration": 0})

            current_iteration = self.state.get("_zx_iteration", 0)

            while current_row_ids:
                if self.should_stop: break

                # Execute current batch
                for rid in current_row_ids:
                    if self.should_stop: break
                    await self._execute_row(rid, dry_run)

                if self.should_stop: break

                # 2. Check for Exploration Hook
                explore_hook = self.hook_manager.get_explore()
                if not explore_hook or dry_run:
                    break

                print(f"--- Iteration {current_iteration} complete. Running exploration... ---")
                df = self._read_db()
                new_rows = await asyncio.to_thread(explore_hook, df, self.state)

                if not new_rows:
                    print("Exploration finished: no more rows generated.")
                    break

                # Check max iterations
                max_iter = self.state.get("max_iterations", 100)
                if current_iteration >= max_iter:
                    print(f"Exploration halted: reached max_iterations ({max_iter})")
                    break

                # 3. Append new rows and cascade
                current_iteration += 1
                self.state["_zx_iteration"] = current_iteration
                current_row_ids = self._append_rows(new_rows, current_iteration)
                
                # Send a signal to the UI with the full row data
                df_all = self._read_db().fillna("")
                added_df = df_all[df_all["_zx_row_id"].isin(current_row_ids)]
                added_rows = added_df.to_dict(orient="records")
                await self._emit_update(-1, "exploration_new_rows", extra_data={"new_rows": added_rows, "iteration": current_iteration})

        finally:
            self.is_running = False
            self.should_stop = False

    async def _execute_row(self, row_id: int, dry_run: bool):
        run_dir = self._setup_run_dir(row_id)
        
        # Start
        start_updates = {
            "_zx_status": "running",
            "_zx_started_at": datetime.now().isoformat(),
            "_zx_run_dir": str(run_dir)
        }
        await self._emit_update(row_id, "running", "starting", extra_data=start_updates)
        self._update_csv(row_id, start_updates)

        df = self._read_db()
        mask = None
        if "_zx_row_id" in df.columns:
            # Force numeric comparison to avoid type mismatch (int vs float vs string)
            row_id_col = pd.to_numeric(df["_zx_row_id"], errors='coerce')
            mask = row_id_col == row_id
            
        if mask is not None and mask.any():
            row_dict = df[mask].iloc[0].to_dict()
        elif row_id < len(df):
            # Fallback to index
            row_dict = df.iloc[row_id].to_dict()
        else:
            raise ValueError(f"Row identifier {row_id} not found as ID or Index")

        stages = [
            ("preprocessing", self.hook_manager.get_preprocess()),
            ("launching", self.hook_manager.get_launch()),
            ("extracting", self.hook_manager.get_extract())
        ]

        try:
            for stage_name, hook_func in stages:
                if self.should_stop: return
                
                await self._emit_update(row_id, "running", stage_name, extra_data={"_zx_hook_stage": stage_name})
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
                                # Broadcast results immediately
                                await self._emit_update(row_id, "running", stage_name, extra_data=result)

            # Success
            success_updates = {
                "_zx_status": "completed",
                "_zx_hook_stage": "",
                "_zx_completed_at": datetime.now().isoformat()
            }
            await self._emit_update(row_id, "completed", extra_data=success_updates)
            self._update_csv(row_id, success_updates)

        except Exception as e:
            err_msg = str(e)
            trace = traceback.format_exc()
            print(f"Error executing row {row_id}: {trace}")
            
            # Broadcast error and save to CSV
            error_updates = {
                "_zx_status": "error",
                "_zx_error": err_msg,
                "_zx_hook_stage": stage_name if 'stage_name' in locals() else "unknown",
                "_zx_completed_at": datetime.now().isoformat()
            }
            await self._emit_update(row_id, "error", error=err_msg, extra_data=error_updates)
            self._update_csv(row_id, error_updates)

    def stop(self):
        self.should_stop = True
