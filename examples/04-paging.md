# 4. Paging and article limits

Two hard ceilings disappear in this migration.

## `max` → `per_page`

| Plan | GNews `max` cap | APITube `per_page` |
|------|-----------------|--------------------|
| Free | 10 | 250 |
| Essential (€49.99/mo) | 25 | 250 |
| Business (€99.99/mo) | 50 | 250 |
| Enterprise (€249.99/mo) | 100 | 250 |

```bash
# 250 articles in one request — 25x the GNews Free ceiling
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=technology&language.code=en&per_page=250"
```

Verified: returns 250 articles. Above 250 gives `400 ER0171`.

Pulling 1,000 articles took 100 requests on GNews Free, 10 on Enterprise. On APITube it takes 4 — which also matters for daily quotas.

## The 1,000-article wall is gone

GNews states outright: "For performance reasons, it is not possible to paginate more than 1000 articles." Past that point there is no way forward.

APITube has no such wall. Follow `next_page`, a complete URL carried in every response:

```js
let url = 'https://api.apitube.io/v1/news/everything?title=bitcoin&per_page=250&sort.by=published_at';

while (url) {
    const response = await fetch(url, { headers: { 'X-API-Key': APITUBE_KEY } });
    const data = await response.json();

    process(data.results);

    url = data.has_next_pages ? data.next_page : null;
}
```

> **Cursor pagination is documented but not live.** APITube's docs describe `next_cursor`, `next_cursor_url`, and a `cursor=` parameter for keyset paging. Production does not return those fields — verified across `sort.by=published_at`, `id`, and `source.rank.opr` — and passing `cursor=` is silently ignored, returning page 1 with no error. Page numbers are the working mechanism.

## `page` → `page`

No conversion. Same name, same 1-based semantics.

```js
// Before — GNews
const url = `https://gnews.io/api/v4/search?q=bitcoin&max=10&page=${page}&apikey=${KEY}`;

// After — APITube
const url = `https://api.apitube.io/v1/news/everything?title=bitcoin&per_page=10&page=${page}`;
```

Loop control gets simpler too, since `has_next_pages` removes the need for a total:

```js
let page = 1;

while (true) {
    const response = await fetch(
        `https://api.apitube.io/v1/news/everything?title=bitcoin&per_page=250&page=${page}`,
        { headers: { 'X-API-Key': APITUBE_KEY } }
    );
    const data = await response.json();

    process(data.results);

    if (!data.has_next_pages) {
        break;
    }

    page += 1;
}
```

## Limits that remain

| | GNews.io | APITube |
|---|----------|---------|
| Page size | Plan-capped, 10–100 | 250 everywhere |
| Depth | 1,000 articles, hard | Unlimited on paid plans |
| Free-plan depth | 1,000 articles | 5 pages (`400 ER0173` beyond) |
| Rate limit | 1 req/s Free, 10 req/s paid | See [rate limits](https://docs.apitube.io/platform/news-api/rate-limits) |

## `totalArticles`

APITube's article responses do not carry a total. For one:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/count?title=bitcoin&language.code=en"
```

```json
{ "status": "ok", "count": 4791, "request_id": "..." }
```

Fetch it once at the start of a run, not per page. Very broad filter combinations can exceed the gateway timeout and return 502 — `has_next_pages` never has that problem.

## Bulk export

With no page-size ceiling and no depth wall, exporting a corpus becomes a single pipeline:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?topic.id=industry.crypto_news&published_at.start=NOW-30DAYS&per_page=250&export=jsonl" \
  -o corpus.jsonl
```

Formats: `json`, `jsonl`/`ndjson`, `csv`, `tsv`, `xlsx`, `parquet`, `xml`, `rss`.
