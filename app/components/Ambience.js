"use client";
// Background snow and the Juice WRLD music player, each with its own on/off switch (remembered per
// browser). Both are built to cost nothing on a slow phone:
//  • snow: one canvas, ~40 flakes on a phone, capped pixel ratio, paused while the tab is hidden,
//    off for visitors who ask their system for reduced motion;
//  • music: nothing loads until it's switched on. Songs can't be hosted here (they're copyrighted),
//    so it's Spotify's official player for Juice WRLD — full tracks for Spotify listeners, 30-second
//    previews otherwise. Browsers never let a site start sound by itself: the visitor presses play.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons";
import { load, save } from "./store";
import { useT } from "./Lang";

const Ctx = createContext({ snow: true, music: false, setSnow: () => {}, setMusic: () => {} });
export const useAmbience = () => useContext(Ctx);
export const JUICE_WRLD = "https://open.spotify.com/embed/artist/4MCBfE4596Uoi2O4DtmEMz?utm_source=generator&theme=0";

export function AmbienceProvider({ children }) {
  const [snow, setSnowState] = useState(true);
  const [music, setMusicState] = useState(false);
  useEffect(() => { setSnowState(load("skii-snow", true)); setMusicState(load("skii-music", false)); }, []);
  // the dock sits above the tab bar: the page and the slip button make room for it while it's open
  useEffect(() => { document.body.classList.toggle("has-music", music); }, [music]);
  const value = useMemo(() => ({
    snow, music,
    setSnow: (v) => { setSnowState(v); save("skii-snow", v); },
    setMusic: (v) => { setMusicState(v); save("skii-music", v); },
  }), [snow, music]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {snow && <Snow />}
      {music && <MusicDock onClose={() => value.setMusic(false)} />}
    </Ctx.Provider>
  );
}

function Snow() {
  const ref = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current, ctx = cv.getContext("2d");
    let w = 0, h = 0, raf = 0, flakes = [], last = 0;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(110, Math.max(36, (w * h) / 16000)));
      while (flakes.length < n) flakes.push(make(true));
      flakes.length = n;
    };
    const make = (anywhere) => ({
      x: Math.random() * w, y: anywhere ? Math.random() * h : -10,
      r: 0.8 + Math.random() * 2.2, v: 18 + Math.random() * 38, drift: Math.random() * Math.PI * 2, a: 0.35 + Math.random() * 0.5,
    });
    const frame = (t) => {
      const dt = Math.min(0.05, (t - (last || t)) / 1000); last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      for (const f of flakes) {
        f.y += f.v * dt; f.drift += dt * 0.8; f.x += Math.sin(f.drift) * 12 * dt;
        if (f.y > h + 8) Object.assign(f, make(false));
        ctx.globalAlpha = f.a;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    const vis = () => { cancelAnimationFrame(raf); if (document.visibilityState === "visible") { last = 0; raf = requestAnimationFrame(frame); } };
    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", vis);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return <canvas ref={ref} className="snow" aria-hidden="true" />;
}

function MusicDock({ onClose }) {
  const { t } = useT();
  return (
    <div className="music-dock" role="region" aria-label={t("Music")}>
      <div className="music-dock-head">
        <Icon name="music" size={15} /><b>Juice WRLD</b>
        <span className="spacer" />
        <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label={t("Turn the music off")} onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      <iframe title="Juice WRLD — Spotify" src={JUICE_WRLD} width="100%" height="80" frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
    </div>
  );
}

// Header buttons: music on/off (the player keeps playing while you move between pages).
export function MusicButton() {
  const { music, setMusic } = useAmbience();
  const { t } = useT();
  return (
    <button className={`tile-btn ${music ? "on" : ""}`} aria-pressed={music} aria-label={music ? t("Turn the music off") : t("Play Juice WRLD")} title={music ? t("Turn the music off") : t("Play Juice WRLD")} onClick={() => setMusic(!music)}>
      <Icon name="music" />
    </button>
  );
}
export function SnowSwitch() {
  const { snow, setSnow } = useAmbience();
  const { t } = useT();
  return (
    <label className="switch-row">
      <span><Icon name="snow" size={16} /> {t("Falling snow")}</span>
      <input type="checkbox" checked={snow} onChange={(e) => setSnow(e.target.checked)} />
    </label>
  );
}
export function MusicSwitch() {
  const { music, setMusic } = useAmbience();
  const { t } = useT();
  return (
    <label className="switch-row">
      <span><Icon name="music" size={16} /> {t("Juice WRLD music (Spotify player)")}</span>
      <input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} />
    </label>
  );
}
