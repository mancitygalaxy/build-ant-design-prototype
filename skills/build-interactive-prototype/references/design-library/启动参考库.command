#!/bin/zsh
set -eu
exec python3 "${0:A:h}/serve.py" --open
