#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/apps/agent"
uv run agent
