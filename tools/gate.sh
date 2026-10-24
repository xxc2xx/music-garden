#!/bin/sh
# Full gate before every push (and what pitch-trainer's consumers-test.sh runs
# against candidate engine modules): static QC, unit tests, fake-DOM
# execution + failure injection.
set -e
cd "$(dirname "$0")/.."
node tools/qc.js
node tools/garden-test.mjs
node tools/exec-check.mjs
