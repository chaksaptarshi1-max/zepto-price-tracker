const fs = require("fs");
const { chromium } = require("playwright");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const URL =
  "https://www.zepto.com/search?query=electronics";

const PRICE_FILE = "prices.json";

const MIN_DROP = 90;

// LOAD OLD PRICES
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

// SAVE PRICES
function savePrices(data) {

  fs.writeFileSync(
    PRICE_FILE,
    JSON.stringify(data, null, 2)
  );
}

// EXTRACT ₹ PRICES
function extractPrices(text) {

  return [...text.matchAll(/₹\s*([0-9][0-9,]*)/g)]

    .map((m) =>
      parseInt(
        m[1].replace(/,/g, ""),
        10
      )
    )

    .filter((n) =>
      Number.isFinite(n) && n > 0
    );
}

// TELEGRAM
async function sendTelegram(message) {

  await axios.post(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      chat_id: CHAT_ID,
      text: message,
    }
  );
}

(async () => {

  const oldPrices = loadPrices();

  const newPrices = {};

  const alerts = [];

  const browser = await chromium.launch({
    headless: true
  });

  try {

    // COOKIE LOGIN
    const context =
      await browser.newContext({

      storageState: {

        cookies: [

          {
            name: "accessToken",
            value: "eyJhbGciOiJIUzUxMiJ9.eyJ2ZXJzaW9uIjoxLCJzdWIiOiI3OTJjMzYwNC02NmIxLTQ1ZjctOGExZi1mZWUyZGY2MGI2YWMiLCJpYXQiOjE3Nzk3MDc0MTksImV4cCI6MTc3OTcxMTAxOX0.pwLXVhTLCOIVYxVg2G7RKNiaM39_Btx_0UeXA8DqIACqddpW8SNUmDUoX3-6Z-HzwgeSY3Tw0RrTnGUEx-FdcQ",
            domain: ".zepto.com",
            path: "/"
          },

          {
            name: "refreshToken",
            value: "cf8bd0c5-7525-4c71-8fc4-56076a3d6204",
            domain: ".zepto.com",
            path: "/"
          },

          {
            name: "marketplace",
            value: "SUPER_SAVER",
            domain: "www.zepto.com",
            path: "/"
          }

        ],

        origins: []

      }

    });

    const page = await context.newPage({

      viewport: {
        width: 1440,
        height: 2200
      }

    });

    await page.goto(URL, {

      waitUntil: "domcontentloaded",

      timeout: 60000,

    });

    await page.waitForTimeout(12000);

    // SCROLL
    for (let i = 0; i < 5; i++) {

      await page.mouse.wheel(0, 3000);

      await page.waitForTimeout(1500);
    }

    // GET PRODUCTS
    const items =
      await page.locator("a[href]")
      .evaluateAll((els) =>

        els.map((el) => ({
          href:
            el.getAttribute("href") || "",

          text:
            (el.innerText || "").trim(),
        }))

      );

    for (const item of items) {

      try {

        if (
          !item.href.includes("/pn/")
        ) {
          continue;
        }

        if (!item.text) {
          continue;
        }

        const prices =
          extractPrices(item.text);

        if (prices.length < 2) {
          continue;
        }

        const currentPrice =
          Math.min(...prices);

        const productName =
          item.text
          .split("₹")[0]
          .trim()
          .slice(0, 100)

          || "Zepto Product";

        const productId =
          item.href;

        const fullLink =
          item.href.startsWith("http")

          ? item.href

          : `https://www.zepto.com${item.href}`;

        newPrices[productId] =
          currentPrice;

        // CHECK PRICE DROP
        if (oldPrices[productId]) {

          const oldPrice =
            oldPrices[productId];

          if (oldPrice > 0) {

            const drop =
              (
                (oldPrice - currentPrice)

                / oldPrice
              ) * 100;

            if (drop >= MIN_DROP) {

              alerts.push(

`🔥 90%+ PRICE DROP

📦 ${productName}

💰 ₹${oldPrice} → ₹${currentPrice}

📉 Drop: ${drop.toFixed(1)}%

🔗 ${fullLink}`

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

  // SAVE
  savePrices(newPrices);

  // SEND TELEGRAM
  if (alerts.length === 0) {

    await sendTelegram(

`✅ Scan Complete

Products scanned: ${Object.keys(newPrices).length}

No 90%+ drops found.`

    );

  } else {

    for (
      const alert of alerts.slice(0, 20)
    ) {

      await sendTelegram(alert);
    }
  }

})().catch(async (err) => {

  try {

    await sendTelegram(

`❌ Script failed

${err.message}`

    );

  } catch {}

  process.exit(1);

});
