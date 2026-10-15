"use client";
// Motion helpers: a cursor spotlight on cards, scroll reveal, count-up numbers and a
// flash when a live value changes. Everything respects prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const SPOT = ".card, .mrow, .lcard, .pitem, .leg, .odd, .chip";

// Mounted once in the shell.
export function MotionLayer() {
  useEffect(() => {
    if (reduced()) { document.documentElement.classList.add("no-motion"); return; }

    // spotlight: the hovered card gets --mx/--my at the pointer position
    let raf = 0, last = null;
    const move = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = e.target.closest?.(SPOT);
        if (last && last !== el) last.classList.remove("lit");
        if (!el) { last = null; return; }
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
        el.classList.add("lit");
        last = el;
      });
    };
    const leave = () => { last?.classList.remove("lit"); last = null; };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);

    // reveal: [data-reveal] elements fade up when they scroll into view (also ones added later)
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
    const watch = (root) => root.querySelectorAll?.("[data-reveal]:not(.in)").forEach((el) => io.observe(el));
    watch(document);
    const mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches?.("[data-reveal]")) io.observe(n); watch(n); } }); });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      io.disconnect(); mo.disconnect(); cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="aurora" aria-hidden="true">
      <i className="a1" /><i className="a2" /><i className="a3" />
    </div>
  );
}

const ease = (t) => 1 - (1 - t) ** 3;

// Animated number: counts from its previous value to the new one.
export function CountUp({ value, decimals = 0, duration = 750, prefix = "", suffix = "" }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced()) { setShown(target); from.current = target; return; }
    const start = performance.now(), a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(a + (target - a) * ease(t));
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, duration]);
  return <>{prefix}{shown.toFixed(decimals)}{suffix}</>;
}

// true for ~1.2s whenever `value` changes after the first render (score flashes, badge bumps).
export function useFlash(value, ms = 1200) {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return on;
}
