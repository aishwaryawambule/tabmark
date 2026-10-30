// Runs the real test in headless Chrome with WebGPU and saves the result.
//   node scripts/e2e.mjs http://localhost:5173/ full probe out.json shots
// Fails on any uncaptured WebGPU error: those are only console warnings, and the GPU
// silently skips the bad work, so a run can otherwise "pass" with garbage.
import puppeteer from "puppeteer-core";
import { writeFile, mkdir } from "node:fs/promises";

const [base, pack = "quick", probe = "", out = "e2e-result.json", shots = "shots"] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(shots, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 30 * 60_000,
  userDataDir: ".chrome-profile", args: ["--enable-unsafe-webgpu", "--no-first-run"],
});
let failed = null;
let page;
const WAIT = Number(process.env.TIMEOUT_MIN ?? 15) * 60_000;
try {
  page = await browser.newPage();
  const phone = process.env.VIEWPORT === "phone";
  await page.setViewport(phone ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    const proto = globalThis.GPUAdapter?.prototype;
    if (!proto) return;
    const rd = proto.requestDevice;
    proto.requestDevice = async function (...a) {
      const d = await rd.apply(this, a);
      d.addEventListener("uncapturederror", (e) => setTimeout(() => { throw new Error(`WebGPU error: ${e.error.message}`); }));
      return d;
    };
  });
  page.on("pageerror", (e) => { failed = e.message; console.error("page error:", e.message); });
  page.on("console", (m) => /error/i.test(m.type()) && console.error("console:", m.text().slice(0, 300)));
  // Puppeteer's simulated mouse and tap do not reliably land with touch emulation on,
  // so press controls through the DOM; the page's own handlers run either way.
  const press = (sel) => page.$eval(sel, (el) => el.click());
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector(".btn.primary:not([disabled])");
  if (process.env.MODEL) await press(`input[name="model"][value="${process.env.MODEL}"]`);
  if (pack === "full") await press('input[value="full"]');
  if (probe === "probe") await press("#probe");
  await page.type("#device-name", "MacBook Pro (Apple M5 Pro)");
  await press(".btn.primary");
  // Mid-run shot: as soon as a row draws its live trace.
  await page.waitForSelector(".trace path[d^='M']", { timeout: WAIT });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${shots}/run-live${phone ? "-phone" : ""}.png` });
  await page.waitForFunction("window.__TABMARK_RESULT__ !== undefined", { timeout: 2 * WAIT, polling: 1000 });
  await page.screenshot({ path: `${shots}/run-done${phone ? "-phone" : ""}.png`, fullPage: true });
  // Read the result first: switching to a mobile viewport reloads the page.
  const result = await page.evaluate(() => window.__TABMARK_RESULT__);
  await writeFile(out, JSON.stringify(result, null, 2));
  console.log(result.tests[0]?.model, JSON.stringify(result.tests.map((t) => [t.engine, t.weights, t.kv, t.status, t.prefillTps, t.decodeTps, t.error])), JSON.stringify(result.context ?? null));
} catch (e) {
  failed = failed ?? String(e);
  // Leave evidence: what the page showed and what each row said when it failed.
  await page?.screenshot({ path: `${shots}/e2e-error.png`, fullPage: true }).catch(() => {});
  const rows = await page?.$$eval(".plan tbody tr", (trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, " "))).catch(() => []);
  console.error("rows at failure:", JSON.stringify(rows));
} finally {
  await browser.close();
}
if (failed) { console.error("E2E FAILED:", failed); process.exit(1); }
