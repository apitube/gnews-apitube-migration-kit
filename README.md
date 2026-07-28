# GNews Migration Kit

### GNews.io API v4 → APITube News API

Everything you need to move off GNews.io: parameter tables, response field mapping, a drop-in compatibility shim in Node.js and Python, and an AI prompt that rewrites your queries. Every mapping here was verified against the live APITube API before it was written down.

**Keywords:** gnews alternative, gnews.io alternative, gnews api migration, `/api/v4/search` replacement, news api more than 100 articles per request, news api pagination limit

---

## Why people leave GNews.io

Four limits, all from GNews's own [documentation](https://docs.gnews.io/) and [pricing page](https://gnews.io/pricing):

| Limit | GNews.io | APITube |
|-------|----------|---------|
| **Articles per request** | Capped by plan: **10** on Free, 25 on Essential (€49.99/mo), 50 on Business (€99.99/mo), 100 on Enterprise (€249.99/mo) | **250** on every plan |
| **Pagination depth** | Hard stop at **1,000 articles** — "for performance reasons, it is not possible to paginate more than 1000 articles" | No depth limit on paid plans |
| **Freshness on Free** | **12-hour delay**, and the Free plan is explicitly non-commercial — their FAQ says accounts abusing that are terminated | No artificial delay; SSE and WebSocket streaming |
| **Archive on Free** | 30 days (paid plans reach back to 2020) | Years, on every plan |

The article cap is the one that stings: on GNews, going from 10 to 100 articles per request means €249.99/month. On APITube, `per_page=250` works on the entry plan.

## What is in here

| Path | What it gives you |
|------|-------------------|
| [`reference/parameter-mapping.md`](reference/parameter-mapping.md) | Every GNews query parameter → its APITube equivalent |
| [`reference/query-syntax.md`](reference/query-syntax.md) | **Read this one.** GNews gives `OR` higher precedence than `AND` — the opposite of APITube. Queries that look identical behave differently |
| [`reference/response-mapping.md`](reference/response-mapping.md) | Every response field → its APITube counterpart |
| [`reference/category-mapping.md`](reference/category-mapping.md) | All 9 GNews categories → IPTC MediaTopic codes |
| [`reference/language-country-mapping.md`](reference/language-country-mapping.md) | All 26 languages and 37 countries, including the ones that do not carry over |
| [`reference/limitations.md`](reference/limitations.md) | What does **not** carry over, stated plainly |
| [`shim/node/`](shim/node/) | `GNewsShim` — accepts GNews parameters, returns GNews response shape |
| [`shim/python/`](shim/python/) | Same shim for Python |
| [`examples/`](examples/) | Before/after request pairs for the six most common call patterns |
| [`tools/ai-migration-prompt.md`](tools/ai-migration-prompt.md) | System prompt for Claude/ChatGPT that converts your queries |

## Quick start

### 1. Get an APITube key

Sign up at [apitube.io](https://apitube.io), grab the key from the [dashboard](https://dashboard.apitube.io).

```bash
curl -H "X-API-Key: YOUR_API_KEY" "https://api.apitube.io/v1/news/everything?title=bitcoin"
curl "https://api.apitube.io/v1/news/everything?title=bitcoin&api_key=YOUR_API_KEY"
```

GNews passed the key as `apikey` in the query string only. APITube accepts either a header or `api_key`.

### 2. Translate one request by hand

The most common GNews call:

```http
GET https://gnews.io/api/v4/search?q=bitcoin&lang=en&country=us&max=10&sortby=publishedAt&apikey=YOUR_GNEWS_KEY
```

becomes:

```http
GET https://api.apitube.io/v1/news/everything?title=bitcoin&language.code=en&source.country.code=us&per_page=10&sort.by=published_at&sort.order=desc
X-API-Key: YOUR_APITUBE_KEY
```

Field by field: `q` → `title`, `lang` → `language.code`, `country` → `source.country.code`, `max` → `per_page`, `sortby=publishedAt` → `sort.by=published_at`.

### 3. Or drop in the shim and change nothing else

```js
import { GNewsShim } from './shim/node/gnews-shim.js';

const client = new GNewsShim({ apiKey: process.env.APITUBE_API_KEY });

// Same parameter names your GNews code already passes
const response = await client.search({
    q: 'bitcoin',
    lang: 'en',
    country: 'us',
    max: 10,
    sortby: 'publishedAt'
});

console.log(response.totalArticles);
for (const article of response.articles) {
    console.log(article.title, '—', article.source.name, article.publishedAt);
}
```

Python:

```python
from gnews_shim import GNewsShim

client = GNewsShim(api_key=os.environ["APITUBE_API_KEY"])
response = client.search(q="bitcoin", lang="en", country="us", max=10, sortby="publishedAt")

for article in response["articles"]:
    print(article["title"], "—", article["source"]["name"], article["publishedAt"])
```

The shim returns `totalArticles` and `articles[]` with `id`, `title`, `description`, `content`, `url`, `image`, `publishedAt`, `lang`, and `source{id,name,url,country}` exactly where your existing code expects them.

**It also translates the query operator precedence**, which is the part you would most likely get wrong by hand. See [`reference/query-syntax.md`](reference/query-syntax.md).

### 4. Let an AI do the bulk conversion

Paste [`tools/ai-migration-prompt.md`](tools/ai-migration-prompt.md) and [`reference/parameter-mapping.md`](reference/parameter-mapping.md) into Claude or ChatGPT, then feed it your queries. Verify what comes back against the reference tables.

## Endpoint mapping at a glance

| GNews.io | APITube | Notes |
|----------|---------|-------|
| `/api/v4/search` | `/v1/news/everything` | The main workhorse |
| `/api/v4/top-headlines` | `/v1/news/top-headlines`, or `/v1/news/everything` with `category.id` | GNews ranks by Google News; APITube ranks by publication time or a scoring mode you pick |

## The one thing that will silently break

GNews documents that **`OR` binds tighter than `AND`** — the reverse of every Lucene-style engine, including APITube's:

```
GNews:    Apple AND iPhone OR Microsoft   →  Apple AND (iPhone OR Microsoft)
APITube:  Apple AND iPhone OR Microsoft   →  (Apple AND iPhone) OR Microsoft
```

Same string, different results, no error either way. Any GNews query mixing `AND` and `OR` without brackets needs re-bracketing before it goes to APITube. [`reference/query-syntax.md`](reference/query-syntax.md) covers the rewrite rules; both shims apply them automatically.

## What you gain in the switch

GNews returns a headline, a description, article content, an image URL, and a source name. Every APITube article additionally carries:

- **Sentiment** at three levels — overall, title, body — plus per-entity sentiment
- **Named entities** with Wikidata and Wikipedia links, mention frequency, character offsets
- **IPTC MediaTopic categories**, topics, and industries with relevance scores
- **Source metadata** — Open Page Rank, political bias, country
- **Readability metrics** — Flesch-Kincaid grade, reading ease, target audience
- **Extractive summary** with per-sentence sentiment
- **Social share counts** for Facebook, X/Twitter, and Reddit
- **English machine translation** of title and description for 48 source languages
- `body_html` alongside plain `body`

Plus a boolean query language spanning every filter field, faceted aggregation, [SSE](https://docs.apitube.io/platform/news-api/integrations/sse-stream) and [WebSocket](https://docs.apitube.io/platform/news-api/integrations/websocket-stream) streaming, [webhooks](https://docs.apitube.io/platform/news-api/webhooks), and export to CSV, XLSX, Parquet, JSONL, RSS, XML.

## Read this before you start

[`reference/limitations.md`](reference/limitations.md) lists what does not survive. The short version: APITube's keyword search matches **article titles**, where GNews's `in` parameter could also search description and content; operator precedence differs; and Russian, Ukrainian, Malayalam, Marathi, and Punjabi are not supported.

## Documentation

- [APITube parameters reference](https://docs.apitube.io/platform/news-api/parameters) — all 65+ filters
- [APITube response structure](https://docs.apitube.io/platform/news-api/response-structure)
- [APITube endpoints](https://docs.apitube.io/platform/news-api/endpoints)

## Official SDKs

| Language | Repository |
|----------|-----------|
| Node.js / TypeScript | [news-api-node](https://github.com/apitube/news-api-node) |
| PHP | [news-api-php](https://github.com/apitube/news-api-php) |
| 30+ others | [news-api-integrations](https://github.com/apitube/news-api-integrations) |

## License

MIT — see [LICENSE](LICENSE).

GNews is a trademark of its respective owner. This repository is not affiliated with or endorsed by GNews.io. GNews details here are drawn from their public documentation and pricing page as of July 2026, and are reproduced only as field names and limits for mapping purposes.
