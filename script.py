import os
import json
import re
import requests
from bs4 import BeautifulSoup

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

URL = "https://www.zepto.com/search?query=electronics"

headers = {
    "User-Agent": "Mozilla/5.0"
}

PRICE_FILE = "prices.json"

# LOAD OLD PRICES
if os.path.exists(PRICE_FILE):
    with open(PRICE_FILE, "r") as f:
        old_prices = json.load(f)
else:
    old_prices = {}

# GET PAGE
response = requests.get(URL, headers=headers)

soup = BeautifulSoup(response.text, "html.parser")

links = soup.find_all("a")

new_prices = {}

messages = []

for link in links:

    href = link.get("href")
    text = link.get_text(" ", strip=True)

    if not href or "/pn/" not in href:
        continue

    full_link = "https://www.zepto.com" + href

    # FIND PRICE
    prices = re.findall(r'₹\s?(\d+)', text)

    if len(prices) == 0:
        continue

    try:
        current_price = int(prices[0])
    except:
        continue

    # PRODUCT NAME
    product_name = text[:80]

    product_id = href

    new_prices[product_id] = current_price

    # CHECK OLD PRICE
    if product_id in old_prices:

        old_price = old_prices[product_id]

        if old_price > 0:

            drop_percent = (
                (old_price - current_price)
                / old_price
            ) * 100

            if drop_percent >= 95:

                msg = f"""
🚨 95%+ PRICE DROP

📦 {product_name}

💰 ₹{old_price} → ₹{current_price}

📉 Drop: {drop_percent:.1f}%

🔗 {full_link}
"""

                messages.append(msg)

            elif drop_percent >= 90:

                msg = f"""
🔥 90%+ PRICE DROP

📦 {product_name}

💰 ₹{old_price} → ₹{current_price}

📉 Drop: {drop_percent:.1f}%

🔗 {full_link}
"""

                messages.append(msg)

# SAVE NEW PRICES
with open(PRICE_FILE, "w") as f:
    json.dump(new_prices, f)

# SEND TELEGRAM ALERTS
telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

if len(messages) == 0:

    requests.post(
        telegram_url,
        data={
            "chat_id": CHAT_ID,
            "text": "✅ Scan complete. No 90%+ drops found."
        }
    )

else:

    for msg in messages[:10]:

        requests.post(
            telegram_url,
            data={
                "chat_id": CHAT_ID,
                "text": msg
            }
        )

print("DONE")
