#!/bin/bash
cd "$(dirname "$0")"

exec nix-shell -p python3 python313Packages.pip python313Packages.fastapi python313Packages.uvicorn python313Packages.pillow python313Packages.rawpy libraw --run "python3 -m backend.main \"\$@\""
