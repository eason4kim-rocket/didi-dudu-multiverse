// Screenshot probe: capture the scene, then drive-and-stop to verify no
// backward rebound, printing positions along the way.
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
await new Promise((r) => setTimeout(r, 2000));

await page.screenshot({ path: "/tmp/bb8-scene.png" });
console.log("scene shot saved");

// Drive forward 2s, release, then sample forward position for rebound.
const zOf = () => page.evaluate(() => window.__bb8.body.physics.position.z);
await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 2000));
await page.keyboard.up("w");
const z0 = await zOf();
await new Promise((r) => setTimeout(r, 500));
const z1 = await zOf();
await new Promise((r) => setTimeout(r, 800));
const z2 = await zOf();
console.log(
  `release z=${z0.toFixed(3)}, +0.5s z=${z1.toFixed(3)}, +1.3s z=${z2.toFixed(3)}`,
);
console.log(`rebound after settle: ${(z2 - z1).toFixed(4)} (negative = rolled back)`);

await page.screenshot({ path: "/tmp/bb8-stopped.png" });
await browser.close();
