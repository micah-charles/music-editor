#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT/apps/studio/public/chords/free-midi-chords"

mkdir -p "$TARGET"

cat <<MSG
FoxChild Music Score Lab chord data setup

Download a free-midi-chords release from:
https://github.com/ldrolez/free-midi-chords/releases

Then copy selected MIDI files into:
$TARGET

Keep the upstream MIT license notice in:
$TARGET/LICENSE

After adding files, update:
$ROOT/apps/studio/public/chords/chord-library-index.json
MSG
