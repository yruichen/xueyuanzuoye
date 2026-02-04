#!/usr/bin/env python3
"""Launcher that adds repo/src to sys.path (if present) then imports the app.
It tries `xueyuanzuoye.stu_homework` (package) first, then `stu_homework` (module).
"""

import os
import sys
from pathlib import Path

# Add repository's src/ to sys.path so the package is importable when running from repo root
HERE = Path(__file__).resolve().parent.parent
SRC_DIR = HERE / 'src'
if SRC_DIR.exists():
    s = str(SRC_DIR)
    if s not in sys.path:
        sys.path.insert(0, s)

app = None
try:
    import xueyuanzuoye.stu_homework as appmod
    app = getattr(appmod, 'app', appmod)
except Exception:
    try:
        import stu_homework as appmod
        app = getattr(appmod, 'app', appmod)
    except Exception as e:
        print('Failed to import application module:', e)
        sys.exit(1)


if __name__ == "__main__":
    host = os.environ.get('FLASK_RUN_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_RUN_PORT', '5000'))
    debug_env = os.environ.get('FLASK_DEBUG', '')
    debug = debug_env.lower() in ('1', 'true', 'yes')
    print(f"Starting server on {host}:{port} (debug={debug})")
    app.run(host=host, port=port, debug=debug)
