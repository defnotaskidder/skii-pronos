// When are goals scored? A sample of finished games' key events (ESPN summaries, fetched gently).
import fs from "node:fs";
const picks = JSON.parse(fs.readFileSync(new URL("./picks.json", import.meta.url), "utf8")).filter((g) => g.sport === "soccer" && g.home_score != null);
const N = Number(process.argv[2] || 600);
// spread over leagues: every k-th game
const step = Math.max(1, Math.floor(picks.length / N));
const sample = picks.filter((_, i) => i % step === 0).slice(0, N);
const UA = { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
let i = 0, fail = 0;
async function worker() {
  while (i < sample.length) {
    const g = sample[i++];
    try {
      let d = null;
      for (let t = 0, w = 1500; t < 4 && !d; t++, w *= 2) { const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${g.league}/summary?event=${g.event_id}`, { headers: UA }); if (r.ok) d = await r.json(); else if (r.status === 404 || r.status === 400) break; else await sleep(w); }
      if (!d) { fail++; continue; }
      const goals = (d.keyEvents || []).filter((k) => k.scoringPlay && !/shootout/i.test(k.type?.text || "")).map((k) => ({ c: k.clock?.displayValue || "", p: k.period?.number ?? null, t: k.type?.text || "" }));
      out.push({ id: g.event_id, league: g.league, hs: g.home_score, as: g.away_score, goals, has: (d.keyEvents || []).length });
    } catch { fail++; }
    await sleep(250);
  }
}
await Promise.all([worker(), worker(), worker()]);
fs.writeFileSync(new URL("./goaltimes.json", import.meta.url), JSON.stringify(out));
// keep only games whose listed goals match the final score (complete timelines)
const ok = out.filter((g) => g.goals.length === g.hs + g.as && g.hs + g.as > 0);
console.log("fetched", out.length, "failed", fail, "with complete goal list", ok.length, "of", out.filter((g) => g.hs + g.as > 0).length, "games with goals");
const mins = [];
for (const g of ok) for (const x of g.goals) { const m = x.c.match(/^(\d+)'?(?:\+(\d+))?/); if (!m) continue; mins.push({ base: +m[1], add: +(m[2] || 0), p: x.p }); }
console.log("goals", mins.length, "periods", JSON.stringify(mins.reduce((a, x) => { a[x.p] = (a[x.p] || 0) + 1; return a; }, {})));
const seg = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75], [76, 90]];
const reg = mins.filter((x) => x.base <= 90);
let cum = 0;
for (const [lo, hi] of seg) { const n = reg.filter((x) => x.base >= lo && x.base <= hi).length, st = reg.filter((x) => x.base >= lo && x.base <= hi && x.add > 0).length; cum += n; console.log(`${lo}-${hi}:`, n, (n / reg.length * 100).toFixed(1) + "%", "cumulative", (cum / reg.length * 100).toFixed(1) + "%", st ? `(of which stoppage ${st}, ${(st / reg.length * 100).toFixed(1)}%)` : ""); }
console.log("first half share", (reg.filter((x) => x.base <= 45).length / reg.length * 100).toFixed(1) + "%");
