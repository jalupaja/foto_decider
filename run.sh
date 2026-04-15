#!/bin/bash
cd "$(dirname "$0")"

# Check if dependencies are available, otherwise use nix-shell
if python3 -c "import fastapi" 2>/dev/null; then
    exec python3 -m backend.main "$@"
else
    exec nix-shell -p python3 python313Packages.pip python313Packages.fastapi python313Packages.uvicorn python313Packages.pillow python313Packages.rawpy libraw --run "python3 -m backend.main \"\$@\""
fi
