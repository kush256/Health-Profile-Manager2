#!/usr/bin/env bash
# Full rebuild: dialogue + lip-sync -> frames -> scratch audio mix -> final MP4 + contact sheet.
set -euo pipefail
cd "$(dirname "$0")"
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
python3 tools/make_dialogue.py
node tools/render.mjs
python3 tools/mix_audio.py
ffmpeg -y -loglevel error -i output/video_silent.mp4 -i output/mix.wav -c:v copy -c:a aac -b:a 192k -shortest output/stomu_motion_test_01.mp4
ffmpeg -y -loglevel error -i output/video_silent.mp4 -vf "select='not(mod(n\,15))',scale=216:384,tile=10x2" -frames:v 1 output/contact_sheet.png
rm -f output/video_silent.mp4
echo "done -> output/stomu_motion_test_01.mp4"
