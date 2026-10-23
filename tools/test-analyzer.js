// Проверка анализатора на демо-треке с известными долями (Node, без браузера).
const fs = require("fs"), vm = require("vm"), path = require("path");
const ctx = { console, performance, setTimeout, Math, Float32Array, Float64Array, Int32Array, Uint8Array, Uint32Array, Promise };
vm.createContext(ctx);
for (const f of ["00_util.js", "03_demo.js", "04_analyzer.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/js", f), "utf8"), ctx, { filename: f });
vm.runInContext(`
class FakeBuffer { constructor(ch, n, sr){ this.numberOfChannels=ch; this.length=n; this.sampleRate=sr; this.duration=n/sr; this._d=[...Array(ch)].map(()=>new Float32Array(n)); } getChannelData(c){ return this._d[c]; } }
globalThis.fakeCtx = { sampleRate: Number(process_sr), createBuffer: (ch,n,sr)=>new FakeBuffer(ch,n,sr) };
`.replace("process_sr", process.argv[2] || 44100), ctx);
(async () => {
  const res = await vm.runInContext(`(async () => {
    const buf = DemoTrack.generate(fakeCtx);
    const an = new RhythmAnalyzer();
    const m = await an.analyze(buf);
    const truth = DemoTrack.truthBeats();
    // ошибки для долей в зоне, где играет бочка (после интро 4 такта)
    const errs = [];
    const segs = {}; for (let i = 0; i < truth.length; i++) {
      const t = truth[i]; const j = lowerIndex(m.beats, t + 0.2);
      let best = 1e9; for (let k = Math.max(0,j-1); k <= Math.min(m.beats.length-1, j+1); k++) if (Math.abs(m.beats[k]-t) < Math.abs(best)) best = m.beats[k]-t;
      errs.push(best); const sg = Math.floor(i/16); segs[sg] = (segs[sg]||[]).concat([Math.round(best*1000)]);
    }
    errs.sort((a,b)=>a-b);
    const strongIdx = []; for (let i=0;i<m.beats.length;i++) if (m.strong[i]) strongIdx.push(m.beats[i]);
    const barErr = strongIdx.slice(8, 16).map(t => (((t - DemoTrack.OFFSET) / (60/DemoTrack.BPM)) % 4 + 4) % 4);
    const segMed = Object.entries(segs).map(([k,v]) => k + ":" + v.sort((a,b)=>a-b)[v.length>>1]).join(" ");
    return { segMed, bounds: m.sections.map(s=>s.start.toFixed(2)).join(","), ms: m.ms, bpm: m.bpm, conf: m.confidence, mode: m.mode, n: m.beats.length, medErr: errs[errs.length>>1], p10: errs[Math.floor(errs.length*.1)], p90: errs[Math.floor(errs.length*.9)], maxAbs: Math.max(...errs.map(Math.abs)),
      firstBeats: Array.from(m.beats.slice(0,6)).map(x=>x.toFixed(3)), strongPhaseInBar: barErr.map(x=>x.toFixed(2)), sections: m.sections.map(s=>s.start.toFixed(1)+':'+s.level), features: m.features };
  })()`, ctx);
  console.log(JSON.stringify(res, null, 1));
})();
