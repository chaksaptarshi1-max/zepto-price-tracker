const fs = require("fs");
const { chromium } = require("playwright");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const URL = "https://www.zepto.com/search?query=electronics";
const PRICE_FILE = "prices.json";
const MIN_DROP = 90;

function loadPrices() {
  if (!fs.existsSync(PRICE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(PRICE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function savePrices(data) {
  fs.writeFileSync(PRICE_FILE, JSON.stringify(data, null, 2));
}

function extractPrices(text) {
  return [...text.matchAll(/₹\s*([0-9][0-9,]*)/g)]
    .map((m) => parseInt(m[1].replace(/,/g, ""), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function sendTelegram(message) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: message,
  });
}

(async () => {
  const oldPrices = loadPrices();
  const newPrices = {};
  const alerts = [];

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });

    await page.goto(URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(10000);

    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 3000);
      await page.waitForTimeout(1500);
    }

    const items = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => ({
        href: el.getAttribute("href") || "",
        text: (el.innerText || "").trim(),
      }))
    );

    for (const item of items) {
      try {
        if (!item.href.includes("/pn/")) continue;
        if (!item.text) continue;

        const prices = extractPrices(item.text);
        if (prices.length < 2) continue;

        const currentPrice = Math.min(...prices);
        const productName = item.text.split("₹")[0].trim().slice(0, 100) || "Zepto Product";
        const productId = item.href;
        const fullLink = item.href.startsWith("http")
          ? item.href
          : `https://www.zepto.com${item.href}`;

        newPrices[productId] = currentPrice;

        if (oldPrices[productId]) {
          const oldPrice = oldPrices[productId];
          if (oldPrice > 0) {
            const drop = ((oldPrice - currentPrice) / oldPrice) * 100;

            if (drop >= MIN_DROP) {
              alerts.push(
                `🔥 90%+ PRICE DROP\n\n📦 ${productName}\n\n💰 ₹${oldPrice} → ₹${currentPrice}\n\n📉 Drop: ${drop.toFixed(
                  1
                )}%\n\n🔗 ${fullLink}`
              );
            }
          }
        }
      } catch {
        continue;
      }
    }
  } finally {
    await browser.close();
  }

  savePrices(newPrices);

  if (alerts.length === 0) {
    await sendTelegram(
      `✅ Scan Complete\n\nProducts scanned: ${Object.keys(newPrices).length}\nNo 90%+ drops found.`
    );
  } else {
    for (const alert of alerts.slice(0, 20)) {
      await sendTelegram(alert);
    }
  }
})().catch(async (err) => {
  try {
    await sendTelegram(`❌ Script failed\n\n${err.message}`);
  } catch {}
  process.exit(1);
});
