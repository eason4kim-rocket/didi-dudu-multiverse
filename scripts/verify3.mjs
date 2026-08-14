// Verify: (1) drift while turning, (2) coasting untouched, (3) real dune
// climbing, (4) DuDu cutaway internals screenshot.
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

const state = () =>
  page.evaluate(() => {
    const b = window.__bb8.body;
    const v = b.physics.velocity;
    const p = b.physics.position;
    const fx = Math.sin(b.heading);
    const fz = Math.cos(b.heading);
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      speed: Math.hypot(v.x, v.z),
      along: v.x * fx + v.z * fz,
      lateral: v.x * fz + v.z * -fx,
    };
  });

// 1. Drift while turning.
await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.down("a");
await new Promise((r) => setTimeout(r, 1600));
const turn = await state();
console.log(
  `turning: speed=${turn.speed.toFixed(2)} lateral=${turn.lateral.toFixed(2)} ratio=${(Math.abs(turn.lateral) / Math.max(0.01, turn.speed)).toFixed(3)}`,
);
await page.keyboard.up("a");

// 2. Coasting: release W, turn heading — ball must NOT brake or steer.
await page.keyboard.up("w");
await new Promise((r) => setTimeout(r, 200));
const c0 = await state();
await page.keyboard.down("a");
await new Promise((r) => setTimeout(r, 600));
await page.keyboard.up("a");
const c1 = await state();
console.log(
  `coast+turn-head: speed ${c0.speed.toFixed(2)} -> ${c1.speed.toFixed(2)} (should decay gently, not slam)`,
);

// 3. Climb the near dome at (9,-7): aim heading straight at it and drive.
await page.evaluate(() => {
  const b = window.__bb8.body;
  b.physics.position.set(4, 0.57, -3);
  b.physics.velocity.set(0, 0, 0);
  b.heading = Math.atan2(9 - 4, -7 - -3);
});
await new Promise((r) => setTimeout(r, 300));
let maxY = 0;
await page.keyboard.down("w");
for (let i = 0; i < 40; i += 1) {
  await new Promise((r) => setTimeout(r, 100));
  const s = await state();
  if (s.y > maxY) maxY = s.y;
}
await page.keyboard.up("w");
console.log(`dune climb: max height=${maxY.toFixed(2)} (flat-ground resting y=0.57)`);

// 4. Cutaway with DuDu internals.
await page.click("#btn-cutaway");
await page.mouse.move(640, 400);
await page.mouse.wheel({ deltaY: -500 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "/tmp/bb8-cutaway-both.png" });
console.log("cutaway screenshot saved");

await browser.close();
