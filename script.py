import os
import requests

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

# SAMPLE PRODUCTS
products = [
    {
        "name": "Sample Product 1",
        "old_price": 1000,
        "current_price": 50
    },
    {
        "name": "Sample Product 2",
        "old_price": 500,
        "current_price": 300
    }
]

for product in products:
    old_price = product["old_price"]
    current_price = product["current_price"]

    drop_percent = ((old_price - current_price) / old_price) * 100

    if drop_percent >= 90:
        message = f"""
🔥 PRICE DROP ALERT

{product['name']}

₹{old_price} → ₹{current_price}

Drop: {drop_percent:.1f}%
"""

        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

        requests.post(url, data={
            "chat_id": CHAT_ID,
            "text": message
        })

        print("Alert sent!")
