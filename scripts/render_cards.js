const fs = await import("node:fs/promises");
const task = await takeOverTaskSpace(1);
const page = task.page("p1");
const OUT = process.env.CARDS_OUT || "./cards";   // where the card PNGs are written
// Placeholders. Per-reel text comes from a JSON file named by CARDS_CONFIG;
// any key it leaves out falls back to these.
const DEFAULTS = {
  brand: "YOUR BRAND",
  site: "YOURBRAND.COM",
  hook: ["THE LINE THAT", "STOPS THE SCROLL"],
  badge: "LIVE FROM THE SHOW",
  introCrux: ["WHO THEY ARE", "AND THE TENSION", "IN THREE LINES"],
  outroProblem: ["THE PROBLEM", "THIS REEL SHOWED"],
  outroFix: "WE FIX THAT",
  outroCta: "DM US",
};
const CFG = { ...DEFAULTS,
  ...(process.env.CARDS_CONFIG ? JSON.parse(await fs.readFile(process.env.CARDS_CONFIG, "utf8")) : {}) };
const draw = async (kind, name) => {
  const b64 = await page.evaluate(({ kind, C }) => {
    const W = 1080, H = 1920;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const rr = (x,y,w,h,r)=>{g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();};
    const COND = s => `900 ${s}px Anton, Impact, "Arial Narrow", sans-serif`;
    const SANS = s => `800 ${s}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;
    const spaced = (t,x,y,sp)=>{let w=0;for(const ch of t)w+=g.measureText(ch).width+sp;w-=sp;let cx=x-w/2;for(const ch of t){g.fillText(ch,cx,y);cx+=g.measureText(ch).width+sp;}return w;};
    const outlined = (lines, yStart, size, maxW) => {
      g.textAlign="center"; g.textBaseline="middle";
      let s=size; const fit=v=>{g.font=COND(v);return Math.max(...lines.map(l=>g.measureText(l).width));};
      while (fit(s) > maxW && s > 40) s -= 3;
      g.font=COND(s); let y=yStart;
      for (const l of lines) {
        g.lineWidth=s*0.17; g.lineJoin="round"; g.miterLimit=2;
        g.shadowColor="rgba(0,0,0,0.6)"; g.shadowBlur=18; g.shadowOffsetY=6;
        g.strokeStyle="#000"; g.strokeText(l,W/2,y);
        g.shadowColor="transparent"; g.shadowBlur=0; g.shadowOffsetY=0;
        g.fillStyle="#fff"; g.fillText(l,W/2,y); y += s*1.02;
      }
      return y;
    };
    const badge = (t,y,fill,size)=>{g.font=SANS(size);g.textAlign="left";g.textBaseline="middle";
      let tw=0;for(const ch of t)tw+=g.measureText(ch).width+4;const bw=tw+52,bh=size*1.75,bx=(W-bw)/2;
      g.fillStyle=fill;rr(bx,y-bh/2,bw,bh,10);g.fill();g.fillStyle="#fff";spaced(t,W/2,y+2,4);};
    const chip = (y, size) => {
      g.font=SANS(size); let tw=0; for(const ch of C.brand) tw+=g.measureText(ch).width+4; tw-=4;
      const h=size*2.2, w=tw+h*1.9, x=(W-w)/2;
      g.fillStyle="rgba(8,8,10,0.92)"; rr(x,y,w,h,h/2); g.fill();
      g.fillStyle="#FF3B21"; rr(x+h*0.42,y+h*0.32,h*0.36,h*0.36,5); g.fill();
      g.fillStyle="#fff"; g.textAlign="left"; g.textBaseline="middle";
      let cx=x+h*1.1; for(const ch of C.brand){g.fillText(ch,cx,y+h/2+1);cx+=g.measureText(ch).width+4;}
    };

    if (kind === "chip") {                    // persistent top-left chip
      g.font=SANS(30); const label=C.brand; const sp=3.2;
      let tw=0; for(const ch of label) tw+=g.measureText(ch).width+sp;
      const px=90,py=196,h=54,w=tw+106;
      g.fillStyle="rgba(8,8,10,0.86)"; rr(px,py,w,h,h/2); g.fill();
      g.fillStyle="#FF3B21"; rr(px+18,py+17,20,20,5); g.fill();
      g.fillStyle="#fff"; g.textBaseline="middle"; g.textAlign="left";
      let x=px+52; for(const ch of label){g.fillText(ch,x,py+h/2+1);x+=g.measureText(ch).width+sp;}
    } else if (kind === "title") {            // hook title over the opening seconds
      g.font=SANS(30); const label=C.brand; const sp=3.2;
      let tw=0; for(const ch of label) tw+=g.measureText(ch).width+sp;
      const px=90,py=196,h=54,w=tw+106;
      g.fillStyle="rgba(8,8,10,0.86)"; rr(px,py,w,h,h/2); g.fill();
      g.fillStyle="#FF3B21"; rr(px+18,py+17,20,20,5); g.fill();
      g.fillStyle="#fff"; g.textBaseline="middle"; g.textAlign="left";
      let x=px+52; for(const ch of label){g.fillText(ch,x,py+h/2+1);x+=g.measureText(ch).width+sp;}
      const end = outlined(C.hook, 570, 116, 980);
      badge(C.badge, end + 10, "#E01B10", 30);
    } else if (kind === "intro") {            // crux of THIS reel, brand as footnote
      const end = outlined(C.introCrux, 760, 104, 960);
      chip(end + 30, 30);
    } else if (kind === "outro") {            // problem -> fix -> one action
      const end = outlined(C.outroProblem, 700, 140, 960);
      badge(C.outroFix, end + 20, "#E01B10", 30);
      g.font=COND(150); g.textAlign="center"; g.textBaseline="middle";
      g.lineWidth=26; g.lineJoin="round"; g.strokeStyle="#000"; g.strokeText(C.outroCta, W/2, end + 170);
      g.fillStyle="#FFC400"; g.fillText(C.outroCta, W/2, end + 170);
      g.font=SANS(34); g.fillStyle="rgba(255,255,255,0.9)"; g.textAlign="left";
      spaced(C.site, W/2, end + 280, 3);
    }
    return c.toDataURL("image/png").split(",")[1];
  }, { kind, C: CFG });
  await fs.writeFile(`${OUT}/${name}.png`, Buffer.from(b64, "base64"));
  console.log("wrote", name);
};
await draw("chip", "chip");
await draw("title", "title");
await draw("intro", "intro_card");
await draw("outro", "outro_card");
