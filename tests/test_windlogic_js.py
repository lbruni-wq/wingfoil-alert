import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class TestWindlogicJs(unittest.TestCase):
    @unittest.skipIf(shutil.which("node") is None, "node non disponibile")
    def test_js_cases_match_python(self):
        result = subprocess.run(
            ["node", str(ROOT / "tests" / "run_windlogic_cases.js")],
            capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0,
                         f"stdout: {result.stdout}\nstderr: {result.stderr}")


if __name__ == "__main__":
    unittest.main()
