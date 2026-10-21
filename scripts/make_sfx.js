#!/usr/bin/env node
/* Synthesise a small, cohesive set of transition sound effects.
 *
 *   node make_sfx.js <outdir>
 *
 * Writes whoosh.wav, whoosh_rev.wav, riser.wav, riser_short.wav, impact.wav,
 * sub.wav, tick.wav, pop.wav, shimmer.wav.
 *
 * Why generate rather than download: a free-SFX pack is a licence question, a
 * download, and a pile of files that do not match each other. These are built from
 * one noise/envelope/reverb chain, so they sit together as a set.
 *
 * What makes them sound produced rather than raw:
 *   - a real reverb tail on every hit (the single biggest difference)
 *   - stereo movement - whooshes travel left to right rather than sitting centred
 *   - resonant band sweeps instead of flat noise bursts
 *   - a scoop through 1-4 kHz so they duck out of the way of consonants
 * Keep them quiet in the mix and place them in speech gaps; level and timing do
 * as much work as the design does.
 */
const fs = require("fs");
const SR = 48000;
const OUT = process.argv[2] || ".";

// ---------- helpers ----------
const lp = (b, hz, st) => { const a = 1 - Math.exp(-2*Math.PI*hz/SR); let y = st||0;
  for (let i=0;i<b.length;i++){ y += a*(b[i]-y); b[i]=y; } };
const hp = (b, hz) => { const a = 1 - Math.exp(-2*Math.PI*hz/SR); let y=0;
  for (let i=0;i<b.length;i++){ y += a*(b[i]-y); b[i]-=y; } };
// scoop 1-4 kHz so the effect never competes with speech
const dip = (b, amount) => {
  const band = Float64Array.from(b), low = Float64Array.from(b);
  lp(band, 4000); lp(low, 1000);
  for (let i=0;i<b.length;i++) b[i] -= amount*(band[i]-low[i]);
};
// a resonant bandpass, swept over time - this is what turns noise into a "whoosh"
const sweep = (b, f0, f1, q) => {
  const out = new Float64Array(b.length);
  let z1=0, z2=0;
  for (let i=0;i<b.length;i++){
    const x = i/b.length;
    const f = f0 * Math.pow(f1/f0, x);
    const w = 2*Math.PI*f/SR, alpha = Math.sin(w)/(2*q);
    const b0 = alpha, a0 = 1+alpha, a1 = -2*Math.cos(w), a2 = 1-alpha;
    const y = (b0/a0)*b[i] - (a1/a0)*z1 - (a2/a0)*z2;
    z2 = z1; z1 = y; out[i] = y;
  }
  return out;
};
// Schroeder reverb: four combs in parallel into two allpasses. The tail is what
// makes a hit sound like it happened in a room rather than in a vacuum.
const reverb = (b, mix, decay) => {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map(d => ({ d, buf: new Float64Array(d), i: 0 }));
  const allp  = [225, 556, 441].map(d => ({ d, buf: new Float64Array(d), i: 0 }));
  const out = new Float64Array(b.length);
  for (let n=0;n<b.length;n++){
    let acc = 0;
    for (const c of combs){
      const v = c.buf[c.i];
      acc += v;
      c.buf[c.i] = b[n] + v*decay;
      c.i = (c.i+1) % c.d;
    }
    acc /= combs.length;
    for (const a of allp){
      const v = a.buf[a.i];
      const y = -acc + v;
      a.buf[a.i] = acc + v*0.5;
      a.i = (a.i+1) % a.d;
      acc = y;
    }
    out[n] = b[n]*(1-mix) + acc*mix;
  }
  return out;
};
const noise = n => { const b = new Float64Array(n);
  for (let i=0;i<n;i++) b[i] = Math.random()*2-1; return b; };

const wav = (name, L, R) => {
  const N = L.length;
  let peak = 0;
  for (let i=0;i<N;i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = peak>0 ? Math.pow(10,-1.5/20)/peak : 1;
  const b = Buffer.alloc(44 + N*4);
  b.write("RIFF",0); b.writeUInt32LE(36+N*4,4); b.write("WAVE",8);
  b.write("fmt ",12); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20);
  b.writeUInt16LE(2,22); b.writeUInt32LE(SR,24); b.writeUInt32LE(SR*4,28);
  b.writeUInt16LE(4,32); b.writeUInt16LE(16,34);
  b.write("data",36); b.writeUInt32LE(N*4,40);
  const cl = v => Math.max(-32768, Math.min(32767, Math.round(v*gain*32767)));
  for (let i=0;i<N;i++){ b.writeInt16LE(cl(L[i]), 44+i*4); b.writeInt16LE(cl(R[i]), 46+i*4); }
  fs.writeFileSync(`${OUT}/${name}.wav`, b);
  console.log(`${name}.wav  ${(N/SR).toFixed(2)}s`);
};

// ---------- whoosh: air moving past, travelling left to right ----------
const makeWhoosh = (name, rev) => {
  const D = 1.35, N = Math.round(SR*D);
  const src = noise(N);
  lp(src, 7000); hp(src, 200);
  const band = rev ? sweep(src, 2600, 320, 1.1) : sweep(src, 320, 2600, 1.1);
  const L = new Float64Array(N), R = new Float64Array(N);
  for (let i=0;i<N;i++){
    const x = i/N;
    // slow in, quick out for a forward whoosh; reversed for the swell
    const env = rev ? Math.pow(x, 2.2) : Math.sin(Math.PI*Math.pow(x, 0.75));
    const pan = rev ? 1-x : x;                    // travels across the stereo field
    const v = band[i]*env*1.6;
    L[i] = v*Math.cos(pan*Math.PI/2);
    R[i] = v*Math.sin(pan*Math.PI/2);
  }
  dip(L,0.55); dip(R,0.55);
  const Lr = reverb(L, 0.26, 0.72), Rr = reverb(R, 0.26, 0.72);
  wav(name, Lr, Rr);
};
makeWhoosh("whoosh", false);
makeWhoosh("whoosh_rev", true);

// ---------- riser: noise and a rising resonance, for the beat before a reveal ----------
{
  const D = 2.2, N = Math.round(SR*D);
  const src = noise(N); lp(src, 8000); hp(src, 400);
  const band = sweep(src, 240, 4200, 2.4);
  const L = new Float64Array(N), R = new Float64Array(N);
  let ph = 0;
  for (let i=0;i<N;i++){
    const x = i/N;
    const env = Math.pow(x, 2.0);
    const f = 150*Math.pow(6, x);
    ph += 2*Math.PI*f/SR;
    const tone = Math.sin(ph)*0.22*env;
    L[i] = band[i]*env*1.3 + tone;
    R[i] = band[i]*env*1.3 + Math.sin(ph*1.004)*0.22*env;
  }
  dip(L,0.5); dip(R,0.5);
  wav("riser", reverb(L,0.22,0.70), reverb(R,0.22,0.70));
}

// ---------- riser_short: the same build compressed, for items in a list ----------
// A full riser every few seconds turns into mush. This is under a second so each
// beat in a run can have a lift without the tails piling up.
{
  const D = 0.95, N = Math.round(SR*D);
  const src = noise(N); lp(src, 8000); hp(src, 500);
  const band = sweep(src, 380, 3600, 2.8);
  const L = new Float64Array(N), R = new Float64Array(N);
  let ph = 0;
  for (let i=0;i<N;i++){
    const x = i/N;
    const env = Math.pow(x, 1.9);
    const f = 260*Math.pow(4.5, x);
    ph += 2*Math.PI*f/SR;
    L[i] = band[i]*env*1.2 + Math.sin(ph)*0.16*env;
    R[i] = band[i]*env*1.2 + Math.sin(ph*1.006)*0.16*env;
  }
  dip(L,0.5); dip(R,0.5);
  wav("riser_short", reverb(L,0.18,0.62), reverb(R,0.18,0.62));
}

// ---------- impact: soft weighted hit with a long tail, not a click ----------
{
  const D = 2.4, N = Math.round(SR*D);
  const body = new Float64Array(N);
  let ph = 0;
  for (let i=0;i<N;i++){
    const tt = i/SR;
    const f = 110*Math.exp(-tt*7) + 46;
    ph += 2*Math.PI*f/SR;
    const env = Math.exp(-tt/0.34)*(1-Math.exp(-tt/0.012));   // slow attack: no click
    body[i] = Math.sin(ph)*env;
  }
  const air = noise(N); lp(air, 900); hp(air, 120);
  for (let i=0;i<N;i++){
    const tt=i/SR;
    air[i] *= Math.exp(-tt/0.11)*(1-Math.exp(-tt/0.010))*0.45;
  }
  const L = new Float64Array(N), R = new Float64Array(N);
  for (let i=0;i<N;i++){ L[i]=body[i]*0.9+air[i]; R[i]=body[i]*0.9+air[i]*0.92; }
  dip(L,0.35); dip(R,0.35);
  wav("impact", reverb(L,0.30,0.80), reverb(R,0.30,0.80));
}

// ---------- sub: a clean low drop to sit under a hard cut ----------
{
  const D = 1.8, N = Math.round(SR*D);
  const L = new Float64Array(N), R = new Float64Array(N);
  let ph=0;
  for (let i=0;i<N;i++){
    const tt=i/SR;
    const f = 90*Math.exp(-tt*3.2) + 34;
    ph += 2*Math.PI*f/SR;
    const env = Math.exp(-tt/0.45)*(1-Math.exp(-tt/0.020));
    const v = Math.sin(ph)*env;
    L[i]=v; R[i]=v;
  }
  wav("sub", L, R);
}

// ---------- tick: a soft wooden tock for list items ----------
{
  const D = 0.5, N = Math.round(SR*D);
  const b = new Float64Array(N);
  let ph=0;
  for (let i=0;i<N;i++){
    const tt=i/SR;
    const f = 900*Math.exp(-tt*40) + 430;
    ph += 2*Math.PI*f/SR;
    const env = Math.exp(-tt/0.028)*(1-Math.exp(-tt/0.0018));
    b[i] = (Math.sin(ph)*0.8 + (Math.random()*2-1)*0.18)*env;
  }
  hp(b, 260); dip(b, 0.45);
  const L = Float64Array.from(b), R = Float64Array.from(b);
  wav("tick", reverb(L,0.20,0.62), reverb(R,0.20,0.62));
}

// ---------- pop: a rounded blip for a small element arriving ----------
{
  const D = 0.7, N = Math.round(SR*D);
  const b = new Float64Array(N);
  let ph=0;
  for (let i=0;i<N;i++){
    const tt=i/SR;
    const f = 430*Math.pow(2.1, Math.min(1, tt/0.08));
    ph += 2*Math.PI*f/SR;
    const env = Math.exp(-tt/0.060)*(1-Math.exp(-tt/0.005));
    b[i] = (Math.sin(ph) + 0.18*Math.sin(ph*2))*env*0.75;
  }
  dip(b, 0.40);
  wav("pop", reverb(Float64Array.from(b),0.20,0.60), reverb(Float64Array.from(b),0.20,0.60));
}

// ---------- shimmer: a soft bell cluster for a logo or end card ----------
{
  const D = 2.6, N = Math.round(SR*D);
  const L = new Float64Array(N), R = new Float64Array(N);
  // a major-ninth cluster, struck in sequence - reads as "resolved", not shrill
  const parts = [880, 1320, 1760, 2640, 3520];
  parts.forEach((f,k)=>{
    const delay = k*0.075;
    for (let i=0;i<N;i++){
      const tt = i/SR - delay;
      if (tt < 0) continue;
      const env = Math.exp(-tt/0.62)*(1-Math.exp(-tt/0.006));
      const v = (Math.sin(2*Math.PI*f*tt) + 0.22*Math.sin(2*Math.PI*f*2.01*tt))*env*0.22;
      L[i] += v*(k%2 ? 0.72 : 1);
      R[i] += v*(k%2 ? 1 : 0.72);
    }
  });
  dip(L,0.30); dip(R,0.30);
  wav("shimmer", reverb(L,0.34,0.82), reverb(R,0.34,0.82));
}
