// Capture the restored yellow scene, then toggle the cutaway view and
// drive so the internal drive-cart mechanism is visible in motion.
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

await page.screenshot({ path: "/tmp/bb8-yellow.png" });
console.log("yellow scene saved");

// Open the cutaway and zoom in with the mouse wheel (OrbitControls).
await page.click("#btn-cutaway");
await page.mouse.move(640, 400);
await page.mouse.wheel({ deltaY: -600 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "/tmp/bb8-cutaway.png" });
console.log("cutaway (idle) saved");

// Drive forward so the wheels/gyro animate, then capture again.
await page.keyboard.down("w");
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: "/tmp/bb8-cutaway-drive.png" });
await page.keyboard.up("w");
console.log("cutaway (driving) saved");

await browser.close();
