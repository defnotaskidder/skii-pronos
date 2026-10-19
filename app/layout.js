import "./globals.css";
import "./motion.css";
import Providers from "./components/Providers";
import Shell from "./components/Shell";

const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://skii-pronos.vercel.app";

export const metadata = {
  metadataBase: new URL(site),
  applicationName: "Skii Pronos",
  title: "Skii Pronos — live football predictions & coupon du jour",
  description: "Every league loaded automatically, live scores, a quantitative prono engine, the coupon du jour and full AI match analysis.",
  icons: { icon: "/icon.svg" },
};

export const viewport = { themeColor: "#0d0d0f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Outfit is self-hosted (public/fonts) so builds never depend on Google Fonts being reachable */}
        <link rel="preload" href="/fonts/outfit-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
