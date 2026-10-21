// The bed's lift where it is the ONLY new sound: envelope gaps in the dialogue, minus every
// span an SFX cue occupies. add_music_bed.sh samples whole seconds of the pre-bed mix, and on
// an SFX-dense reel nearly all of those land on an effect - so its floor measures the SFX.
//   node bedcheck.js <dialogue.wav> <cues.txt> <sfxdir> <pre-bed mix> <delivered>
const {spawnSync, execFileSync}=require("child_process"), fs=require("fs");
const [,,DLG,CUES,DIR,PRE,DEL]=process.argv;
const SR=16000,HOP=320;
const b=execFileSync("ffmpeg",["-nostdin","-v","error","-i",DLG,"-f","f32le","-ac","1","-ar",String(SR),"-"],{maxBuffer:1e9});
const x=new Float32Array(b.buffer,b.byteOffset,b.length/4), fr=[];
for(let i=0;i+HOP<=x.length;i+=HOP){let s=0;for(let k=0;k<HOP;k++)s+=x[i+k]*x[i+k];fr.push(10*Math.log10(s/HOP+1e-12));}
const floor=[...fr].sort((a,c)=>a-c)[Math.floor(fr.length*0.05)];
const gaps=[];let s=-1; for(let i=0;i<fr.length;i++){ if(fr[i]<floor+6){if(s<0)s=i;} else if(s>=0){gaps.push([s*HOP/SR,i*HOP/SR]);s=-1;} }
const dur=f=>parseFloat(execFileSync("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",f]).toString());
const busy=fs.readFileSync(CUES,"utf8").split("\n").map(l=>l.replace(/#.*/,"").trim()).filter(Boolean)
  .map(l=>{const q=l.split(/\s+/); const t=+q[1]; const L=q[3]?+q[3]:dur(`${DIR}/${q[0]}.wav`); return [t-0.02,t+L+0.05];});
const free=[]; for(const [a,c] of gaps){ let segs=[[a+0.03,c-0.03]];
  for(const [u,v] of busy) segs=segs.flatMap(([p,q])=> v<=p||u>=q ? [[p,q]] : [[p,Math.min(q,u)],[Math.max(p,v),q]].filter(([m,n])=>n-m>0));
  free.push(...segs.filter(([m,n])=>n-m>=0.18)); }
const rms=(f,t,d)=>{const r=spawnSync("ffmpeg",["-nostdin","-v","info","-ss",String(t),"-t",String(d),"-i",f,"-af","astats=metadata=1","-f","null","-"],{encoding:"utf8"});
  const m=r.stderr.match(/RMS level dB:\s*(-?[\d.]+|-inf)/); return m?(m[1]==="-inf"?-120:+m[1]):NaN;};
const lifts=free.slice(0,12).map(([a,c])=>{const p=rms(PRE,a,c-a), q=rms(DEL,a,c-a); return [a,p,q,q-p];});
lifts.forEach(([a,p,q,l])=>console.log(`  gap ${a.toFixed(2)}  before ${p.toFixed(1)}  after ${q.toFixed(1)}  lift ${l>=0?"+":""}${l.toFixed(1)} dB`));
const L=lifts.map(z=>z[3]).sort((a,c)=>a-c);
console.log(`free gaps found ${free.length} | measured ${lifts.length} | median lift ${L[L.length>>1].toFixed(1)} dB | min ${L[0].toFixed(1)} dB`);
