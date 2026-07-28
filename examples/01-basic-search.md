# 1. Basic search

## Before — GNews.io

```http
GET https://gnews.io/api/v4/search?q=bitcoin&lang=en&country=us&max=10&apikey=YOUR_GNEWS_KEY
```

```json
{
  "totalArticles": 4791,
  "articles": [
    {
      "id": "b961dade95c55b7f949ccd8e0234a356",
      "title": "Bitcoin OG Selling Eases, Dormant BTC Movement Hits 4-Year Low",
      "description": "Long-dormant bitcoin wallets have gone quiet...",
      "content": "Long-dormant bitcoin wallets have gone quiet again after a burst of activity… [1862 chars]",
      "url": "https://cointelegraph.com/...",
      "image": "https://cointelegraph.com/...jpg",
      "publishedAt": "2026-07-26T13:48:26Z",
      "lang": "en",
      "source": {
        "id": "92f73865e835e33ed68c11447777c939",
        "name": "Cointelegraph",
        "url": "https://cointelegraph.com",
        "country": "us"
      }
    }
  ]
}
```

## After — APITube

```http
GET https://api.apitube.io/v1/news/everything?title=bitcoin&language.code=en&source.country.code=us&per_page=10
X-API-Key: YOUR_APITUBE_KEY
```

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=bitcoin&language.code=en&source.country.code=us&per_page=10"
```

```json
{
  "status": "ok",
  "limit": 10,
  "page": 1,
  "has_next_pages": true,
  "request_id": "63d6d1a3-5fb6-4321-8b94-92b77e413200",
  "results": [
    {
      "id": 3067022102,
      "title": "Bitcoin OG Selling Eases, Dormant BTC Movement Hits 4-Year Low",
      "description": "Long-dormant bitcoin wallets have gone quiet...",
      "body": "Long-dormant bitcoin wallets have gone quiet again after a burst of activity… (full text, no suffix)",
      "href": "https://cointelegraph.com/...",
      "image": "https://cointelegraph.com/...jpg",
      "published_at": "2026-07-26T13:48:26.000Z",
      "language": "en",
      "author": { "id": 5678, "name": "@cointelegraph" },
      "source": {
        "id": 4232,
        "domain": "cointelegraph.com",
        "home_page_url": "https://cointelegraph.com",
        "bias": "right",
        "rankings": { "opr": 7 },
        "location": { "country_code": "us" }
      },
      "sentiment": { "overall": { "score": 0, "polarity": "neutral" } },
      "read_time": 1
    }
  ]
}
```

## What changed

| | GNews.io | APITube |
|---|----------|---------|
| Search term | `q=bitcoin` | `title=bitcoin` |
| Language | `lang=en` | `language.code=en` |
| Country | `country=us` | `source.country.code=us` |
| Result count | `max=10` | `per_page=10` |
| Auth | `apikey=` in the query string | `X-API-Key` header or `api_key=` |
| Article array | `articles[]` | `results[]` |
| URL field | `url` | `href` |
| Language field | `lang` | `language` |
| Date field | `publishedAt` | `published_at` |
| Publisher | `source.name` (display name) | `source.domain` (domain) |
| Article ID | 32-char hex string | Integer |
| Article text | `content`, truncated on Free | `body`, full text |
| Author | not returned at all | `author.name` |
| Total | `totalArticles` | Separate call to `/v1/news/count` |

## Watch out

**`title` searches headlines only.** GNews searched `title,description` by default, and could include `content` via `in=`. Expect a smaller result set. Alternatives:

```bash
# Entity filter — extraction runs on the full body
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?organization.name=Tesla&per_page=20"

# Topic filter for a subject area regardless of wording
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?topic.id=industry.crypto_news&per_page=20"
```

If your GNews call already used `in=title`, the conversion is lossless.

**`q` allowed 200 characters; `title` allows 100.** Longer queries go through `query=`.

**`q` was mandatory on GNews `/search`.** It is optional on APITube — a request with no search term returns the latest articles matching your other filters.

## Getting the total

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/count?title=bitcoin&language.code=en&source.country.code=us"
```

```json
{ "status": "ok", "count": 4791, "request_id": "..." }
```

Exact, not estimated. Broad filter combinations (a top-level category plus a date range) can time out — narrow the filters if you hit a 502, or just use `has_next_pages` for loop control.
