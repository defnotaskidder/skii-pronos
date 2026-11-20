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
// Corners and yellow-card markets (lib/extras.js) are graded from the match statistics, not the
// score: ctx.stats = { ch, ca, yh, ya, sh, sa } (corners, yellow cards, shots on target; home/away).
export const EXTRA_KEY = /^(CR|YC|SO)/;
// From a summary's stats block ({ wonCorners: { home, away }, yellowCards: { home, away } }).
export function extraStats(stats) {
  const c = stats?.wonCorners, y = stats?.yellowCards, sh = stats?.shotsOnTarget;
  const n = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const out = { ch: n(c?.home), ca: n(c?.away), yh: n(y?.home), ya: n(y?.away), sh: n(sh?.home), sa: n(sh?.away) };
  return out.ch === null && out.yh === null && out.sh === null ? null : out;
}
function settleExtra(key, st) {
  if (!st) return null;
  let m;
  const W = (c) => (c ? "W" : "L");
  if ((m = key.match(/^CR(O|U)([\d.]+)$/))) { if (st.ch === null || st.ca === null) return null; const t = st.ch + st.ca; return W(m[1] === "O" ? t > +m[2] : t < +m[2]); }
  if ((m = key.match(/^CR(H|A)O([\d.]+)$/))) { const v = m[1] === "H" ? st.ch : st.ca; return v === null ? null : W(v > +m[2]); }
  if (key === "CR1X" || key === "CRX2") { if (st.ch === null || st.ca === null) return null; return W(key === "CR1X" ? st.ch >= st.ca : st.ca >= st.ch); }
  if (key.startsWith("SO")) {
    const h = st.sh ?? null, a = st.sa ?? null;
    if ((m = key.match(/^SO(O|U)([\d.]+)$/))) { if (h === null || a === null) return null; const t = h + a; return W(m[1] === "O" ? t > +m[2] : t < +m[2]); }
    if ((m = key.match(/^SO(H|A)O([\d.]+)$/))) { const v = m[1] === "H" ? h : a; return v === null ? null : W(v > +m[2]); }
    if (key === "SO1X" || key === "SOX2") { if (h === null || a === null) return null; return W(key === "SO1X" ? h >= a : a >= h); }
    return null;
  }
  if ((m = key.match(/^YC(O|U)([\d.]+)$/))) { if (st.yh === null || st.ya === null) return null; const t = st.yh + st.ya; return W(m[1] === "O" ? t > +m[2] : t < +m[2]); }
  return null;
}

export function settle(key, hs, as, ctx = null) {
  if (EXTRA_KEY.test(key)) return settleExtra(key, ctx?.stats || null);
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
  if ((m = key.match(/^(1|2|1X|X2|12)_(?:(O|U)([\d.]+)|BTTS(Y|N))$/)) || (m = key.match(/^BTTS(Y|N)_(O|U)([\d.]+)$/))) {
    const both = hs > 0 && as > 0;
    if (key.startsWith("BTTS")) return (m[1] === "Y" ? both : !both) && (m[2] === "O" ? t > +m[3] : t < +m[3]) ? "W" : "L";
    const res = { 1: d > 0, 2: d < 0, "1X": d >= 0, X2: d <= 0, 12: d !== 0 }[m[1]];
    const second = m[2] ? (m[2] === "O" ? t > +m[3] : t < +m[3]) : (m[4] === "Y" ? both : !both);
    return res && second ? "W" : "L";
  }
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

// ---------- settlement ----------
// Final score includes overtime. `ot` = "OT" when the game went past 60 minutes (ESPN "Final/OT").
// A tie voids the moneyline (US books), spreads and totals push on their exact number.
export function nflSettle(key, hs, as, ot = null) {
  if (hs === null || as === null || hs === undefined || as === undefined) return null;
  const d = hs - as, t = hs + as, extra = !!ot;
  const W = (c) => (c ? "W" : "L");
  let m;
  if (key === "1") return d > 0 ? "W" : d === 0 ? "V" : "L";
  if (key === "2") return d < 0 ? "W" : d === 0 ? "V" : "L";
  if (key === "R1") return W(!extra && d > 0);
  if (key === "RX") return W(extra);
  if (key === "R2") return W(!extra && d < 0);
  if (key === "R1X") return W(extra || d > 0);
  if (key === "RX2") return W(extra || d < 0);
  if (key === "OTY") return W(extra);
  if (key === "OTN") return W(!extra);
  if (key === "ODD") return W(t % 2 === 1);
  if (key === "EVEN") return W(t % 2 === 0);
  if ((m = key.match(/^O([\d.]+)$/))) return t > +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^U([\d.]+)$/))) return t < +m[1] ? "W" : t === +m[1] ? "V" : "L";
  if ((m = key.match(/^([HA])([OU])([\d.]+)$/))) {
    const pts = m[1] === "H" ? hs : as, L = +m[3];
    if (pts === L) return "V";
    return W(m[2] === "O" ? pts > L : pts < L);
  }
  if ((m = key.match(/^WMR([12])-(\d+)(?:-(\d+)|\+)$/))) {
    const x = m[1] === "1" ? d : -d, lo = +m[2], hi = m[3] ? +m[3] : Infinity;
    return W(x >= lo && x <= hi);
  }
  if ((m = key.match(/^AH([12])([+-][\d.]+)$/))) { const x = (m[1] === "1" ? d : -d) + +m[2]; return x > 0 ? "W" : x === 0 ? "V" : "L"; }
  return null;
}
