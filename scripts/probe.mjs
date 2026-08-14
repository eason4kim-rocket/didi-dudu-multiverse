// Headless smoke test: switch to DuDu, hold W, verify it actually moves.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-sandbox"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE ERROR:", m.text());
});

await page.goto("http://localhost:5173/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

const snap = () =>
  page.evaluate(() => {
    const d = window.__bb8;
    return {
      active: d.getActiveBot(),
      buddy: { ...d.buddy.physics.position },
      bb8: { ...d.body.physics.position },
      drive: d.controller.state.drive,
    };
  });

console.log("before:", JSON.stringify(await snap()));

await page.click("#btn-switch");
await new Promise((r) => setTimeout(r, 200));
console.log("after switch:", JSON.stringify(await snap()));

await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 2000));
console.log("holding W:", JSON.stringify(await snap()));
await page.keyboard.up("w");

await new Promise((r) => setTimeout(r, 600));
console.log("released:", JSON.stringify(await snap()));

await browser.close();
