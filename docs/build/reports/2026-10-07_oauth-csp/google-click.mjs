import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const navs = [];
page.on("response", r => navs.push(`${r.status()} ${r.url().slice(0, 140)}`));
page.on("console", m => console.log("[console]", m.type(), m.text().slice(0, 200)));
page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 300)));
await page.goto("https://rhema.tools/login", { waitUntil: "networkidle" });
console.log("--- landed:", page.url());
const btn = page.getByRole("button", { name: "Continue with Google" });
console.log("--- button visible:", await btn.isVisible());
await btn.click();
try {
  await page.waitForURL(/accounts\.google\.com/, { timeout: 10000 });
  console.log("--- click result: NAVIGATED TO GOOGLE");
} catch {
  console.log("--- click result: NO GOOGLE NAV in 10s");
}
console.log("--- final url:", page.url());
console.log("--- title:", await page.title());
console.log("--- last navs:");
for (const n of navs.slice(-15)) console.log("   ", n);
await browser.close();
