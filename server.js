const fs = require("fs");
const { chromium } = require("playwright");
const axios = require("axios");

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const URL =
  "https://www.zepto.com/search?query=electronics";

const PRICE_FILE = "prices.json";

const MIN_DROP = 90;

let oldPrices = {};

if (fs.existsSync(PRICE_FILE)) {
  oldPrices = JSON.parse(
    fs.readFileSync(PRICE_FILE)
  );
}

let newPrices = {};

let alerts = [];

(async () => {

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(10000);

  for (let i = 0; i < 5; i++) {

    await page.mouse.wheel(0, 3000);

    await page.waitForTimeout(2000);
  }

  const products = await page.evaluate(() => {

    const links = Array.from(
      document.querySelectorAll("a")
    );

    return links.map(link => ({
      href: link.href,
      text: link.innerText
    }));

  });

  await browser.close();

  for (const item of products) {

    try {

      if (!item.href.includes("/pn/")) {
        continue;
      }

      const text = item.text;

      const prices =
        [...text.matchAll(/₹\s?(\d+)/g)]
        .map(x => parseInt(x[1]));

      if (prices.length < 2) {
        continue;
      }

      const currentPrice =
        Math.min(...prices);

      const productName =
        text.split("₹")[0]
        .trim()
        .slice(0, 100);

      const productId = item.href;

      newPrices[productId] =
        currentPrice;

      if (oldPrices[productId]) {

        const oldPrice =
          oldPrices[productId];

        const drop =
          ((oldPrice - currentPrice)
          / oldPrice) * 100;

        if (drop >= MIN_DROP) {

          alerts.push(
`🔥 90%+ PRICE DROP

📦 ${productName}

💰 ₹${oldPrice} → ₹${currentPrice}

📉 Drop: ${drop.toFixed(1)}%

🔗 ${item.href}`
          );
        }
      }

    } catch (e) {

      continue;

    }
  }

  fs.writeFileSync(
    PRICE_FILE,
    JSON.stringify(newPrices)
  );

  const telegramURL =
`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  if (alerts.length === 0) {

    await axios.post(telegramURL, {
      chat_id: CHAT_ID,
      text:
`✅ Scan Complete

Products scanned: ${Object.keys(newPrices).length}

No 90%+ drops found.`
    });

  } else {

    for (const alert of alerts.slice(0, 20)) {

      await axios.post(telegramURL, {
        chat_id: CHAT_ID,
        text: alert
      });
    }
  }

})();    timeout: 60000
  });

  await page.waitForTimeout(10000);

  for (let i = 0; i < 5; i++) {

    await page.mouse.wheel(0, 3000);

    await page.waitForTimeout(2000);
  }

  const products = await page.evaluate(() => {

    const links = Array.from(
      document.querySelectorAll("a")
    );

    return links.map(link => ({
      href: link.href,
      text: link.innerText
    }));

  });

  await browser.close();

  for (const item of products) {

    try {

      if (!item.href.includes("/pn/")) {
