/* Caption states -> PNGs with alpha.  Run under a browser-backed node runtime
 * for canvas + system fonts, e.g.:
 *
 *   ego-browser nodejs < render_captions.js
 *
 * Set STATES / OUTDIR below. Fusion Text+ cannot be driven reliably through the
 * Resolve API (it renders empty frames), so captions are baked here and dropped
 * on a video track as an alpha ProRes clip.
 */
const STATES = process.env.STATES || "/tmp/caps.json";
const OUTDIR = process.env.OUTDIR || "/tmp/capspng";
const COLOUR = { H: "#FFD21E", G: "#1B8CFF" };   // host yellow, guest blue
const BASELINE_Y = 1382;                          // ~0.72 of 1920, clear of UI chrome

const fs = await import("node:fs/promises");
const task = await takeOverTaskSpace(1);
const page = task.page("p1");
const data = JSON.parse(await fs.readFile(STATES, "utf8"));
await fs.mkdir(OUTDIR, { recursive: true });

for (let i = 0; i < data.states.length; i++) {
  const st = data.states[i];
  const b64 = await page.evaluate((job) => {
    const W = 1080, H = 1920;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const font = s => `800 ${s}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;
    let size = 78;
    const measure = s => { g.font = font(s); return job.words.reduce((t, w) => t + g.measureText(w + " ").width, 0); };
    while (measure(size) > 940 && size > 40) size -= 2;   // keep inside a safe margin
    g.font = font(size); g.textBaseline = "middle"; g.textAlign = "left";
    const widths = job.words.map(w => g.measureText(w + " ").width);
    let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
    for (let k = 0; k < job.words.length; k++) {
      const active = k === job.active;
      g.lineWidth = Math.round(size * 0.20); g.lineJoin = "round"; g.miterLimit = 2;
      g.strokeStyle = active ? "#ffffff" : "rgba(0,0,0,0.92)";
      g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = 14; g.shadowOffsetY = 5;
      g.strokeText(job.words[k], x, job.y);
      g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
      g.fillStyle = active ? job.hl : "#ffffff";
      g.fillText(job.words[k], x, job.y);
      x += widths[k];
    }
    return c.toDataURL("image/png").split(",")[1];
  }, { words: st.words, active: st.active, hl: COLOUR[st.sp] || COLOUR.G, y: BASELINE_Y });
  await fs.writeFile(`${OUTDIR}/c${String(i).padStart(4, "0")}.png`, Buffer.from(b64, "base64"));
  if (i % 40 === 0) console.log("rendered", i, "/", data.states.length);
}
console.log("done", data.states.length, "->", OUTDIR);
