const fs = require("fs");
const { chromium } = require("playwright");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const URL =
  "https://www.zepto.com/search?query=electronics";

const PRICE_FILE = "prices.json";

const MIN_DROP = 90;

function loadPrices() {
  if (!fs.existsSync(PRICE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(PRICE_FILE, "utf8")
    );
  } catch {
    return {};
  }
}

function savePrices(data) {
  fs.writeFileSync(
    PRICE_FILE,
    JSON.stringify(data, null, 2)
  );
}

async function sendTelegram(message) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log(message);
    return;
  }

  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text: message,
      disable_web_page_preview: true,
    }
  );
}

(async () => {
  const oldPrices = loadPrices();
  const newPrices = {};
  const alerts = [];

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context =
      await browser.newContext({
        viewport: {
          width: 1440,
          height: 2200,
        },
      });

    const page = await context.newPage();

    await page.goto(URL, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await page.waitForTimeout(5000);

    // Scroll to load products
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() =>
        window.scrollBy(0, 3000)
      );

      await page.waitForTimeout(1500);
    }

    const products = await page.evaluate(() => {
      const results = [];

      const cards = Array.from(
        document.querySelectorAll("*")
      );

      for (const card of cards) {
        const text =
          (card.innerText || "").trim();

        if (
          !text ||
          !text.includes("₹") ||
          !text.includes("ADD")
        ) {
          continue;
        }

        const prices = [
          ...text.matchAll(
            /₹\s*([0-9][0-9,]*)/g
          ),
        ]
          .map((m) =>
            parseInt(
              m[1].replace(/,/g, ""),
              10
            )
          )
          .filter(
            (n) =>
              Number.isFinite(n) && n > 0
          );

        if (prices.length === 0) {
          continue;
        }

        const currentPrice =
          Math.min(...prices);

        const productName = text
          .split("₹")[0]
          .replace(/\n+/g, " ")
          .trim()
          .slice(0, 120);

        let href = "";

        const link =
          card.closest("a") ||
          card.querySelector("a");

        if (link) {
          href =
            link.getAttribute("href") || "";
        }

        results.push({
          name: productName,
          price: currentPrice,
          href,
        });
      }

      return results;
    });

    console.log(
      `Found ${products.length} products`
    );

    for (const item of products) {
      const productId =
        item.href ||
        item.name.toLowerCase();

      const currentPrice =
        item.price;

      const fullLink =
        item.href &&
        !item.href.startsWith("http")
          ? `https://www.zepto.com${item.href}`
          : item.href;

      newPrices[productId] =
        currentPrice;

      if (
        oldPrices[productId] &&
        oldPrices[productId] > 0
      ) {
        const oldPrice =
          oldPrices[productId];

        const drop =
          ((oldPrice - currentPrice) /
            oldPrice) *
          100;

        if (
          currentPrice < oldPrice &&
          drop >= MIN_DROP
        ) {
          alerts.push(
`🔥 ${MIN_DROP}%+ PRICE DROP

📦 ${item.name}

💰 ₹${oldPrice} → ₹${currentPrice}

📉 Drop: ${drop.toFixed(1)}%

🔗 ${fullLink || "N/A"}`
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  savePrices(newPrices);

  if (alerts.length === 0) {
    await sendTelegram(
`✅ Scan Complete

Products scanned: ${Object.keys(newPrices).length}

No ${MIN_DROP}%+ drops found.`
    );
  } else {
    for (const alert of alerts.slice(0, 20)) {
      await sendTelegram(alert);
    }
  }
})().catch(async (err) => {
  console.error(err);

  try {
    await sendTelegram(
`❌ Script failed

${err.message}`
    );
  } catch {}

  process.exit(1);
});
