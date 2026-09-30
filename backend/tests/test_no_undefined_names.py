"""Guards against the NameError class of 500s: on 2026-09-30 pyflakes found
nine undefined names in live code (missing imports / helpers that were never
written), each one a guaranteed crash on its code path."""
import pathlib
import subprocess
import sys

import pytest


def test_no_undefined_names_in_app():
    pytest.importorskip("pyflakes")
    app_dir = pathlib.Path(__file__).resolve().parents[1] / "app"
    out = subprocess.run([sys.executable, "-m", "pyflakes", str(app_dir)], capture_output=True, text=True)
    undefined = [line for line in (out.stdout + out.stderr).splitlines() if "undefined name" in line]
    assert not undefined, "Undefined names (runtime NameError):\n" + "\n".join(undefined)
