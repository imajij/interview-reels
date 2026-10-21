#!/usr/bin/env node
/* Synthesise a soft, loopable instrumental bed for an interview reel.
 *
 *   node make_bed.js out.wav [seconds] [key]        key: Am (default) | Cm | Fm | Em
 *
 * Why generate rather than download: a bed under dialogue needs to be steady, wordless
 * and hookless, which is exactly what stock "royalty free" tracks are not — they are
 * written to be listened to. Generating it also removes two real risks for a client
 * posting to Instagram: an ambiguous licence, and a Content ID claim on a track someone
 * else also uploaded. Prefer the client's own licensed library when they have one; use
 * this when they don't, and tell them what it is.
 *
 * The shaping is the point. Speech intelligibility lives at 1-4 kHz, so the mix is
 * rolled off above ~3 kHz and dipped through the presence band. The result sounds dull
 * on its own and correct under a voice.
 */
const fs = require("fs");

const [, , OUT = "bed.wav", SECS = "96", KEY = "Am", BPM_ARG] = process.argv;
const SR = 48000;
// Tempo carries most of the energy. 82 suits a calm interview bed; a brighter,
// more upbeat piece wants 100-112 and one of the major progressions below.
const BPM = Math.max(60, Math.min(140, parseInt(BPM_ARG || "82", 10)));
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);          // MIDI -> Hz
// Two bars per chord. Voicings stay in a narrow register so nothing pokes through.
const PROGRESSIONS = {
  Am: [[45, 57, 60, 64], [41, 53, 57, 60], [48, 60, 64, 67], [43, 55, 59, 62]],
  Cm: [[48, 60, 63, 67], [44, 56, 60, 63], [51, 63, 67, 70], [46, 58, 62, 65]],
  Fm: [[41, 53, 56, 60], [48, 60, 63, 68], [44, 56, 60, 63], [39, 51, 55, 58]],
  Em: [[40, 52, 55, 59], [45, 57, 60, 64], [43, 55, 59, 62], [48, 60, 64, 67]],
  // i - VI - III - VII, same shape as Am transposed up a fourth
  Dm: [[38, 50, 53, 57], [46, 58, 62, 65], [41, 53, 57, 60], [48, 60, 64, 67]],
  Bm: [[47, 59, 62, 66], [43, 55, 59, 62], [50, 62, 66, 69], [45, 57, 61, 64]],
  // major sets - brighter, for upbeat pieces
  C:  [[48, 60, 64, 67], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62]],
  G:  [[43, 55, 59, 62], [40, 52, 55, 59], [48, 60, 64, 67], [45, 57, 60, 64]],
  F:  [[41, 53, 57, 60], [48, 60, 64, 67], [45, 57, 60, 64], [43, 55, 59, 62]],
  A:  [[45, 57, 61, 64], [42, 54, 57, 61], [50, 62, 66, 69], [52, 64, 68, 71]],
};
const CHORDS = PROGRESSIONS[KEY] || PROGRESSIONS.Am;
const CHORD_LEN = BAR * 2;
const CYCLE = CHORD_LEN * CHORDS.length;

// Snap to a whole number of progression cycles. A loop that ends mid-progression
// restarts at a different chord *and* a different level; crossfading the seam hides
// the click but not the 7-8 dB step, which is audible as the bed "breathing" once a
// minute under a quiet passage.
const DUR = CYCLE * Math.max(1, Math.round(parseFloat(SECS) / CYCLE));
const N = Math.round(SR * DUR);
// Render an extra tail past the loop point, then fold it back over the head. Blending
// the tail with material 2s *into* the file instead is the obvious mistake and leaves
// the seam exactly as discontinuous as before.
const SEAM = Math.round(SR * 2.0);
const M = N + SEAM;

const L = new Float64Array(M), R = new Float64Array(M);

// ---- pad: detuned sines, crossfaded between chords so nothing ever restarts ----
const chordAt = t => {
  const x = (t % CYCLE) / CHORD_LEN;
  const i = Math.floor(x), f = x - i;
  // equal-power crossfade over the last 25% of each chord
  const FADE = 0.25;
  if (f < 1 - FADE) return [[CHORDS[i], 1]];
  const g = (f - (1 - FADE)) / FADE;
  return [[CHORDS[i], Math.cos(g * Math.PI / 2)], [CHORDS[(i + 1) % CHORDS.length], Math.sin(g * Math.PI / 2)]];
};

for (let n = 0; n < M; n++) {
  const t = n / SR;
  let l = 0, r = 0;
  for (const [chord, w] of chordAt(t)) {
    for (let v = 0; v < chord.length; v++) {
      const f = NOTE(chord[v]);
      const lvl = w * (v === 0 ? 0.30 : 0.16) / chord.length;
      // a slow tremolo per voice keeps a long pad from sounding frozen
      const breathe = 1 + 0.10 * Math.sin(2 * Math.PI * ((v + 1) / CYCLE) * t + v);
      l += lvl * breathe * Math.sin(2 * Math.PI * f * (1 - 0.0012) * t);
      r += lvl * breathe * Math.sin(2 * Math.PI * f * (1 + 0.0012) * t);
      // a quiet octave adds body without adding a new pitch to track
      l += lvl * 0.18 * Math.sin(2 * Math.PI * f * 2 * t);
      r += lvl * 0.18 * Math.sin(2 * Math.PI * f * 2 * t + 0.4);
    }
  }
  L[n] = l; R[n] = r;
}

// ---- arpeggio: eighth notes, short exponential decay, deliberately low ----
const STEP = BEAT / 2;
for (let s = 0; s * STEP < M / SR; s++) {
  const t0 = s * STEP;
  const chord = chordAt(t0)[0][0];
  // wander through the upper chord tones rather than running straight up and down,
  // which would read as a melody
  const idx = [1, 2, 3, 2, 3, 1, 2, 3][s % 8];
  const f = NOTE(chord[idx] + 12);
  const pan = (s % 2) ? 0.62 : 0.38;
  const DECAY = 0.42, AMP = 0.052;
  for (let k = 0; k < DECAY * SR && t0 * SR + k < M; k++) {
    const n = Math.round(t0 * SR) + k, tt = k / SR;
    const env = Math.exp(-tt / 0.13) * (1 - Math.exp(-tt / 0.004));
    const v = AMP * env * (Math.sin(2 * Math.PI * f * tt) + 0.22 * Math.sin(2 * Math.PI * f * 2 * tt));
    L[n] += v * (1 - pan); R[n] += v * pan;
  }
}

// ---- air: filtered noise, very quiet, slowly swelling ----
let np = 0;
for (let n = 0; n < M; n++) {
  const t = n / SR;
  np += (Math.random() * 2 - 1 - np) * 0.035;                 // one-pole lowpass ~270 Hz
  const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * (1 / CYCLE) * t);
  const v = np * 0.05 * (0.4 + 0.6 * swell);
  L[n] += v; R[n] += v * 0.9;
}

// ---- stay out of the way of speech ----
// one-pole lowpass at ~3 kHz, then a broad dip through the presence band. Together
// these are what let the bed sit 20 dB down and still be felt rather than heard.
const lp = (buf, hz) => {
  const a = 1 - Math.exp(-2 * Math.PI * hz / SR);
  let y = 0;
  for (let n = 0; n < buf.length; n++) { y += a * (buf[n] - y); buf[n] = y; }
};
const presenceDip = (buf, amount) => {
  const band = new Float64Array(buf.length);
  band.set(buf); lp(band, 3800);
  const low = new Float64Array(buf.length);
  low.set(buf); lp(low, 900);
  for (let n = 0; n < buf.length; n++) buf[n] -= amount * (band[n] - low[n]);
};
lp(L, 3000); lp(R, 3000);
presenceDip(L, 0.55); presenceDip(R, 0.55);

// ---- loop seam: fold the overhang back onto the head ----
// Sample N is what a player would reach just before wrapping to sample 0, so the
// overhang N..N+SEAM is exactly the material that has to become the head.
for (let k = 0; k < SEAM; k++) {
  const g = k / SEAM;                     // 0 at the wrap point, 1 once clear of it
  L[k] = L[k] * g + L[N + k] * (1 - g);
  R[k] = R[k] * g + R[N + k] * (1 - g);
}

// ---- normalise to -3 dBFS peak; add_music_bed.sh sets the working level ----
let peak = 0;
for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
const gain = Math.pow(10, -3 / 20) / peak;

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v * gain * 32767)));
for (let n = 0; n < N; n++) {
  buf.writeInt16LE(clamp(L[n]), 44 + n * 4);
  buf.writeInt16LE(clamp(R[n]), 46 + n * 4);
}
fs.writeFileSync(OUT, buf);
console.log(`${OUT}  ${DUR.toFixed(2)}s  ${KEY}  ${BPM} BPM  peak -3.0 dBFS  (loop seam ${(SEAM / SR).toFixed(1)}s)`);
