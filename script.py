import os
import json
import re
import requests
from bs4 import BeautifulSoup

# =========================
# SETTINGS
# =========================

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

URL = "https://www.zepto.com/search?query=electronics"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    )
}

PRICE_FILE = "prices.json"

MIN_DROP_PERCENT = 60

MAX_ALERTS = 20

# =========================
# LOAD OLD PRICES
# =========================

if os.path.exists(PRICE_FILE):

    try:
        with open(PRICE_FILE, "r") as f:
            old_prices = json.load(f)

    except:
        old_prices = {}

else:
    old_prices = {}

# =========================
# FETCH PAGE
# =========================

try:

    response = requests.get(
        URL,
        headers=HEADERS,
        timeout=30
    )

except Exception as e:

    error_message = f"❌ Request Failed\n\n{str(e)}"

    requests.post(
        f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
        data={
            "chat_id": CHAT_ID,
            "text": error_message
        }
    )

    raise SystemExit()

# =========================
# PARSE HTML
# =========================

soup = BeautifulSoup(response.text, "html.parser")

links = soup.find_all("a")

new_prices = {}

alerts = []

seen_products = set()

# =========================
# EXTRACT PRODUCTS
# =========================

for link in links:

    try:

        href = link.get("href")

        text = link.get_text(" ", strip=True)

        # VALID PRODUCT LINK
        if not href:
            continue

        if "/pn/" not in href:
            continue

        # REMOVE DUPLICATES
        if href in seen_products:
            continue

        seen_products.add(href)

        # FULL PRODUCT URL
        full_link = "https://www.zepto.com" + href

        # FIND ₹ PRICES
        prices = re.findall(r'₹\s?(\d+)', text)

        if len(prices) < 2:
            continue

        prices = [int(p) for p in prices]

        # CLEAN INVALID VALUES
        prices = [
            p for p in prices
            if p > 0 and p < 100000
        ]

        if len(prices) < 2:
            continue

        # CURRENT PRICE = LOWEST
        current_price = min(prices)

        # DISPLAY PRICE = HIGHEST
        display_price = max(prices)

        # INVALID DATA
        if current_price >= display_price:
            continue

        # PRODUCT NAME
        product_name = text[:120]

        product_id = href

        # SAVE CURRENT PRICE
        new_prices[product_id] = current_price

        # CHECK PREVIOUS PRICE
        if product_id in old_prices:

            previous_price = old_prices[product_id]

            if previous_price <= 0:
                continue

            # CALCULATE DROP %
            drop_percent = (
                (previous_price - current_price)
                / previous_price
            ) * 100

            # ALERT ONLY IF DROP IS BIG
            if drop_percent >= MIN_DROP_PERCENT:

                alert = f"""
🔥 HUGE PRICE DROP

📦 {product_name}

💰 ₹{previous_price} → ₹{current_price}

📉 Drop: {drop_percent:.1f}%

🔗 {full_link}
"""

                alerts.append(alert)

    except:
        continue

# =========================
# SAVE NEW PRICES
# =========================

try:

    with open(PRICE_FILE, "w") as f:
        json.dump(new_prices, f)

except:
    pass

# =========================
# TELEGRAM ALERTS
# =========================

telegram_url = (
    f"https://api.telegram.org/bot"
    f"{BOT_TOKEN}/sendMessage"
)

# NO DROPS FOUND
if len(alerts) == 0:

    message = (
        f"✅ Scan Complete\n\n"
        f"Products scanned: {len(new_prices)}\n"
        f"No {MIN_DROP_PERCENT}%+ drops found."
    )

    requests.post(
        telegram_url,
        data={
            "chat_id": CHAT_ID,
            "text": message
        }
    )

# SEND ALERTS
else:

    for alert in alerts[:MAX_ALERTS]:

        requests.post(
            telegram_url,
            data={
                "chat_id": CHAT_ID,
                "text": alert
            }
        )

print("DONE")
