// Downloads every graded pick of the last 60 days from the site (public, read-only) into picks.json.
import fs from "node:fs";
const base = "https://skii-pronos.vercel.app/api/results?days=60";
let before = null, all = [], seen = new Set();
for (let page = 0; page < 12; page++) {
  const r = await fetch(base + (before ? `&before=${encodeURIComponent(before)}` : ""));
  const d = await r.json();
  const g = d.games || [];
  let add = 0;
  for (const x of g) if (!seen.has(x.event_id)) { seen.add(x.event_id); all.push(x); add++; }
  console.log("page", page, "status", r.status, "rows", g.length, "new", add, g.length ? g.at(-1).kickoff : "", d.error || "");
  if (g.length < 1500 || !add) break;
  before = g.at(-1).kickoff;
}
fs.writeFileSync(new URL("./picks.json", import.meta.url), JSON.stringify(all));
console.log("total", all.length, "from", all.at(-1)?.kickoff, "to", all[0]?.kickoff, "with probs", all.filter((x) => x.probs).length);
