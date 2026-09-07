"""Tiny runner, so the tests need nothing installed."""

import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))


def main(module_name):
    module = __import__(module_name)
    tests = [n for n in dir(module) if n.startswith("test_")]
    failed = 0
    for name in sorted(tests):
        try:
            getattr(module, name)()
            print(f"PASS  {name}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {name}\n      {e}")
        except Exception:
            failed += 1
            print(f"ERROR {name}")
            traceback.print_exc()
    print(f"\n{len(tests) - failed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
