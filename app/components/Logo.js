"use client";
import { useEffect, useId, useState } from "react";

let played = false; // the draw-in plays once per visit, not on every page change

// The Skii Pronos mark: an "S" whose top stroke rises into an arrow — the pick going up.
// `animate` draws the stroke in on first paint; hover nudges the arrow (see .logo-mark CSS).
export function LogoMark({ size = 38, animate = false, className = "" }) {
  const id = useId().replace(/:/g, "");
  const [draw] = useState(() => animate && !played);
  useEffect(() => { if (draw) played = true; }, [draw]);
  return (
    <svg className={`logo-mark ${draw ? "draw" : ""} ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Skii Pronos">
      <defs>
        <linearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset=".55" stopColor="#c026d3" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <radialGradient id={`hl${id}`} cx=".22" cy=".12" r=".85">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`sh${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`cl${id}`}><rect width="64" height="64" rx="18" /></clipPath>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#bg${id})`} />
      <rect width="64" height="64" rx="18" fill={`url(#hl${id})`} />
      <g clipPath={`url(#cl${id})`}><rect className="lm-shine" x="-40" y="-10" width="28" height="84" fill={`url(#sh${id})`} transform="rotate(20 32 32)" /></g>
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="17.25" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.5" />
      <g transform="translate(0 2.6)" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path className="lm-s" pathLength="100" d="M19 44.5C23 49.5 44.5 50 44.5 40.5C44.5 32.5 20 33.5 20 24.5C20 17 33 15.5 45.5 13.5" />
        <path className="lm-arrow" d="M39.2 9.4 45.5 13.5 40.8 19.3" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 38, sub, animate = false }) {
  return (
    <span className="logo-lock">
      <LogoMark size={size} animate={animate} />
      <span>
        <span className="brand-name">Skii <span className="grad-text">Pronos</span></span>
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </span>
  );
}
