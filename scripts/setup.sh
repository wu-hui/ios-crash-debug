#!/usr/bin/env bash

set -e

cd "$(dirname $(dirname "$0"))"
root="${PWD}"
echo "Project root: ${root}"

export FIRESTORE_EMULATOR_HOST="localhost:8080"

node "./scripts/generate-notes.mjs"
node "./scripts/setup-firestore.mjs"
