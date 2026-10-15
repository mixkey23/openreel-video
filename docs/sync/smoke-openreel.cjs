// Prueba de humo del dist bajo /openreel/ (como lo sirve Framesmith). Uso: node smoke-openreel.cjs <ruta/al/dist> <captura.png> ["#framesmith"]
// Requiere playwright + chromium (ver PLAYWRIGHT_BROWSERS_PATH).
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("/opt/node-tools/node_modules/playwright");
const DIST = process.argv[2];
const MIME = { ".html":"text/html", ".js":"application/javascript", ".mjs":"application/javascript", ".css":"text/css", ".wasm":"application/wasm", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".woff2":"font/woff2", ".webmanifest":"application/manifest+json" };
// Same shape as Framesmith: StaticFiles(html=True) at /openreel, sw.js also at the root.
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  let file = null;
  if (p === "/sw.js") file = path.join(DIST, "sw.js");
  else if (p.startsWith("/openreel/")) { file = path.join(DIST, p.slice("/openreel/".length)); if (p.endsWith("/")) file = path.join(file, "index.html"); }
  else if (p === "/openreel") { res.writeHead(307, { Location: "/openreel/" }); return res.end(); }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] }).catch(async () => chromium.launch({ args: ["--no-sandbox"] }));
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const failed = [], errors = [], external = new Set();
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(base, "")}`); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.startsWith(base)) external.add(new URL(u).host + " (bloqueada/sin red)"); else failed.push(`FAILED ${u.replace(base, "")}`); });
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith("data:") && !u.startsWith("blob:")) external.add(new URL(u).host); });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  await page.addInitScript(() => { sessionStorage.setItem("__framesmith_config__", JSON.stringify({ episodeId: "smoke", mode: "init", projectName: "smoke", clips: [] })); });
  await page.goto(`${base}/openreel/${process.argv[4] || "#/framesmith"}`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => ({
    title: document.title,
    hash: location.hash,
    hasAssets: !!document.querySelector('[data-tour="assets"]'),
    hasInspector: !!document.querySelector('[data-tour="inspector"]'),
    hasTimeline: !!document.querySelector('[data-tour="timeline"], [data-testid="timeline"]'),
    bodyText: document.body.innerText.slice(0, 160).replace(/\n+/g, " | "),
  }));
  await page.screenshot({ path: process.argv[3], fullPage: false });
  console.log(JSON.stringify({ info, failed: [...new Set(failed)].slice(0, 15), errors: [...new Set(errors)].slice(0, 8), external: [...external] }, null, 1));
  await browser.close(); server.close();
})().catch((e) => { console.error("SMOKE ERROR", e); process.exit(1); });
