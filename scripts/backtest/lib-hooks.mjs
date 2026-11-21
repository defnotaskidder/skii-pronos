// Lets a plain Node script import the site's own lib/ modules (written for Next.js: no file
// extensions, JSON imported without attributes), so a backtest runs the code the site runs.
//   node --import ./lib-register.mjs live.mjs
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(spec, ctx, next) {
  if (/^\.\.?\//.test(spec) && !/\.(mjs|cjs|js|json)$/.test(spec)) { try { return await next(spec + ".js", ctx); } catch { /* fall through */ } }
  return next(spec, ctx);
}

export async function load(url, ctx, next) {
  if (url.startsWith("file:") && url.endsWith(".json")) return { format: "module", shortCircuit: true, source: "export default " + fs.readFileSync(fileURLToPath(url), "utf8") };
  if (url.startsWith("file:") && /\/lib\/[^/]+\.js$/.test(url)) return { format: "module", shortCircuit: true, source: fs.readFileSync(fileURLToPath(url), "utf8") };
  return next(url, ctx);
}
