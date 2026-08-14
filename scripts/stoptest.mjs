// Full-stop test: drive, release, wait for standstill, check for roll-back.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

const state = () =>
  page.evaluate(() => {
    const p = window.__bb8.body.physics;
    return { z: p.position.z, vz: p.velocity.z };
  });

await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 2000));
await page.keyboard.up("w");

let minVz = Infinity;
let prev = await state();
for (let i = 0; i < 12; i += 1) {
  await new Promise((r) => setTimeout(r, 400));
  const cur = await state();
  minVz = Math.min(minVz, cur.vz);
  console.log(
    `t+${((i + 1) * 0.4).toFixed(1)}s z=${cur.z.toFixed(3)} vz=${cur.vz.toFixed(3)}`,
  );
  prev = cur;
}
console.log(`min forward velocity while stopping: ${minVz.toFixed(4)} (negative = rolled backwards)`);
await browser.close();
