"""Run with: APITUBE_API_KEY=your_key python example.py"""

import os
import sys

from gnews_shim import GNewsShim

api_key = os.environ.get("APITUBE_API_KEY")

if not api_key:
    print("Set APITUBE_API_KEY first. Get a key at https://apitube.io")
    sys.exit(1)


def log(message):
    print(f"[gnews-shim] {message}")


client = GNewsShim(api_key=api_key, on_warning=log)

# 1. The call your GNews code already makes, unchanged.
print("\n=== search: q + lang + country + max + sortby ===\n")

search = client.search(q="bitcoin", lang="en", country="us", max=5, sortby="publishedAt")

print(f"totalArticles: {search['totalArticles']}")

for article in search["articles"]:
    print(f"  {article['publishedAt']}  {article['source']['name']}  ({article['source']['country']})")
    print(f"  {article['title']}\n")

# 2. The precedence trap, handled automatically.
print("\n=== the OR/AND precedence rewrite ===\n")

for q in ["Apple AND iPhone OR Microsoft", "Tesla OR Rivian AND recall"]:
    params = client.translate_params({"q": q})
    print(f"  GNews:   {q}")
    print(f"  APITube: {params['query']}\n")

# 3. Top headlines by category.
print("\n=== top_headlines: category=technology ===\n")

headlines = client.top_headlines(category="technology", lang="en", max=3)

for article in headlines["articles"]:
    print(f"  {article['source']['name']}  {article['title'][:65]}")

# 4. max beyond the GNews ceiling.
print("\n=== max=250 — GNews caps at 10 on Free, 100 on Enterprise ===\n")

big = client.search(q="technology", lang="en", max=250)
print(f"  articles returned: {len(big['articles'])}")

# 5. Everything GNews never returned.
print("\n=== data GNews never returned ===\n")

if search["articles"]:
    enriched = search["articles"][0]["apitube"]
    entities = [entity["name"] for entity in (enriched.get("entities") or [])][:5]
    author = (enriched.get("author") or {}).get("name") or "(none)"

    print(f"  author:      {author}")
    print(f"  sentiment:   {enriched['sentiment']['overall']['polarity']} ({enriched['sentiment']['overall']['score']})")
    print(f"  source OPR:  {enriched['source']['rankings']['opr']}/10")
    print(f"  source bias: {enriched['source']['bias']}")
    print(f"  read time:   {enriched['read_time']} min")
    print(f"  entities:    {', '.join(entities)}")

# 6. Inspect the translation without sending a request.
print("\n=== translate_params (no request sent) ===\n")

print(
    client.translate_params(
        {
            "q": "crypto OR blockchain AND regulation",
            "in": "title",
            "lang": "en",
            "country": "gb",
            "max": 50,
            "page": 2,
            "from": "2026-07-01T00:00:00.000Z",
            "sortby": "publishedAt",
        }
    )
)
