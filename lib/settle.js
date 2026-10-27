// Settlement of a market key against a final score — pure functions with no dependency on the
// engines, so the browser (saved picks, live top-pick results) loads this file alone.
// Keys are the market keys lib/model.js and lib/hockey.js produce.

// ---------- settlement ----------
// `ot`: null (regulation), "OT" or "SO". ESPN credits the shootout winner with one goal in the
// final score; totals and team totals leave it out, the moneyline and puck line keep it.
export function hockeySettle(key, hs, as, ot = null) {
  if (hs === null || as === null || hs === undefined || as === undefined) return null;
  const so = ot === "SO";
  const gh = so && hs > as ? hs - 1 : hs, ga = so && as > hs ? as - 1 : as; // goals that count
  const rh = ot ? Math.min(hs, as) : hs, ra = ot ? Math.min(hs, as) : as; // after 60 minutes
  const d = hs - as, t = gh + ga;
  const W = (c) => (c ? "W" : "L");
  let m;
  if (key === "1") return W(d > 0);
  if (key === "2") return W(d < 0);
  if (key === "R1") return W(!ot && d > 0);
  if (key === "RX") return W(!!ot);
  if (key === "R2") return W(!ot && d < 0);
  if (key === "R1X") return W(!!ot || d > 0);
  if (key === "RX2") return W(!!ot || d < 0);
  if (key === "OTY") return W(!!ot);
  if (key === "OTN") return W(!ot);
  if ((m = key.match(/^O([\d.]+)$/))) return t > +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^U([\d.]+)$/))) return t < +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^HO([\d.]+)$/))) return W(gh > +m[1]);
  if ((m = key.match(/^AO([\d.]+)$/))) return W(ga > +m[1]);
  if ((m = key.match(/^HU([\d.]+)$/))) return W(gh < +m[1]);
  if ((m = key.match(/^AU([\d.]+)$/))) return W(ga < +m[1]);
  if (key === "ODD") return W(t % 2 === 1);
  if (key === "EVEN") return W(t % 2 === 0);
  if ((m = key.match(/^WM([12])-(\d)$/))) { const x = m[1] === "1" ? d : -d; return W(+m[2] === 3 ? x >= 3 : x === +m[2]); }
  if ((m = key.match(/^RCS(\d+)-(\d+)$/))) return W(rh === +m[1] && ra === +m[2]);
  if ((m = key.match(/^AH([12])([+-][\d.]+)$/))) { const x = (m[1] === "1" ? d : -d) + +m[2]; return x > 0 ? "W" : x === 0 ? "V" : "L"; }
  return null;
}

// ---------- settlement ----------
// `ctx` = { sport, ot } for hockey (how the game ended decides totals and 60-minute markets).
export function settle(key, hs, as, ctx = null) {
  if (hs === null || as === null || hs === undefined || as === undefined) return null;
  if (ctx?.sport === "hockey") return hockeySettle(key, hs, as, ctx.ot ?? null);
  if (ctx?.sport === "football") return nflSettle(key, hs, as, ctx.ot ?? null); // ties void the moneyline
  const d = hs - as, t = hs + as;
  const ah = (line, side) => { const x = (side === "home" ? d : -d) + line; return x > 0 ? "W" : x === 0 ? "V" : "L"; };
  let m;
  if (key === "1") return d > 0 ? "W" : "L";
  if (key === "X") return d === 0 ? "W" : "L";
  if (key === "2") return d < 0 ? "W" : "L";
  if (key === "1X") return d >= 0 ? "W" : "L";
  if (key === "X2") return d <= 0 ? "W" : "L";
  if (key === "12") return d !== 0 ? "W" : "L";
  if (key === "DNB1") return d > 0 ? "W" : d === 0 ? "V" : "L";
  if (key === "DNB2") return d < 0 ? "W" : d === 0 ? "V" : "L";
  if (key === "BTTS_Y") return hs > 0 && as > 0 ? "W" : "L";
  if (key === "BTTS_N") return hs > 0 && as > 0 ? "L" : "W";
  if (key === "H_CS") return as === 0 ? "W" : "L";
  if (key === "A_CS") return hs === 0 ? "W" : "L";
  if (key === "1_O1.5") return d > 0 && t > 1 ? "W" : "L";
  if (key === "2_O1.5") return d < 0 && t > 1 ? "W" : "L";
  if (key === "1X_U3.5") return d >= 0 && t < 4 ? "W" : "L";
  if (key === "X2_U3.5") return d <= 0 && t < 4 ? "W" : "L";
  if ((m = key.match(/^O([\d.]+)$/))) return t > +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^U([\d.]+)$/))) return t < +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^HO([\d.]+)$/))) return hs > +m[1] ? "W" : "L";
  if ((m = key.match(/^AO([\d.]+)$/))) return as > +m[1] ? "W" : "L";
  if ((m = key.match(/^HU([\d.]+)$/))) return hs < +m[1] ? "W" : "L";
  if ((m = key.match(/^AU([\d.]+)$/))) return as < +m[1] ? "W" : "L";
  if (key === "TG5+") return t >= 5 ? "W" : "L";
  if ((m = key.match(/^TG(\d+)$/))) return t === +m[1] ? "W" : "L";
  if (key === "ODD") return t % 2 === 1 ? "W" : "L";
  if (key === "EVEN") return t % 2 === 0 ? "W" : "L";
  if ((m = key.match(/^WM([12])-(\d)$/))) { const x = m[1] === "1" ? d : -d; return (+m[2] === 3 ? x >= 3 : x === +m[2]) ? "W" : "L"; }
  if ((m = key.match(/^CS(\d+)-(\d+)$/))) return hs === +m[1] && as === +m[2] ? "W" : "L";
  if ((m = key.match(/^AH1([+-][\d.]+)$/))) return ah(+m[1], "home");
  if ((m = key.match(/^AH2([+-][\d.]+)$/))) return ah(+m[1], "away");
  return null;
}
