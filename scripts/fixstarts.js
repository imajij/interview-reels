// whisper snapped each sentence's FIRST word to its segment boundary (x.00 / x.50), up to
// 0.45s before the word is actually spoken. Move every sentence-initial word to the end of
// the envelope quiet window it falls in - where speech really resumes.
const fs=require("fs"), {execFileSync}=require("child_process");
const [,,SRC,WAV,OUT]=process.argv;
const W=JSON.parse(fs.readFileSync(SRC,"utf8"));
const SR=16000,HOP=160;
const b=execFileSync("ffmpeg",["-nostdin","-v","error","-i",WAV,"-f","f32le","-ac","1","-ar",String(SR),"-"],{maxBuffer:1e9});
const x=new Float32Array(b.buffer,b.byteOffset,b.length/4), fr=[];
for(let i=0;i+HOP<=x.length;i+=HOP){let s=0;for(let k=0;k<HOP;k++)s+=x[i+k]*x[i+k];fr.push(10*Math.log10(s/HOP+1e-12));}
const floor=[...fr].sort((a,c)=>a-c)[Math.floor(fr.length*0.05)];
const loud=i=>fr[i]>floor+12;
let moved=[];
for(let i=1;i<W.length;i++){
  if(!/[.?!]"?$/.test(W[i-1].w)) continue;
  // first sustained onset (3 loud 10ms frames) between the old start and the next word
  const lo=Math.round(W[i].a*100), hi=Math.round(Math.min(W[i].a+0.6, (W[i+1]?W[i+1].a:W[i].a+0.6))*100);
  for(let f=lo; f<hi; f++){ if(loud(f)&&loud(f+1)&&loud(f+2)){ const t=f/100; if(t-W[i].a>0.04){ moved.push(`${W[i].w} ${W[i].a.toFixed(2)}->${t.toFixed(2)}`); W[i].a=t; } break; } }
}
fs.writeFileSync(OUT, JSON.stringify(W));
console.log("moved",moved.length,":",moved.join(" | "));
