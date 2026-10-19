// Inline stroke icons (no icon library).
const P = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  ball: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5 3.6 2.6-1.4 4.2H9.8L8.4 10.1Zm0 0V3.2M15.6 10.1l4.9-1.5M14.2 14.3l3 4.1M9.8 14.3l-3 4.1M8.4 10.1 3.5 8.6",
  live: "M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12h.01M2 12a10 10 0 0 1 20 0",
  ticket: "M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4Zm10-2v12",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5M12 7v5l3 2",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8m4.3 12a2 2 0 0 0 3.4 0",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  search: "m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
  chevron: "m9 6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  back: "m15 18-6-6 6-6",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7Z",
  copy: "M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1",
  check: "m5 12 5 5 9-10",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  trend: "m3 17 6-6 4 4 8-8M15 7h6v6",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  logout: "M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3",
  sparkles: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3",
  dots: "M12 6h.01M12 12h.01M12 18h.01",
  refresh: "M20 11a8 8 0 0 0-14.9-3.9M4 4v4h4m-4 5a8 8 0 0 0 14.9 3.9M20 20v-4h-4",
  mail: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm-1 1 9 7 9-7",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  send: "m22 2-7 20-4-9-9-4Zm0 0L11 13",
  filter: "M3 5h18l-7 8v6l-4 2v-8Z",
  card: "M4 9h16M8 15h3M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  snow: "M12 2v20M4.9 7l14.2 10M19.1 7 4.9 17M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5",
  crown: "M3 19h18M4 8l4 4 4-7 4 7 4-4-2 10H6Z",
  gift: "M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10.5 3 8 3a2 2 0 0 0 0 4h4Zm0 0s1.5-4 4-4a2 2 0 0 1 0 4h-4Z",
  chat: "M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5Z",
};

export default function Icon({ name, className = "ico", size, fill = false, style }) {
  return (
    <svg className={className} style={style} width={size || undefined} height={size || undefined} viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.dots} />
    </svg>
  );
}
