// Deep probe: inspect materials, and test raw velocity injection.
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

const info = await page.evaluate(() => {
  const d = window.__bb8;
  return {
    buddyMaterial: d.buddy.physics.material?.name,
    bb8Material: d.body.physics.material?.name,
    buddyDamping: d.buddy.physics.linearDamping,
    buddyMass: d.buddy.physics.mass,
  };
});
console.log("info:", JSON.stringify(info));

// Inject velocity directly: if friction is the culprit it will die instantly.
await page.evaluate(() => {
  window.__bb8.buddy.physics.velocity.set(2, 0, 0);
});
for (let i = 0; i < 4; i += 1) {
  await new Promise((r) => setTimeout(r, 300));
  const v = await page.evaluate(() => {
    const p = window.__bb8.buddy.physics;
    return { v: { ...p.velocity }, pos: { ...p.position } };
  });
  console.log(`t+${(i + 1) * 300}ms:`, JSON.stringify(v));
}

await browser.close();
