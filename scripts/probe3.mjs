// Controlled experiment: zero out ALL friction, inject velocity, watch decay.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200));

const report = await page.evaluate(() => {
  const w = window.__bb8.world;
  return {
    defaultFriction: w.defaultContactMaterial.friction,
    contactMaterials: w.contactmaterials.map((cm) => ({
      materials: cm.materials.map((m) => m.name),
      friction: cm.friction,
    })),
  };
});
console.log("world:", JSON.stringify(report));

await page.evaluate(() => {
  const w = window.__bb8.world;
  w.defaultContactMaterial.friction = 0;
  for (const cm of w.contactmaterials) cm.friction = 0;
  window.__bb8.buddy.physics.velocity.set(2, 0, 0);
});
for (let i = 0; i < 3; i += 1) {
  await new Promise((r) => setTimeout(r, 300));
  const v = await page.evaluate(() => {
    const p = window.__bb8.buddy.physics;
    return { vx: p.velocity.x.toFixed(4), x: p.position.x.toFixed(4) };
  });
  console.log(`zero-friction t+${(i + 1) * 300}ms:`, JSON.stringify(v));
}

await browser.close();
