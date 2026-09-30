"""
CI Smoke Test: Verify that app.main imports successfully without circular dependency
or schema errors.
"""
import pytest

def test_smoke_import_main():
    import app.main
    assert app.main.app is not None
    assert app.main.app.title == "Drop Cars API"
