import "./globals.css";

export const metadata = {
  title: "Skii Pronos Engine",
  description: "Live odds, one best market per match, honest confidence, and a slip builder.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
