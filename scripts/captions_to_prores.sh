#!/bin/bash
# Timed caption PNGs -> alpha ProRes 4444 clip for a Resolve video track.
#
#   ./captions_to_prores.sh caps.json /tmp/capspng out.mov <frames>
#
# Gaps between states become a transparent frame, so the clip runs the full
# length of the reel and lines up at frame 0 on its own track.
set -euo pipefail
STATES="${1:?states.json}"; PNGDIR="${2:?png dir}"; OUT="${3:?out.mov}"; FRAMES="${4:?frame count}"

ffmpeg -hide_banner -loglevel error -f lavfi -i "color=c=black@0.0:s=1080x1920:d=1,format=rgba" \
  -frames:v 1 -y "$PNGDIR/blank.png"

node -e '
const fs=require("fs"); const [states,dir]=[process.argv[1],process.argv[2]];
const d=JSON.parse(fs.readFileSync(states,"utf8"));
const S=d.states.map(s=>({...s}));
for (let i=0;i<S.length-1;i++) if (S[i].b > S[i+1].a) S[i].b = S[i+1].a;
const L=[]; let t=0;
const push=(f,dur)=>{ if(dur>0.0005){ L.push("file \x27"+f+"\x27"); L.push("duration "+dur.toFixed(4)); } };
S.forEach((s,i)=>{ if(s.a>t) push(dir+"/blank.png", s.a-t);
  const a=Math.max(s.a,t), b=Math.max(s.b,a);
  push(dir+"/c"+String(i).padStart(4,"0")+".png", b-a); t=b; });
if (d.total>t) push(dir+"/blank.png", d.total-t);
L.push("file \x27"+dir+"/blank.png\x27");
fs.writeFileSync(dir+"/concat.txt", L.join("\n"));
' "$STATES" "$PNGDIR"

ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$PNGDIR/concat.txt" \
  -vf "fps=30,format=yuva444p10le" -c:v prores_ks -profile:v 4444 -alpha_bits 16 \
  -r 30 -frames:v "$FRAMES" -y "$OUT"

echo "$(basename "$OUT"): $(ffprobe -v error -show_entries stream=nb_frames -of csv=p=0 "$OUT" | head -1) frames (expected $FRAMES)"
