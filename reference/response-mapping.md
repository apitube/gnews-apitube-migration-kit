# GNews.io response → APITube response mapping

## Envelope

| GNews.io | APITube | Notes |
|----------|---------|-------|
| `totalArticles` | — | Call `/v1/news/count` with the same filters. APITube's count is exact |
| `articles[]` | `results[]` | The article array |
| — | `status` | `"ok"` or `"not_ok"` |
| — | `limit`, `page` | Page size and current page |
| — | `has_next_pages`, `next_page` | Paging state plus a ready-made next-page URL |
| — | `export` | URLs that re-run this query as CSV, XLSX, Parquet, JSONL, RSS, XML |
| — | `request_id` | Trace ID for support |
| — | `highlighting` | Hit-highlight snippets keyed by article ID (with `hl=1`) |
| — | `facets` | Aggregated counts (with `facet=true`) |

```jsonc
// GNews.io
{ "totalArticles": 54904, "articles": [ /* ... */ ] }

// APITube
{
  "status": "ok",
  "limit": 20,
  "page": 1,
  "has_next_pages": true,
  "request_id": "1044de7a-a39d-463c-b443-1d9141f7babe",
  "results": [ /* ... */ ]
}
```

## Article object

| GNews.io | APITube | Notes |
|----------|---------|-------|
| `id` | `id` | GNews: 32-char MD5-style hex string. APITube: integer |
| `title` | `title` | Identical |
| `description` | `description` | Identical |
| `content` | `body` | GNews truncates on the Free plan with a `[N chars]` suffix; APITube's `body` is never truncated mid-article |
| `url` | `href` | |
| `image` | `image` | Both plain string URLs |
| `publishedAt` | `published_at` | Both ISO 8601 UTC |
| `lang` | `language` | Both ISO 639-1 |
| `source.id` | `source.id` | GNews: hex string. APITube: integer |
| `source.name` | `source.domain` | GNews gives a display name ("9to5Mac"); APITube gives the domain (`9to5mac.com`) |
| `source.url` | `source.home_page_url` | |
| `source.country` | `source.location.country_code` | GNews includes this only on `/search`, never on `/top-headlines`. APITube returns it everywhere |
| — | `author` | GNews has no author field at all |

### Fields APITube adds

| Field | What it is |
|-------|------------|
| `body_html` | Full text with HTML formatting |
| `author` | `{ id, name }` — GNews returns no author |
| `translations.en.title` / `.description` | English machine translation for non-English articles (48 source languages) |
| `sentiment` | `overall`, `title`, `body` — each `{ score, polarity }` |
| `entities[]` | Named entities with `type`, Wikidata/Wikipedia links, `frequency`, per-entity sentiment, character offsets |
| `categories[]` | IPTC MediaTopic categories with `id`, `name`, `score`, `taxonomy` |
| `topics[]`, `industries[]` | Topic and industry classification with relevance scores |
| `keywords[]` | Extracted keywords |
| `summary[]` | Extractive summary sentences, each with sentiment |
| `locations_mentioned[]` | Places named in the text, with `country`, `lat`, `lng` |
| `readability` | Flesch-Kincaid grade, reading ease, ARI, difficulty, target audience, reading age |
| `source.rankings.opr` | Open Page Rank, 0–10 |
| `source.bias` | `left` / `center` / `right` |
| `source.favicon` | |
| `shares` | Facebook, X/Twitter, Reddit counts plus `total` |
| `links[]`, `media[]` | Outbound URLs; images and videos |
| `story` | Cluster reference `{ id, uri }` |
| `is_duplicate`, `is_free`, `is_breaking` | Deduplication, paywall, breaking-news flags |
| `read_time`, `words_count`, `sentences_count`, `paragraphs_count`, `characters_count` | Content metrics |

### Side by side

```jsonc
// GNews.io article
{
  "id": "b961dade95c55b7f949ccd8e0234a356",
  "title": "M5 chip leak reveals Apple has big gains coming in key area",
  "description": "Apple's forthcoming M5 chip has seemingly leaked...",
  "content": "Today, Apple's as-yet-unannounced M5 iPad Pro was seemingly leaked… [1862 chars]",
  "url": "https://9to5mac.com/2025/09/30/m5-chip-leak-reveals...",
  "image": "https://i0.wp.com/9to5mac.com/wp-content/uploads/...",
  "publishedAt": "2025-09-30T19:38:25Z",
  "lang": "en",
  "source": {
    "id": "92f73865e835e33ed68c11447777c939",
    "name": "9to5Mac",
    "url": "https://9to5mac.com",
    "country": "us"
  }
}

// APITube article (abridged)
{
  "id": 3067022102,
  "title": "M5 chip leak reveals Apple has big gains coming in key area",
  "description": "Apple's forthcoming M5 chip has seemingly leaked...",
  "body": "Today, Apple's as-yet-unannounced M5 iPad Pro was seemingly leaked by the same YouTuber… (full text, no suffix)",
  "body_html": "<p>Today, Apple's as-yet-unannounced M5 iPad Pro…</p>",
  "href": "https://9to5mac.com/2025/09/30/m5-chip-leak-reveals...",
  "image": "https://i0.wp.com/9to5mac.com/wp-content/uploads/...",
  "published_at": "2025-09-30T19:38:25.000Z",
  "language": "en",
  "author": { "id": 5678, "name": "Chance Miller" },
  "source": {
    "id": 4232,
    "domain": "9to5mac.com",
    "home_page_url": "https://9to5mac.com",
    "bias": "center",
    "rankings": { "opr": 7 },
    "location": { "country_name": "United States", "country_code": "us" }
  },
  "sentiment": { "overall": { "score": 0.32, "polarity": "positive" } },
  "entities": [
    { "id": 1034399, "name": "Apple", "type": "organization", "frequency": 6,
      "links": { "wikidata": "https://www.wikidata.org/wiki/Q312" } }
  ],
  "read_time": 3
}
```

## Migrating the mapping function

```js
// Before — GNews.io
const items = data.articles.map(a => ({
    id: a.id,
    title: a.title,
    url: a.url,
    source: a.source.name,
    country: a.source.country,
    published: a.publishedAt,
    lang: a.lang,
    image: a.image,
    text: a.content
}));
```

```js
// After — APITube
const items = data.results.map(a => ({
    id: String(a.id),
    title: a.title,
    url: a.href,
    source: a.source.domain,
    country: a.source.location.country_code,   // present on every endpoint now
    published: a.published_at,
    lang: a.language,
    image: a.image,
    text: a.body,                               // never truncated
    author: a.author?.name,                     // new
    sentiment: a.sentiment.overall.polarity,    // new
    sourceRank: a.source.rankings.opr           // new
}));
```

Two gotchas: `id` and `source.id` change from hex strings to integers, so cast if you store them as strings; and `source.country` was only present on `/search` in GNews, so any code branching on its absence can be simplified.

## Errors

| GNews.io | APITube |
|----------|---------|
| `{"errors": ["Your API key is invalid."]}` | `{"status":"not_ok","errors":[{"code":"ER0175","message":"..."}]}` |
| `{"errors": {"q": "The query is required."}}` | `{"status":"not_ok","errors":[{"code":"ER####",...}]}` |
| `403` daily quota | HTTP 429 |
| `429` rate limit | HTTP 429 |
| `500` / `503` | `ER0183`, or a gateway error on very heavy queries |

GNews's `errors` is either an array of strings or an object keyed by parameter — two shapes to handle. APITube's is always an array of objects:

```json
{
  "status": "not_ok",
  "request_id": "4760c32a-8d72-4d1e-8018-b61fa687a509",
  "errors": [
    {
      "status": 400,
      "code": "ER0237",
      "message": "language with code 'ru' not found.",
      "links": { "about": "https://docs.apitube.io/platform/news-api/http-response-codes" },
      "timestamp": "2026-07-26T21:14:02.918Z"
    }
  ]
}
```

An APITube failure can arrive with HTTP 200 and `status: "not_ok"` — check the field, not only the status code.
