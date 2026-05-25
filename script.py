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
MAX_ALERTS = 20

def normalize_price(value: str) -> int:
    value = value.replace(",", "").strip()
    return int(value)

# Load old prices
if os.path.exists(PRICE_FILE):
    try:
        with open(PRICE_FILE, "r") as f:
            old_prices = json.load(f)
    except Exception:
        old_prices = {}
else:
    old_prices = {}

new_prices = {}
alerts = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 2200})

    page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(8000)

    # Scroll a few times so more products load
    for _ in range(5):
        page.mouse.wheel(0, 2500)
        page.wait_for_timeout(2000)

    # Grab all visible anchors with text
    anchors = page.locator("a[href]").evaluate_all("""
        els => els.map(el => ({
            href: el.getAttribute('href') || '',
            text: (el.innerText || '').trim()
        }))
    """)

    browser.close()

for item in anchors:
    href = item.get("href", "")
    text = item.get("text", "")

    if not href or not text:
        continue

    # product-ish link
    if "/pn/" not in href and "/product" not in href and "/p/" not in href:
        continue

    price_matches = re.findall(r'₹\s*([0-9][0-9,]*)', text)
    if len(price_matches) < 2:
        continue

    try:
        prices = [normalize_price(p) for p in price_matches]
    except Exception:
        continue

    current_price = min(prices)
    old_display_price = max(prices)

    if current_price <= 0 or old_display_price <= current_price:
        continue

    full_link = href if href.startswith("http") else "https://www.zepto.com" + href
    product_name = text.split("₹")[0].strip().split("\n")[0][:120] or "Zepto Product"
    product_id = href

    new_prices[product_id] = current_price

    if product_id in old_prices:
        old_price = old_prices[product_id]
        if old_price > 0:
            drop = ((old_price - current_price) / old_price) * 100
            if drop >= MIN_DROP:
                alerts.append(
                    f"🔥 90%+ PRICE DROP\n\n"
                    f"📦 {product_name}\n\n"
                    f"💰 ₹{old_price} → ₹{current_price}\n\n"
                    f"📉 Drop: {drop:.1f}%\n\n"
                    f"🔗 {full_link}"
                )

# Save current prices
with open(PRICE_FILE, "w") as f:
    json.dump(new_prices, f)

telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

if not new_prices:
    msg = "❌ No products found on this page. The page may need a different location/session or different selector."
    requests.post(telegram_url, data={"chat_id": CHAT_ID, "text": msg})
elif not alerts:
    msg = f"✅ Scan Complete\n\nProducts scanned: {len(new_prices)}\nNo 90%+ drops found."
    requests.post(telegram_url, data={"chat_id": CHAT_ID, "text": msg})
else:
    for alert in alerts[:MAX_ALERTS]:
        requests.post(telegram_url, data={"chat_id": CHAT_ID, "text": alert})

print("DONE")
