// Drift probe: drive straight, then hold a turn, and measure how much the
// velocity direction diverges from the heading (sideways drift), plus a
// final screenshot of the new martian sky.
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

await page.screenshot({ path: "/tmp/bb8-mars.png" });
console.log("mars shot saved");

const state = () =>
  page.evaluate(() => {
    const b = window.__bb8.body;
    const v = b.physics.velocity;
    const p = b.physics.position;
    const speed = Math.hypot(v.x, v.z);
    const heading = b.heading;
    // forward dir = (sin h, cos h)
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const along = v.x * fx + v.z * fz;
    const rx = fz;
    const rz = -fx;
    const lateral = v.x * rx + v.z * rz;
    return {
      px: p.x,
      pz: p.z,
      vx: v.x,
      vz: v.z,
      speed,
      heading,
      along,
      lateral,
    };
  });

// Drive straight 1.5s to build speed.
await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 1500));
const s0 = await state();
console.log(
  `straight: speed=${s0.speed.toFixed(3)} along=${s0.along.toFixed(3)} lateral=${s0.lateral.toFixed(3)}`,
);

// Hold turn (A) while still driving forward for 1.6s — this is where drift shows.
await page.keyboard.down("a");
await new Promise((r) => setTimeout(r, 1600));
const s1 = await state();
console.log(
  `turn+drive: speed=${s1.speed.toFixed(3)} along=${s1.along.toFixed(3)} lateral=${s1.lateral.toFixed(3)} heading=${s1.heading.toFixed(2)}`,
);
const driftRatio = Math.abs(s1.lateral) / Math.max(0.001, s1.speed);
console.log(`lateral/speed ratio during turn: ${driftRatio.toFixed(3)} (lower = less drift)`);

// Release, let it settle, check no backward rebound.
await page.keyboard.up("a");
await new Promise((r) => setTimeout(r, 500));
await page.keyboard.up("w");
const s2 = await state();
await new Promise((r) => setTimeout(r, 900));
const s3 = await state();
console.log(
  `after release: speed=${s3.speed.toFixed(3)} lateral=${s3.lateral.toFixed(3)} dz=${(s3.pz - s2.pz).toFixed(3)}`,
);

await page.screenshot({ path: "/tmp/bb8-mars-after.png" });
await browser.close();
