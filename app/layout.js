import "./globals.css";
import { Outfit } from "next/font/google";
import Providers from "./components/Providers";
import Shell from "./components/Shell";

const font = Outfit({ subsets: ["latin"], variable: "--font", display: "swap" });

export const metadata = {
  title: "Skii Pronos — live football predictions & coupon du jour",
  description: "Every league loaded automatically, live scores, a quantitative prono engine, the coupon du jour and full AI match analysis.",
  icons: { icon: "/icon.svg" },
};

export const viewport = { themeColor: "#05060c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={font.variable}>
      <body>
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
