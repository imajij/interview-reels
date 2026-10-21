#!/usr/bin/env node
/* Transcript + cut spec -> karaoke caption states.
 *
 *   node build_caption_states.js transcripts.json spec.json states.json
 *
 * spec.json: { "clip": "C0001.MP4", "totalSec": 49.33, "frames": 1480,
 *              "segments": [ {srcInSec, srcOutSec, tlStart, tlEnd, speaker} ] }
 *
 * A "state" is one rendered frame of caption: the phrase plus which word is lit.
 * Grouping into 3-4 word phrases keeps text readable at phone size; breaking on
 * sentence punctuation and speaker changes stops a caption straddling two people.
 */
const fs = require("fs");
const [, , T_PATH, SPEC_PATH, OUT] = process.argv;
if (!OUT) { console.error("usage: build_caption_states.js <transcripts.json> <spec.json> <out.json>"); process.exit(1); }

const T = JSON.parse(fs.readFileSync(T_PATH, "utf8"));
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, "utf8"));
const d = T[spec.clip];
if (!d) { console.error(`clip ${spec.clip} not in transcripts`); process.exit(1); }

const fps = parseFloat(d.fps);
const tc2s = tc => { const [h, m, s, f] = tc.split(":").map(Number); return h * 3600 + m * 60 + s + f / fps; };
const base = tc2s(d.startTC);

// every word with clip-relative seconds
const words = [];
for (const seg of d.segments)
  for (const w of seg.words || []) {
    const t = (w.text || "").trim();
    if (!t || /^\(.*\)$/.test(t)) continue;      // (Inaudible), (...) etc
    words.push({ a: tc2s(w.start) - base, b: tc2s(w.end) - base, t });
  }

// map into timeline time, keeping only words inside a kept segment
const tw = [];
for (const s of spec.segments)
  for (const w of words)
    if (w.a >= s.srcInSec - 0.02 && w.a < s.srcOutSec) {
      const off = s.tlStart - s.srcInSec;
      tw.push({ a: +(w.a + off).toFixed(3), b: +(Math.min(w.b, s.srcOutSec) + off).toFixed(3), t: w.t, sp: s.speaker || "G" });
    }
tw.sort((x, y) => x.a - y.a);

// group into phrases
const phrases = []; let cur = [];
const flush = () => { if (cur.length) { phrases.push(cur); cur = []; } };
for (const w of tw) {
  if (cur.length && cur[0].sp !== w.sp) flush();          // never straddle speakers
  cur.push(w);
  if (/[.?!]["']?$/.test(w.t) || cur.length >= 4 || w.b - cur[0].a > 2.2) flush();
}
flush();

// Drop orphans left by segment boundaries.
//
// A cut rarely lands in silence, so the first or last word of the *next* speaker's
// sentence often bleeds a few frames past the boundary. That fragment becomes its own
// one-word phrase sitting on top of the following caption — two captions on screen at
// once, one of them nonsense ("Sure", "That's"). Whenever two phrases overlap, keep the
// one carrying the actual line and drop the fragment.
phrases.sort((a, b) => a[0].a - b[0].a);
const end = p => p[p.length - 1].b;
for (let i = 0; i < phrases.length - 1; i++) {
  const a = phrases[i], b = phrases[i + 1];
  const overlap = Math.min(end(a), end(b)) - Math.max(a[0].a, b[0].a);
  if (overlap <= 0.02) continue;
  const shorter = a.length <= b.length ? i : i + 1;
  phrases.splice(shorter, 1);
  i = Math.max(-1, i - 2);
}

// A segment can start a hair before 0 once conform rounding is applied; a caption with
// a negative timestamp silently drops its first state.
const shift = Math.min(0, ...phrases.map(p => p[0].a));
if (shift < 0) for (const p of phrases) for (const w of p) { w.a -= shift; w.b -= shift; }

// one state per (phrase, lit word); clamp so states never overlap
const states = [];
for (const p of phrases)
  for (let i = 0; i < p.length; i++) {
    const a = p[i].a, b = i + 1 < p.length ? p[i + 1].a : p[i].b + 0.12;
    if (b - a < 0.05) continue;
    states.push({ a: +a.toFixed(3), b: +b.toFixed(3), words: p.map(w => w.t), active: i, sp: p[i].sp });
  }
for (let i = 0; i < states.length - 1; i++) if (states[i].b > states[i + 1].a) states[i].b = states[i + 1].a;

fs.writeFileSync(OUT, JSON.stringify({ total: spec.totalSec, frames: spec.frames, states }, null, 1));
console.log(`words ${tw.length}  phrases ${phrases.length}  states ${states.length}  -> ${OUT}`);
console.log("\nfirst lines (read these - fix recognition errors before rendering):");
phrases.slice(0, 8).forEach(p => console.log(`  ${p[0].a.toFixed(1).padStart(6)}s ${p[0].sp}  ${p.map(w => w.t).join(" ")}`));
