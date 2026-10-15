#!/usr/bin/env bash
# Lane `media`: demo video of the LIVE stage, EN and ES, recorded with the node's GPU, then encoded
# to 1280x720 at 60 fps in H.264 (mp4) and AV1 (mkv/mp4) with the chapter titles burnt in as
# subtitles. Output: docs/media/stage-<lang>.{mp4,av1.mp4,srt} + docs/media/media.json. Detached.
#   MEDIA_SITE  default https://genome.ichisieben.dev/
[ "${1:-}" = run ] || exec bash "$(dirname "$0")/detach.sh" media "$0"
set -uo pipefail
cd "$(dirname "$0")/../.."
SITE="${MEDIA_SITE:-https://genome.ichisieben.dev/}"
command -v ffmpeg >/dev/null || { echo "media: ffmpeg MISSING"; exit 30; }
AV1=""
ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1 && AV1=libsvtav1
[ -z "$AV1" ] && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libaom-av1 && AV1=libaom-av1
echo "media: av1 encoder=${AV1:-NONE}"
OUT=docs/media; RAW=/tmp/agp-media; mkdir -p "$OUT" "$RAW"
(cd web && { [ -d node_modules ] || npm ci --no-audit --no-fund --loglevel=error; } && npx playwright install chromium >/dev/null 2>&1) || true
rc=0
for lang in en es; do
  (cd web && node scripts/record-stage.mjs "$SITE" --out-dir "$RAW" --lang "$lang" --gpu --seconds 70) || { rc=21; continue; }
  cp "$RAW/stage-$lang.srt" "$OUT/"
  SUB="subtitles=$RAW/stage-$lang.srt:force_style='FontName=Helvetica,FontSize=22,PrimaryColour=&H00F0EEEA,OutlineColour=&H80000000,BorderStyle=1,Outline=1,MarginV=36'"
  ffmpeg -y -hide_banner -loglevel error -i "$RAW/stage-$lang.webm" -vf "fps=60,scale=1280:720,$SUB" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart -an "$OUT/stage-$lang.mp4" || rc=22
  if [ -n "$AV1" ]; then
    if [ "$AV1" = libsvtav1 ]; then ENC="-c:v libsvtav1 -preset 6 -crf 34"; else ENC="-c:v libaom-av1 -cpu-used 6 -crf 34 -b:v 0"; fi
    ffmpeg -y -hide_banner -loglevel error -i "$RAW/stage-$lang.webm" -vf "fps=60,scale=1280:720,$SUB" \
      $ENC -pix_fmt yuv420p -movflags +faststart -an "$OUT/stage-$lang.av1.mp4" || rc=23
  fi
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate -show_entries format=duration,size -of compact "$OUT/stage-$lang.mp4"
  [ -f "$OUT/stage-$lang.av1.mp4" ] && ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,avg_frame_rate -show_entries format=duration,size -of compact "$OUT/stage-$lang.av1.mp4"
  # Frames the recorder actually delivered, before the 60 fps re-timing.
  ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -show_entries format=duration -of compact "$RAW/stage-$lang.webm" | sed 's/^/raw: /'
done
ls -la "$OUT"
exit $rc
