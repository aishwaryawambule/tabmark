// Screenshots of every page at web and phone size, for design review.
//   node scripts/shots.mjs http://localhost:5173/ shots
import puppeteer from "puppeteer-core";

const [base = "http://localhost:5173/", out = "shots"] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sizes = { web: { width: 1280, height: 800 }, phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const routes = [""]; // one page

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--enable-unsafe-webgpu"] });
const { mkdir } = await import("node:fs/promises");
await mkdir(out, { recursive: true });
for (const [name, vp] of Object.entries(sizes)) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on("pageerror", (e) => console.error(`[${name}] page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.error(`[${name}] console: ${m.text()}`));
  for (const route of routes) {
    await page.goto(base, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const file = `${out}/page-${name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log(file, overflow > 0 ? `HORIZONTAL OVERFLOW ${overflow}px` : "no overflow");
  }
  await page.close();
}
await browser.close();
