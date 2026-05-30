const fs = require("fs");
const axios = require("axios");
const { chromium } = require("playwright");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const URL =
  "https://www.zepto.com/search?query=electronics";

const PRICE_FILE = "prices.json";
const MIN_DROP = 90;

function loadPrices() {
  try {
    if (!fs.existsSync(PRICE_FILE)) return {};
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

  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        disable_web_page_preview: true,
      }
    );
  } catch (err) {
    console.error(
      "Telegram Error:",
      err.message
    );
  }
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

    console.log("Opening Zepto...");

    await page.goto(URL, {
      waitUntil: "networkidle",
      timeout: 90000,
    });

    await page.waitForTimeout(8000);

    console.log(
      "URL:",
      page.url()
    );

    console.log(
      "TITLE:",
      await page.title()
    );

    await page.screenshot({
      path: "debug.png",
      fullPage: true,
    });

    fs.writeFileSync(
      "debug.html",
      await page.content()
    );

    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 3000);
      });

      await page.waitForTimeout(1500);
    }

    const products =
      await page.evaluate(() => {
        const seen = new Set();
        const results = [];

        const elements =
          document.querySelectorAll("*");

        for (const el of elements) {
          const text =
            (el.innerText || "").trim();

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
                Number.isFinite(n) &&
                n > 0
            );

          if (!prices.length) {
            continue;
          }

          const currentPrice =
            Math.min(...prices);

          const name = text
            .split("₹")[0]
            .replace(/\n+/g, " ")
            .trim()
            .slice(0, 120);

          if (!name) continue;

          if (seen.has(name))
            continue;

          seen.add(name);

          results.push({
            id: name,
            name,
            price: currentPrice,
          });
        }

        return results;
      });

    console.log(
      "Products found:",
      products.length
    );

    fs.writeFileSync(
      "products.json",
      JSON.stringify(
        products,
        null,
        2
      )
    );

    for (const product of products) {
      const id = product.id;
      const currentPrice =
        product.price;

      newPrices[id] =
        currentPrice;

      if (
        oldPrices[id] &&
        oldPrices[id] > 0
      ) {
        const oldPrice =
          oldPrices[id];

        const drop =
          ((oldPrice -
            currentPrice) /
            oldPrice) *
          100;

        if (
          currentPrice <
            oldPrice &&
          drop >= MIN_DROP
        ) {
          alerts.push(
`🔥 ${MIN_DROP}%+ PRICE DROP

📦 ${product.name}

💰 ₹${oldPrice} → ₹${currentPrice}

📉 ${drop.toFixed(1)}%`
          );
        }
      }
    }

    savePrices(newPrices);

    if (alerts.length) {
      for (const msg of alerts.slice(
        0,
        20
      )) {
        await sendTelegram(msg);
      }
    } else {
      await sendTelegram(
`✅ Scan Complete

Products scanned: ${products.length}

No ${MIN_DROP}%+ drops found.`
      );
    }
  } catch (err) {
    console.error(err);

    await sendTelegram(
`❌ Script Failed

${err.message}`
    );
  } finally {
    await browser.close();
  }
})();
