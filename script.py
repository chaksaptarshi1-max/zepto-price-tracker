import os
import json
import re
import requests
from playwright.sync_api import sync_playwright

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

URL = "https://www.zepto.com/search?query=electronics"

PRICE_FILE = "prices.json"

MIN_DROP = 90

# LOAD OLD PRICES
if os.path.exists(PRICE_FILE):

    with open(PRICE_FILE, "r") as f:
        old_prices = json.load(f)

else:
    old_prices = {}

new_prices = {}

alerts = []

# OPEN PAGE
with sync_playwright() as p:

    browser = p.chromium.launch(headless=True)

    page = browser.new_page()

    page.goto(URL, timeout=60000)

    page.wait_for_timeout(10000)

    html = page.content()

    browser.close()

# FIND PRODUCTS
product_links = re.findall(
    r'href="([^"]+/pn/[^"]+)"',
    html
)

product_links = list(set(product_links))

for href in product_links:

    try:

        full_link = "https://www.zepto.com" + href

        pattern = re.escape(href) + r'.{0,800}'

        match = re.search(pattern, html)

        if not match:
            continue

        block = match.group(0)

        prices = re.findall(r'₹\s?(\d+)', block)

        if len(prices) < 2:
            continue

        prices = [int(p) for p in prices]

        current_price = min(prices)

        if current_price <= 0:
            continue

        name_match = re.search(
            r'>([^<>]{5,120})<',
            block
        )

        if name_match:
            product_name = name_match.group(1)
        else:
            product_name = "Zepto Product"

        product_id = href

        new_prices[product_id] = current_price

        # COMPARE WITH OLD PRICE
        if product_id in old_prices:

            old_price = old_prices[product_id]

            if old_price <= 0:
                continue

            drop = (
                (old_price - current_price)
                / old_price
            ) * 100

            if drop >= MIN_DROP:

                msg = f"""
🔥 90%+ PRICE DROP

📦 {product_name}

💰 ₹{old_price} → ₹{current_price}

📉 Drop: {drop:.1f}%

🔗 {full_link}
"""

                alerts.append(msg)

    except:
        continue

# SAVE PRICES
with open(PRICE_FILE, "w") as f:
    json.dump(new_prices, f)

telegram_url = (
    f"https://api.telegram.org/bot"
    f"{BOT_TOKEN}/sendMessage"
)

# SEND RESULTS
if len(alerts) == 0:

    msg = (
        f"✅ Scan Complete\n\n"
        f"Products scanned: {len(new_prices)}\n"
        f"No 90%+ drops found."
    )

    requests.post(
        telegram_url,
        data={
            "chat_id": CHAT_ID,
            "text": msg
        }
    )

else:

    for alert in alerts[:20]:

        requests.post(
            telegram_url,
            data={
                "chat_id": CHAT_ID,
                "text": alert
            }
        )

print("DONE")
