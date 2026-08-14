// Screenshot each universe and confirm gravity/friction actually switch.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

for (const [i, name] of [
  [0, "dusk"],
  [1, "mars"],
  [2, "snow"],
]) {
  await page.evaluate((idx) => window.__bb8.setUniverse(idx), i);
  await new Promise((r) => setTimeout(r, 800));
  const phys = await page.evaluate(() => ({
    gravity: window.__bb8.world.gravity.y,
  }));
  console.log(`${name}: gravity=${phys.gravity}`);
  await page.screenshot({ path: `/tmp/universe-${name}.png` });
}

// Quick drive sanity in snow (should still move, just slidey).
await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.up("w");
const speed = await page.evaluate(() => {
  const v = window.__bb8.body.physics.velocity;
  return Math.hypot(v.x, v.z);
});
console.log(`snow drive speed after 1.5s: ${speed.toFixed(2)}`);

await browser.close();
