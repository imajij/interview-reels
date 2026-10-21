// Real quiet windows from the audio envelope - whisper's token end times are padded.
const {execFileSync}=require("child_process");
const SR=16000, HOP=320, F=process.argv[2];
const buf=execFileSync("ffmpeg",["-nostdin","-v","error","-i",F,"-f","f32le","-ac","1","-ar",String(SR),"-"],{maxBuffer:1e9});
const n=buf.length/4, x=new Float32Array(buf.buffer,buf.byteOffset,n);
const fr=[]; for(let i=0;i+HOP<=n;i+=HOP){ let s=0; for(let k=0;k<HOP;k++){const v=x[i+k]; s+=v*v;} fr.push(10*Math.log10(s/HOP+1e-12)); }
const sorted=[...fr].sort((a,b)=>a-b), floor=sorted[Math.floor(sorted.length*0.05)], TH=floor+6;
let runs=[],s=-1;
for(let i=0;i<fr.length;i++){ if(fr[i]<TH){ if(s<0)s=i; } else if(s>=0){ runs.push([s*HOP/SR,i*HOP/SR]); s=-1; } }
const good=runs.filter(r=>r[1]-r[0]>=0.18);
console.log("floor",floor.toFixed(1),"dB | quiet windows >=180ms:",good.length);
console.log(good.map(r=>r[0].toFixed(2)+"-"+r[1].toFixed(2)).join("  "));
