#!/usr/bin/env node
/* Reframing maths for 16:9 -> 9:16 in DaVinci Resolve.
 *
 *   node framing.js --subject-x 2315 --zoom 3.2     where to put a subject
 *   node framing.js --check --zoom 2.8 --pan 1015   will this expose black?
 *
 * Resolve fits a clip to the frame by its larger dimension, so 3840x2160 in a
 * 1080x1920 timeline is only 607.5px tall at zoom 1.0. Zoom must reach ~3.16
 * before it fills the height; below that you get black bars top and bottom.
 */
const SRC_W = 3840, SRC_H = 2160, TL_W = 1080, TL_H = 1920;
const FIT = TL_W / SRC_W;                 // 0.28125
const FILL_Z = TL_H / (SRC_H * FIT);      // 3.1605

const scale = z => z * FIT;
const visible = z => [SRC_W / z, TL_H / scale(z)];
const panFor = (cx, z) => (SRC_W / 2 - cx) * scale(z);
const centreFromPan = (pan, z) => SRC_W / 2 - pan / scale(z);

function check(z, pan = 0, tilt = 0) {
  const out = [];
  if (z < FILL_Z) out.push(`zoom ${z.toFixed(2)} < ${FILL_Z.toFixed(2)}: black bars top and bottom`);
  const [vw, vh] = visible(z);
  const cx = centreFromPan(pan, z), cy = SRC_H / 2 - tilt / scale(z);
  if (cx - vw / 2 < 0 || cx + vw / 2 > SRC_W)
    out.push(`pan ${pan >= 0 ? "+" : ""}${pan.toFixed(0)} runs off the side (centre x=${cx.toFixed(0)}, visible ${vw.toFixed(0)}px)`);
  if (cy - vh / 2 < 0 || cy + vh / 2 > SRC_H)
    out.push(`tilt ${tilt >= 0 ? "+" : ""}${tilt.toFixed(0)} runs off top/bottom (centre y=${cy.toFixed(0)}, visible ${vh.toFixed(0)}px)`);
  return out;
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? parseFloat(process.argv[i + 1]) : d; };
const zoom = arg("--zoom", 3.2), pan = arg("--pan", 0), tilt = arg("--tilt", 0);
const subjectX = arg("--subject-x", null);

console.log(`fill threshold: zoom >= ${FILL_Z.toFixed(4)}   (use >= 3.2 for pan headroom)`);
const [vw, vh] = visible(zoom);
console.log(`at zoom ${zoom}: visible source ${vw.toFixed(0)}x${vh.toFixed(0)}px, ${scale(zoom).toFixed(4)} tl-px per src-px`);

if (subjectX !== null && !Number.isNaN(subjectX)) {
  const p = panFor(subjectX, zoom);
  console.log(`\nsubject at x=${subjectX.toFixed(0)}  ->  Pan = ${p >= 0 ? "+" : ""}${p.toFixed(0)}`);
  const lo = vw / 2, hi = SRC_W - vw / 2;
  if (subjectX < lo || subjectX > hi)
    console.log(`  WARNING: subject outside safe range [${lo.toFixed(0)}, ${hi.toFixed(0)}] at this zoom;\n           the crop would run off the edge. Raise zoom or accept off-centre framing.`);
  check(zoom, p, tilt).forEach(x => console.log("  WARNING:", x));
}

if (process.argv.includes("--check")) {
  const probs = check(zoom, pan, tilt);
  console.log("\n" + (probs.length ? probs.map(x => "PROBLEM: " + x).join("\n") : "OK - fills the frame, no edges exposed"));
}
