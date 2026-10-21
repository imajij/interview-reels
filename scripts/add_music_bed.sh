#!/bin/bash
# Mix a soft music bed under a finished reel, ducked beneath the dialogue.
#
#   ./add_music_bed.sh reel.mp4 music.wav out.mp4 [under_dB] [fade_s]
#
# under_dB (default -20) is how far the bed sits BELOW the reel's own speech level.
# The bed is loudness-normalised first, so the result is the same whether the track
# you hand it is hot or quiet — an early version took the offset relative to the
# music file's own level and a quiet pad came out inaudible.
#
# The bed is side-chained to the dialogue so it lifts in the gaps and drops under
# speech, which is what stops it competing with the captions. Video is copied.
set -euo pipefail
REEL="${1:?reel.mp4}"; MUSIC="${2:?music file}"; OUT="${3:?out.mp4}"
UNDER="${4:--20}"; FADE="${5:-1.0}"

D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$REEL")
FOUT=$(awk -v d="$D" -v f="$FADE" 'BEGIN{printf "%.2f", d-f}')

# Stream-copying video only works when the codec fits the output container.
# A ProRes master into .mp4 fails outright, so re-encode in that case.
vcodec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$REEL" | head -1)
case "${OUT##*.}:$vcodec" in
  mp4:h264|mp4:hevc|mov:*) VOPT="-c:v copy" ;;
  *) VOPT="-c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -profile:v high" ;;
esac
echo "  video: $vcodec -> ${VOPT#-c:v }"

speech=$(ffmpeg -hide_banner -i "$REEL" -af volumedetect -f null - 2>&1 \
         | grep -oE "mean_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$")
# normalise the bed to a known mean, then place it UNDER dB below the speech
bednorm=-26
gain=$(awk -v s="$speech" -v u="$UNDER" -v b="$bednorm" 'BEGIN{printf "%.1f", (s+u)-b}')
echo "  speech $speech dB | bed normalised to $bednorm dB | applying ${gain} dB -> bed ≈ $(awk -v s="$speech" -v u="$UNDER" 'BEGIN{printf "%.1f", s+u}') dB"

ffmpeg -hide_banner -loglevel error -i "$REEL" -stream_loop -1 -i "$MUSIC" -filter_complex "
  [1:a]atrim=0:${D},asetpts=N/SR/TB,loudnorm=I=${bednorm}:TP=-2:LRA=11,volume=${gain}dB,
       afade=t=in:st=0:d=${FADE},afade=t=out:st=${FOUT}:d=${FADE}[bed];
  [0:a]asplit=2[dry][key];
  [bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=450:makeup=1[duck];
  [dry][duck]amix=inputs=2:normalize=0:duration=first[mix];
  [mix]alimiter=limit=0.89:level=false[out]" \
  -map 0:v -map "[out]" $VOPT -c:a aac -b:a 192k -ar 48000 -movflags +faststart -y "$OUT"

after=$(ffmpeg -hide_banner -i "$OUT" -af volumedetect -f null - 2>&1 \
        | grep -oE "mean_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$")
peak=$(ffmpeg -hide_banner -i "$OUT" -af volumedetect -f null - 2>&1 \
       | grep -oE "max_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$")
# the bed is only audible on its own in the gaps - measure the quietest window
floorbefore=9; floorafter=9
for t in $(seq 1 1 $(awk -v d="$D" 'BEGIN{printf "%d", d-2}')); do
  a=$(ffmpeg -hide_banner -ss "$t" -t 0.4 -i "$REEL" -af volumedetect -f null - 2>&1 | grep -oE "mean_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$")
  b=$(ffmpeg -hide_banner -ss "$t" -t 0.4 -i "$OUT"  -af volumedetect -f null - 2>&1 | grep -oE "mean_volume: -?[0-9.]+" | grep -oE "\-?[0-9.]+$")
  [ -n "$a" ] && floorbefore=$(awk -v x="$a" -v y="$floorbefore" 'BEGIN{print (x<y)?x:y}')
  [ -n "$b" ] && floorafter=$(awk -v x="$b" -v y="$floorafter" 'BEGIN{print (x<y)?x:y}')
done

printf "  speech mean  %s dB -> %s dB   (drift should be under ~1 dB)\n" "$speech" "$after"
printf "  quiet gaps   %s dB -> %s dB   (the bed should lift this clearly)\n" "$floorbefore" "$floorafter"
printf "  final peak   %s dB\n" "$peak"
awk -v a="$speech" -v b="$after" 'BEGIN{ d=b-a; if (d<-1.5 || d>1.5) print "  WARNING: dialogue moved " d " dB - lower the bed or check the ducking" }'
awk -v p="$peak" 'BEGIN{ if (p > -0.5) print "  PROBLEM: peak " p " dB - the bed pushed it into clipping" }'
awk -v x="$floorbefore" -v y="$floorafter" 'BEGIN{ if (y-x < 3) print "  PROBLEM: gaps barely changed - the bed is inaudible, raise it" }'
