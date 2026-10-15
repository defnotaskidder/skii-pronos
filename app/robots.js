const site = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://skii-pronos.vercel.app");

export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/settings", "/notifications", "/login"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
