import os
import sys

_conda_prefix = os.environ.get("CONDA_PREFIX", "")
if _conda_prefix:
    for _dll_dir in [
        os.path.join(_conda_prefix, "Library", "bin"),
        os.path.join(_conda_prefix, "Library", "lib"),
        os.path.join(_conda_prefix, "DLLs"),
    ]:
        if os.path.isdir(_dll_dir):
            os.add_dll_directory(_dll_dir)

__version__ = "0.1.0"
