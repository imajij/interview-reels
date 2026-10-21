#!/usr/bin/env node
/* Cue sheet -> one ffmpeg command that lays the SFX bus under a finished mix.
 *
 *   node mix_sfx.js cues.txt sfxdir in.mov out.mov
 *
 * cues.txt: one "<name> <seconds> <gain dB>" per line, # for comments.
 * <name> resolves to <sfxdir>/<name>.wav.
 *
 * Every cue is its own input, delayed into place and trimmed to the programme
 * length, then summed with normalize=0 so a gain in the sheet means the same
 * thing here as it did when the file was normalised. The limiter at the end is
 * the only thing allowed to touch the dialogue level.
 */
const fs = require("fs");
const [, , CUES, DIR, IN, OUT] = process.argv;
if (!OUT) { console.error("usage: mix_sfx.js <cues.txt> <sfxdir> <in> <out>"); process.exit(1); }

const cues = fs.readFileSync(CUES, "utf8").split("\n")
  .map(l => l.replace(/#.*/, "").trim()).filter(Boolean)
  .map(l => { const [name, t, g, len] = l.split(/\s+/);
    return { name, t: parseFloat(t), g: parseFloat(g), len: len ? parseFloat(len) : null }; })
  .sort((a, b) => a.t - b.t);

// ONE sound at a time. A cue that would still be ringing when the next one lands is
// faded out 60 ms before it, so two effects never sound together. Anything squeezed
// below 0.25s is a real collision in the sheet, not something a fade can rescue, and
// the run stops rather than quietly mangling it.
const GAP = 0.06, MIN = 0.25;
const dur = f => parseFloat(require("child_process")
  .execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const args = ["-hide_banner", "-loglevel", "error", "-i", IN];
const parts = [];
const trimmed = [], capped = [];
let chainCap = "";
cues.forEach((c, i) => {
  const path = `${DIR}/${c.name}.wav`;
  if (!fs.existsSync(path)) { console.error("missing sfx:", path); process.exit(1); }
  args.push("-i", path);
  const ms = Math.round(c.t * 1000);
  // An optional 4th column caps a sound's length. Used where a long tail would ring
  // on under the next line of dialogue - the overlap guard below only looks at the
  // next CUE, so a 1.9s hit followed by six seconds of silence escapes it entirely.
  const natural = c.len ? Math.min(c.len, dur(path)) : dur(path);
  if (c.len && c.len < dur(path)) {
    const fade = Math.min(0.30, c.len * 0.35);
    chainCap = `,atrim=0:${c.len.toFixed(3)},asetpts=N/SR/TB,afade=t=out:st=${(c.len-fade).toFixed(3)}:d=${fade.toFixed(3)}`;
    capped.push(`${c.name}@${c.t} ${dur(path).toFixed(2)}s->${c.len.toFixed(2)}s`);
  } else chainCap = "";
  const next = cues[i + 1];
  const room = next ? next.t - c.t - GAP : Infinity;
  let chain = `aformat=sample_rates=48000:channel_layouts=stereo` + chainCap;
  if (room < natural) {
    if (room < MIN) {
      console.error(`collision: ${c.name} @${c.t} leaves only ${room.toFixed(2)}s before ${next.name} @${next.t}`);
      process.exit(1);
    }
    const fade = Math.min(0.35, room * 0.4);
    chain += `,atrim=0:${room.toFixed(3)},asetpts=N/SR/TB,afade=t=out:st=${(room - fade).toFixed(3)}:d=${fade.toFixed(3)}`;
    trimmed.push(`${c.name}@${c.t} ${natural.toFixed(2)}s->${room.toFixed(2)}s`);
  }
  parts.push(`[${i + 1}:a]${chain},adelay=${ms}|${ms},volume=${c.g}dB[s${i}]`);
});
const bus = cues.map((_, i) => `[s${i}]`).join("");
const fc = parts.join(";") +
  `;${bus}amix=inputs=${cues.length}:normalize=0:duration=longest[sfx]` +
  `;[0:a][sfx]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89:level=disabled[a]`;

args.push("-filter_complex", fc, "-map", "0:v", "-map", "[a]",
          "-c:v", "copy", "-c:a", "pcm_s24le", "-ar", "48000", "-y", OUT);

const r = require("child_process").spawnSync("ffmpeg", args, { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status);

// Report what actually went in. A repeated sound is a decision, not a bug - a click
// has to be the same every time - so print the counts and let the cue sheet explain
// itself rather than calling every repeat an error.
const seen = new Map();
for (const c of cues) seen.set(c.name, (seen.get(c.name) || 0) + 1);
console.log(`${cues.length} cues, ${seen.size} distinct sounds: ` +
  [...seen].map(([k, n]) => n > 1 ? `${k} x${n}` : k).join(", "));
if (capped.length) console.log(`capped on purpose: ${capped.join(", ")}`);
console.log(trimmed.length
  ? `faded early so nothing doubles up: ${trimmed.join(", ")}`
  : "no cue runs into the next one");
