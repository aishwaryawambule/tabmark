// Runs the speech test in headless Chrome with WebGPU and saves the result.
//   node scripts/e2e-speech.mjs http://localhost:5173/ out.json shots [gpu-only]
// Fails on any uncaptured WebGPU error, like scripts/e2e.mjs.
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";

const [base, out = "e2e-speech.json", shots = "shots", only = ""] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
await mkdir(shots, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true, protocolTimeout: 30 * 60_000,
  userDataDir: ".chrome-profile", args: ["--enable-unsafe-webgpu", "--no-first-run", "--autoplay-policy=no-user-gesture-required"],
});
let failed = null;
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
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
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector("#speech-test .btn.primary:not([disabled])");
  if (only === "gpu-only") await page.$eval("#speech-cpu", (el) => el.click());
  await page.$eval("#speech-test .btn.primary", (el) => el.click());
  const t0 = Date.now();
  const tick = setInterval(async () => {
    const rows = await page.$$eval("#speech-test .steps li", (li) => li.map((x) => x.innerText.replace(/\s+/g, " "))).catch(() => []);
    console.log(`${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(rows));
  }, 20_000);
  await page.waitForFunction("window.__TABMARK_SPEECH__ !== undefined", { timeout: 40 * 60_000, polling: 1000 });
  clearInterval(tick);
  const result = await page.evaluate(() => window.__TABMARK_SPEECH__);
  await writeFile(out, JSON.stringify(result, null, 2));
  await page.$eval("#speech-test", (el) => el.scrollIntoView());
  await page.screenshot({ path: `${shots}/speech-done.png` });
  await page.$eval("#speech-test", (el) => el.scrollIntoView());
  await page.evaluate(() => document.querySelector(".fig:nth-last-of-type(2)")?.scrollIntoView());
  await page.screenshot({ path: `${shots}/speech-charts.png`, fullPage: true });
  for (const s of result.speech) console.log(JSON.stringify(s));
} catch (e) {
  failed = failed ?? String(e);
  await page?.screenshot({ path: `${shots}/speech-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
if (failed) { console.error("E2E FAILED:", failed); process.exit(1); }
