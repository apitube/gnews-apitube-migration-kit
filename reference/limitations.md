# What does not carry over

Read this before you migrate. Everything here is a real gap, verified against the live API.

## 1. Operator precedence is reversed

**The only difference that fails silently.** GNews binds `OR` tighter than `AND`; APITube does the opposite.

```
Apple AND iPhone OR Microsoft

GNews:    Apple AND (iPhone OR Microsoft)
APITube:  (Apple AND iPhone) OR Microsoft
```

Both succeed, both return articles, the sets differ. Any query mixing `AND` and `OR` without brackets must be re-bracketed. Full rules and worked examples: [query-syntax.md](query-syntax.md). Both shims handle it automatically.

## 2. No description or content search

GNews's `in` parameter chose where keywords were matched — `title`, `description`, `content`, or a combination, defaulting to `title,description`. APITube searches **article titles only**.

| `in` value | Carries over |
|------------|--------------|
| `in=title` | ✅ Exactly — this is what `title` does |
| `in=title,description` (the default) | ⚠️ Narrows to titles only |
| `in=content` | ❌ No equivalent |

Expect a smaller result set for any query relying on the default. Compensations, best first:

```bash
# Entity filters run on the full body, so they see what title search cannot
organization.name=Tesla
person.name=Elon Musk

# Topic and category filters cover a subject regardless of wording
topic.id=industry.crypto_news
category.id=medtop:04000000

# Boolean OR across title variants
query=title:(acquisition OR merger OR takeover)
```

## 3. `q` length drops from 200 to 100 characters

APITube's `title` filter accepts 2–100 characters. Longer queries must go through the `query` boolean parameter instead, which has a higher cap.

## 4. Five languages are missing

`ml` (Malayalam), `mr` (Marathi), `pa` (Punjabi), `ru` (Russian), and `uk` (Ukrainian) all return `400 ER0237`.

The Indian-language gap matters if you target Kerala, Maharashtra, or Punjab — APITube covers Bengali, Hindi, Tamil, Telugu, Gujarati, Kannada, and Urdu, but not those three.

For Russian and Ukrainian there is no substitute beyond tracking the subject in another language:

```bash
location.name=Ukraine&language.code=en
```

## 5. Two countries are missing

`country=ru` and `country=ua` return `400 ER0212`. The other 35 GNews countries map directly.

## 6. `sort.by=relevance` breaks when combined with `title`

**Known bug on the production API.** Sending both `title=` and `sort.by=relevance` returns `500 ER0183`.

```bash
# Fails
curl "https://api.apitube.io/v1/news/everything?title=tesla&sort.by=relevance&api_key=KEY"

# Works
curl "https://api.apitube.io/v1/news/everything?title=tesla&sort.by=published_at&api_key=KEY"
curl "https://api.apitube.io/v1/news/everything?title=tesla&sort.by=engagement&api_key=KEY"
```

`sortby=relevance` on GNews was always paired with a `q`, so this hits the common path. Every other sort mode works with `title`. Both shims fall back to `published_at` with a warning.

## 7. No Google News ranking

GNews's `/top-headlines` selects articles by Google News ranking. APITube has no access to that signal and no equivalent.

The closest reconstruction combines a scoring mode with a publisher-authority floor:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?sort.by=engagement&source.rank.opr.min=6&published_at.start=NOW-1DAY&language.code=en&per_page=20"
```

`engagement` scores viral potential; `quality` scores editorial quality; `trust` scores source credibility. None reproduces Google's ranking, but they are transparent about what they optimize for, which Google News is not.

## 8. `world` and `nation` categories have no direct equivalent

They describe the article's relationship to the *reader*, not its subject. APITube classifies articles, not reader context. Express the intent directly with `source.country.code` or `ignore.source.country.code` — see [category-mapping.md](category-mapping.md).

## 9. No `totalArticles` in the article response

GNews put `totalArticles` in every response. APITube returns `has_next_pages` and `next_page` instead. For a total, call `/v1/news/count` with the same filters — exact, not estimated, and cheap since it does not load article content.

Two caveats: it is a second HTTP request, and very broad filter combinations (a top-level category plus a date range) can exceed the gateway timeout and return a 502. `has_next_pages` is the better loop control and needs no total at all.

## 10. Multi-value filters cap at 3, silently

`language.code`, `source.country.code`, `source.domain`, `category.id`, `topic.id` and friends accept up to 3 comma-separated values. A fourth is **ignored without an error**:

```bash
# 'it' never applies — no error, no warning
language.code=en,de,fr,it
```

GNews took only one value per filter, so this is still an upgrade — just not an unlimited one.

## 11. Country filtering is approximate

`source.country.code` uses publisher metadata. Spot checks across `us`, `gb`, `de`, and `fr` put precision at 90–98%. If you need a hard guarantee, check `source.location.country_code` per article and drop mismatches.

Note that GNews's `/top-headlines` `country` was looser still — it deliberately mixed in articles merely "relevant to that country".

## 12. `/v1/news/top-headlines` does not sort by date by default

Always set `sort.by` explicitly on that endpoint:

```bash
sort.by=published_at&sort.order=desc
```

## 13. Response-shape differences that will bite

| What | GNews.io | APITube |
|------|----------|---------|
| Article `id` | 32-char hex string | Integer |
| `source.id` | Hex string | Integer |
| Publisher name | `source.name`, display name ("9to5Mac") | `source.domain` (`9to5mac.com`) |
| Article text | `content`, truncated on Free with `[N chars]` | `body`, never truncated mid-article |
| Language field | `lang` | `language` |
| URL field | `url` | `href` |
| Date field | `publishedAt` | `published_at` |
| Source country | Only on `/search` | On every endpoint |
| Error shape | Array of strings **or** object keyed by parameter | Always an array of objects |
| Error status | HTTP code | Check `status` in the body — can be `"not_ok"` on HTTP 200 |

If your code parses the `[N chars]` truncation marker, delete that logic.

## 14. `truncate` and `nullable` disappear

`truncate=content` has no purpose — APITube does not offer a truncated mode.

`nullable` inverts. GNews excluded articles with null `description`, `content`, or `image` by default; APITube returns everything and you opt in with `has_image=1`. There is no filter for description or content presence, though `body` is present far more consistently.

## Where APITube is ahead

- **250 articles per request** on every plan, versus 10 on GNews Free and 100 at €249.99/month
  - Response time varies widely and is not reliably predictable. Measured 27 July 2026, the same request shape returned anywhere from 3 to 28 seconds. A larger page raises the average — on a search query `per_page=10` ran 3–14s against 18–26s at `per_page=250` — but the spread is wide enough that a modest `per_page=100`, and even a query with no `per_page` at all, also landed past 25 seconds. Requests that cross roughly 25 seconds intermittently return `500`. Raise your client timeout above 30 seconds and retry on `500`.
- **No 1,000-article pagination wall** — page numbers go as deep as you need on paid plans
- **No 12-hour delay** and no non-commercial restriction on the entry plan
- **178 countries**, versus 37
- **60 languages**, versus 26
- Author field, which GNews does not return at all
- Sentiment at article, title, body, and per-entity level
- Named entities with Wikidata IDs, mention counts, character offsets
- IPTC categories, topics, industries with relevance scores
- Publisher authority (Open Page Rank) and political bias
- Domain include/exclude filters — GNews has no way to exclude a publisher
- Readability scoring
- Boolean query language across every filter field
- Faceted aggregation in a single request
- [SSE](https://docs.apitube.io/platform/news-api/integrations/sse-stream) and [WebSocket](https://docs.apitube.io/platform/news-api/integrations/websocket-stream) streaming
- [Webhooks](https://docs.apitube.io/platform/news-api/webhooks) with signed payloads
- Export to CSV, XLSX, Parquet, JSONL, RSS, XML
- English machine translation of title and description for 48 source languages
