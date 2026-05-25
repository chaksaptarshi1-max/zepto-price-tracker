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
