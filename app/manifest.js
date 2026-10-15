export default function manifest() {
  return {
    name: "Skii Pronos",
    short_name: "Skii Pronos",
    description: "Pronos, coupon du jour, grosse cote, scores en direct.",
    start_url: "/",
    display: "standalone",
    background_color: "#05060c",
    theme_color: "#05060c",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
