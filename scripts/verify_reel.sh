#!/bin/bash
# Verify a finished vertical reel before calling it done.
#
#   ./verify_reel.sh reel.mp4 [intro_seconds] [outro_seconds]
#
# Checks what a contact sheet hides: black borders from under-zoomed reframing,
# clipping, and dead-quiet passages. Intro/outro cards are excluded from the
# border check because they are legitimately dark.

set -uo pipefail
F="${1:?usage: verify_reel.sh <file> [intro_s] [outro_s]}"
INTRO="${2:-0}"; OUTRO="${3:-0}"
[ -f "$F" ] || { echo "no such file: $F"; exit 1; }

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$F")
read W H NB < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,nb_frames -of csv=p=0 "$F" | tr ',' ' ')
FPS=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$F" | head -1)
ACODEC=$(ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "$F" 2>/dev/null | grep -c "audio")
echo "=== $(basename "$F") ==="
printf "  %-22s %sx%s @ %s, %.2fs, %s frames\n" "format" "$W" "$H" "$FPS" "$D" "$NB"
[ "$W" = "1080" ] && [ "$H" = "1920" ] || echo "  WARNING: not 1080x1920"
[ "${ACODEC:-0}" -gt 0 ] 2>/dev/null || echo "  PROBLEM: no audio stream - segments were probably placed video-only"

# --- audio ---
read MEAN PEAK < <(ffmpeg -hide_banner -i "$F" -af volumedetect -f null - 2>&1 \
  | grep -oE "(mean|max)_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$" | tr '\n' ' ')
printf "  %-22s mean %s dB, peak %s dB\n" "audio" "${MEAN:-?}" "${PEAK:-?}"
awk -v p="${PEAK:-0}" 'BEGIN{ if (p > -0.5) print "  PROBLEM: peak " p " dB - clipping risk, AAC overshoots; aim for <= -1" }'
awk -v m="${MEAN:-0}" 'BEGIN{ if (m < -24) print "  WARNING: mean " m " dB is quiet next to typical social levels (~-14)" }'

# quietest 0.4s window ~= noise floor
FLOOR=0
END=$(awk -v d="$D" 'BEGIN{printf "%d", d-1}')
for t in $(seq 1 1 "$END"); do
  v=$(ffmpeg -hide_banner -ss "$t" -t 0.4 -i "$F" -af volumedetect -f null - 2>&1 \
      | grep -oE "mean_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$")
  [ -n "$v" ] && FLOOR=$(awk -v a="$v" -v b="$FLOOR" 'BEGIN{print (a<b)?a:b}')
done
printf "  %-22s %s dB (quietest 0.4s)\n" "noise floor" "$FLOOR"
awk -v f="$FLOOR" -v m="${MEAN:-0}" 'BEGIN{ if (f - m > -10) print "  WARNING: floor is close to speech level - room noise will be audible" }'

# --- black borders (the check a contact sheet cannot do) ---
ffmpeg -hide_banner -i "$F" -vf "fps=4,cropdetect=limit=20:round=2:reset=1,metadata=print:file=-" -an -f null - 2>/dev/null \
 | awk -v d="$D" -v intro="$INTRO" -v outro="$OUTRO" '
   /pts_time/ { split($0,a,"pts_time:"); t=a[2]+0 }
   /lavfi.cropdetect.w=/ { split($0,a,"="); w=a[2]+0 }
   /lavfi.cropdetect.h=/ { split($0,a,"="); h=a[2]+0; n++
      if (t > intro+0.1 && t < d-outro-0.1 && (w<1070 || h<1905)) {
         bad++; if (bad<=5) printf "    %.1fs  visible %dx%d\n", t, w, h } }
   END { printf "  %-22s %d/%d sampled frames have black edges\n", "borders", bad+0, n+0
         if (bad) print "  PROBLEM: under-zoomed reframing (16:9 needs zoom >= 3.16) or pan past the edge"
         else print "  OK: fills the frame throughout" }'
echo "  (a dark subject on a dark background can trip this - eyeball a flagged frame before chasing it)"
