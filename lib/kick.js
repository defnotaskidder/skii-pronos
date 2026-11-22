// Kick-off waves: one alert each time games kick off ("⚽ 6 matchs commencent"), built from the
// schedule alone, so it needs no live feed. Shared by the server (lib/alerts.js: web push, with the
// site closed) and the browser (app/components/Notify.js: while a tab is open). The same games give
// the same tag on both sides, so a device that receives both shows one notification.
//
// A game here is { id, d: kick-off (ms), s: sport, h: home, a: away, r?: top-pick rank, tier?: league tier }.

// A kick-off older than this is no longer announced (computer asleep, job late).
export const WAVE_GRACE = 10 * 60e3;

// Does this device want the wave for a game of `sport`? prefs.starts on; prefs.startsSport "all" | "soccer".
export const waveWants = (prefs, sport) => prefs?.starts === true && (prefs.startsSport !== "soccer" || sport === "soccer");

// The games that kicked off in (since, now], never further back than the grace.
export function dueGames(games, since, now) {
  const from = Math.max(since || 0, now - WAVE_GRACE);
  return (games || []).filter((g) => g.d > from && g.d <= now);
}

// The wave one device gets: its sports only; followed games first, then the day's top picks, then
// the bigger leagues.
export function waveFor(due, prefs, follows) {
  const mine = follows instanceof Set ? follows : new Set(follows || []);
  return due.filter((g) => waveWants(prefs, g.s))
    .sort((a, b) => (mine.has(b.id) - mine.has(a.id)) || ((a.r ?? 99) - (b.r ?? 99)) || ((a.tier ?? 9) - (b.tier ?? 9)) || a.d - b.d);
}

export const waveTag = (list) => `starts-${Math.floor(Math.min(...list.map((g) => g.d)) / 60e3)}`;

// Title and body of the alert; `t(key, vars)` translates.
export function waveText(list, t) {
  if (list.length === 1) return { title: t("Kick-off: {home} – {away}", { home: list[0].h, away: list[0].a }), body: t("The match has started.") };
  const shown = list.slice(0, 3).map((g) => `${g.h} – ${g.a}`).join(" · ");
  return { title: t("⚽ {n} matches kicking off", { n: list.length }), body: list.length > 3 ? `${shown} +${list.length - 3}` : shown };
}
