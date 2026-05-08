import importlib.util
import sys
from pathlib import Path
from typing import Callable, Any, Optional

class HookManager:
    def __init__(self, project_path: str):
        self.project_path = Path(project_path)
        self.hooks_dir = self.project_path / "hooks"

    def _load_hook_func(self, filename: str, func_name: str) -> Optional[Callable]:
        hook_path = self.hooks_dir / filename
        if not hook_path.exists():
            return None

        try:
            # Create a unique module name to avoid caching issues during development
            module_name = f"zx_hook_{hook_path.stem}"
            
            spec = importlib.util.spec_from_file_location(module_name, hook_path)
            if spec is None or spec.loader is None:
                return None
                
            module = importlib.util.module_from_spec(spec)
            # Add hooks dir to path so imports within hooks work
            sys.path.insert(0, str(self.hooks_dir))
            try:
                # Explicitly remove from sys.modules to force a clean reload
                if module_name in sys.modules:
                    del sys.modules[module_name]
                spec.loader.exec_module(module)
                sys.modules[module_name] = module
            finally:
                sys.path.pop(0)

            func = getattr(module, func_name, None)
            return func
        except Exception as e:
            print(f"Error loading hook {filename}:{func_name} -> {e}")
            raise e

    def get_preprocess(self) -> Optional[Callable]:
        return self._load_hook_func("preprocess.py", "preprocess")

    def get_launch(self) -> Optional[Callable]:
        return self._load_hook_func("launch.py", "launch")

    def get_extract(self) -> Optional[Callable]:
        return self._load_hook_func("extract.py", "extract")

    def get_initialize(self) -> Optional[Callable]:
        return self._load_hook_func("initialize.py", "initialize")

    def get_explore(self) -> Optional[Callable]:
        return self._load_hook_func("explore.py", "explore")

    def get_plot(self) -> Optional[Callable]:
        return self._load_hook_func("plot.py", "plot")
