// Pinpoint: does the table lookup work, and which friction value actually bites?
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

const lookup = await page.evaluate(() => {
  const w = window.__bb8.world;
  const wheelCm = w.contactmaterials.find((cm) =>
    cm.materials.some((m) => m.name === "wheel"),
  );
  const [gm, wm] = wheelCm.materials;
  const found = w.getContactMaterial(gm, wm);
  return {
    lookupHit: !!found,
    lookupFriction: found ? found.friction : null,
    buddyBodyMaterial: window.__bb8.buddy.physics.material?.name,
    groundBodyMaterial: w.bodies[0].material?.name,
    wheelMatFriction: wm.friction,
    groundMatFriction: gm.friction,
  };
});
console.log("lookup:", JSON.stringify(lookup));

async function decayTest(label, setup) {
  await page.evaluate(setup);
  await page.evaluate(() => window.__bb8.buddy.physics.velocity.set(0, 0, -2));
  await new Promise((r) => setTimeout(r, 400));
  const v = await page.evaluate(() => {
    const p = window.__bb8.buddy.physics;
    return Math.hypot(p.velocity.x, p.velocity.z).toFixed(4);
  });
  console.log(`${label}: speed after 400ms = ${v}`);
}

await decayTest("A wheelCM=0.02 default=0.7", () => {});
await decayTest("B wheelCM=0 default=0.7", () => {
  const w = window.__bb8.world;
  w.contactmaterials.find((cm) => cm.materials.some((m) => m.name === "wheel")).friction = 0;
});
await decayTest("C wheelCM=0.02 default=0", () => {
  const w = window.__bb8.world;
  w.contactmaterials.find((cm) => cm.materials.some((m) => m.name === "wheel")).friction = 0.02;
  w.defaultContactMaterial.friction = 0;
});

await browser.close();
