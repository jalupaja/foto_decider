#!/bin/bash
cd "$(dirname "$0")"
exec python -m backend.main "$@"
