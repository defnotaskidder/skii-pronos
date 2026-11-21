// Goal and red-card timelines of finished games (ESPN summaries, fetched gently), with the side
// each one belongs to, so a game can be replayed minute by minute: live.mjs prices every replayed
// minute with the live model and checks it against the final score. Needs picks.json (pull.mjs).
//   node livepull.mjs 2400      bookmaker-priced games first, then the others
import fs from "node:fs";
const here = (f) => new URL(f, import.meta.url);
const picks = JSON.parse(fs.readFileSync(here("./picks.json"), "utf8")).filter((g) => g.sport === "soccer" && g.home_score != null && g.probs?.h != null);
const N = Number(process.argv[2] || 2400);
// a game is "priced" when its pick had a bookmaker price, "derived" when its league is one a
// bookmaker prices (the pick's market was worked out from the 1X2), "model" otherwise
const byL = new Map();
for (const g of picks) { const x = byL.get(g.league) || { n: 0, pr: 0 }; x.n++; if (g.pick_est === false) x.pr++; byL.set(g.league, x); }
for (const g of picks) g.kind = g.probs.q ? (["market", "partial"].includes(g.probs.q) ? "priced" : "model") : g.pick_est === false ? "priced" : byL.get(g.league).pr / byL.get(g.league).n >= 0.15 ? "derived" : "model";
const rank = { priced: 0, derived: 1, model: 2 };
const have = fs.existsSync(here("./livetimes.json")) ? JSON.parse(fs.readFileSync(here("./livetimes.json"), "utf8")) : [];
const done = new Set(have.map((g) => g.id));
const todo = picks.filter((g) => !done.has(g.event_id)).sort((a, b) => rank[a.kind] - rank[b.kind] || (Number(a.event_id) % 97) - (Number(b.event_id) % 97)).slice(0, Math.max(0, N - have.length));
console.log("kinds", JSON.stringify(picks.reduce((a, g) => { a[g.kind] = (a[g.kind] || 0) + 1; return a; }, {})), "| already", have.length, "| to fetch", todo.length);
const UA = { accept: "application/json", "user-agent": "Mozilla/5.0 (compatible; SkiiPronos/1.0)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [...have];
let i = 0, fail = 0, since = 0;
const save = () => fs.writeFileSync(here("./livetimes.json"), JSON.stringify(out));
async function worker() {
  while (i < todo.length) {
    const g = todo[i++];
    try {
      let d = null;
      for (let t = 0, w = 1500; t < 4 && !d; t++, w *= 2) { const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${g.league}/summary?event=${g.event_id}`, { headers: UA }); if (r.ok) d = await r.json(); else if (r.status === 404 || r.status === 400) break; else await sleep(w); }
      if (!d) { fail++; continue; }
      const c = d.header?.competitions?.[0]?.competitors || [];
      const H = c.find((x) => x.homeAway === "home"), A = c.find((x) => x.homeAway === "away");
      const ev = (d.keyEvents || []).filter((k) => (k.scoringPlay || /red/i.test(k.type?.text || "")) && !/shootout/i.test(k.type?.text || ""))
        .map((k) => ({ c: k.clock?.displayValue || "", p: k.period?.number ?? null, t: k.type?.text || "", g: !!k.scoringPlay, team: k.team?.id ?? null }));
      out.push({ id: g.event_id, league: g.league, kind: g.kind, hs: g.home_score, as: g.away_score, probs: { h: g.probs.h, d: g.probs.d, a: g.probs.a }, home: H?.id ?? null, away: A?.id ?? null, n: (d.keyEvents || []).length, ev });
      if (++since >= 150) { since = 0; save(); console.log("fetched", out.length, "failed", fail); }
    } catch { fail++; }
    await sleep(250);
  }
}
await Promise.all([worker(), worker(), worker()]);
save();
console.log("done: games", out.length, "failed", fail, JSON.stringify(out.reduce((a, g) => { a[g.kind] = (a[g.kind] || 0) + 1; return a; }, {})));
