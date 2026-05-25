import os
import requests
from bs4 import BeautifulSoup

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

URL = "https://www.zepto.com/search?query=electronics"

headers = {
    "User-Agent": "Mozilla/5.0"
}

response = requests.get(URL, headers=headers)

soup = BeautifulSoup(response.text, "html.parser")

links = soup.find_all("a")

message = "🛒 PRODUCTS FOUND\n\n"

count = 0

for link in links:

    href = link.get("href")

    text = link.get_text(strip=True)

    if href and text:

        if "/pn/" in href:

            full_link = "https://www.zepto.com" + href

            message += f"{text}\n{full_link}\n\n"

            count += 1

    if count >= 5:
        break

telegram_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"

requests.post(
    telegram_url,
    data={
        "chat_id": CHAT_ID,
        "text": message
    }
)

print(message)
