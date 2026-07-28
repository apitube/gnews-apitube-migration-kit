# GNews.io v4 → APITube parameter mapping

Every query parameter accepted by `https://gnews.io/api/v4/search` and `/api/v4/top-headlines`, with its APITube equivalent. Verified against the live APITube API.

Base URL: `https://api.apitube.io`
Main endpoint: `/v1/news/everything`

## Authentication

| GNews.io | APITube |
|----------|---------|
| Query `apikey=KEY` | Header `X-API-Key: KEY` |
| — | or query `api_key=KEY` |

GNews accepted the key in the query string only. APITube takes either; the header is preferred so keys stay out of logs and referrers.

## `/api/v4/search`

| GNews.io | APITube | Conversion | Fidelity |
|----------|---------|------------|----------|
| `q` | `title` | Direct for simple queries — see [Search term](#search-term-q) | ⚠️ Partial |
| `q` (with operators) | `query` | **Re-bracket first** — see [query-syntax.md](query-syntax.md) | ⚠️ Partial |
| `lang` | `language.code` | Direct for 21 of 26 codes | ⚠️ Partial |
| `country` | `source.country.code` | Direct for 35 of 37 codes | ⚠️ Partial |
| `max` | `per_page` | GNews caps by plan (10/25/50/100); APITube allows **250** everywhere | ✅ Better |
| `in=title` | `title` | Exact match — this is what `title` does | ✅ Full |
| `in=description` / `content` | — | **No equivalent.** APITube searches titles only | ❌ None |
| `nullable` | `has_image`, `has_author` | Inverted logic — see [Nullable](#nullable) | ⚠️ Partial |
| `from` | `published_at.start` | ISO 8601 passes through unchanged, milliseconds included | ✅ Full |
| `to` | `published_at.end` | Same | ✅ Full |
| `sortby=publishedAt` | `sort.by=published_at&sort.order=desc` | The APITube default | ✅ Full |
| `sortby=relevance` | `sort.by=relevance` | See the [warning](#sorting-sortby) | ⚠️ Partial |
| `page` | `page` | Same name, same 1-based meaning. GNews stops at 1,000 articles; APITube does not | ✅ Better |
| `truncate=content` | — | Not needed. APITube never truncates `body` mid-article | ➖ N/A |
| `apikey` | `api_key` or `X-API-Key` | | ✅ Full |

Legend: ✅ Full · ✅ Better — APITube exceeds it · ⚠️ Partial — works, semantics differ · ❌ None · ➖ N/A

## `/api/v4/top-headlines`

| GNews.io | APITube | Conversion |
|----------|---------|------------|
| `category` | `category.id` | IPTC MediaTopic code — see [category-mapping.md](category-mapping.md) |
| `lang` | `language.code` | Direct |
| `country` | `source.country.code` | Direct |
| `max` | `per_page` | Plan-capped on GNews, 250 on APITube |
| `nullable` | `has_image` etc. | Inverted — see below |
| `from` / `to` | `published_at.start` / `.end` | Direct |
| `q` | `title` | Same caveat as `/search` |
| `page` | `page` | Direct |
| `truncate` | — | Not applicable |

GNews's top-headlines ranks by Google News. APITube has no Google News ranking; pick an explicit order instead — `sort.by=published_at` for recency, or `engagement` / `quality` / `trust` for a scored feed. See [Sorting](#sorting-sortby).

---

## Search term (`q`)

Two things change.

**First: scope.** GNews's `in` parameter defaulted to `title,description` and could include `content`. APITube's `title` searches **article titles only**. There is no description or body search.

Practical effect: a GNews query relying on the default `title,description` will return fewer results on APITube. A query that already set `in=title` migrates losslessly.

**Second: operator precedence.** GNews binds `OR` tighter than `AND`; APITube does the opposite. Any query mixing both without brackets means something different on each API. Full detail and rewrite rules: [query-syntax.md](query-syntax.md).

### Compensating for title-only search

**Filter by entity** — extraction runs on the full body, so entity filters see what title search cannot:

```bash
# Instead of: q=Tesla&in=title,description,content
organization.name=Tesla

# With sentiment toward that entity
organization.name=Tesla&entity.sentiment.polarity=negative
```

**Filter by topic or category:**

```bash
topic.id=industry.crypto_news
category.id=medtop:04000000
```

**Widen the keyword set.** `title` expands each keyword with synonyms and morphological forms. For OR logic, use `query`.

### Length

GNews allowed 200 characters in `q`; APITube's `title` allows 100 (2 minimum). Longer queries go through `query=` instead.

---

## `max` → `per_page`

The clearest win in the migration.

| Plan | GNews `max` cap | APITube `per_page` |
|------|-----------------|--------------------|
| Free | 10 | 250 |
| Essential (€49.99/mo) | 25 | 250 |
| Business (€99.99/mo) | 50 | 250 |
| Enterprise (€249.99/mo) | 100 | 250 |

GNews's documentation states a maximum of 100, but the value you can actually set depends on your subscription. APITube's 250 applies on every plan; above that returns `400 ER0171`.

Fewer requests for the same corpus: pulling 1,000 articles took 100 requests on GNews Free and 10 on Enterprise. On APITube it takes 4.

---

## Paging

| | GNews.io | APITube |
|---|----------|---------|
| Parameter | `page`, 1-based | `page`, 1-based |
| Page size | `max`, plan-capped | `per_page`, up to 250 |
| **Depth limit** | **1,000 articles, hard** | None on paid plans; 5 pages on free |
| Deep paging | Not possible past 1,000 | Page numbers, unlimited on paid plans |

`page` needs no conversion. The depth limit does: GNews states outright that pagination beyond 1,000 articles is not possible. If your code stopped at that wall, it no longer has to.

For deep runs, follow `next_page` from each response:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=bitcoin&per_page=250&sort.by=published_at"
# then follow next_page while has_next_pages is true
```

> **Cursor pagination is documented but not live.** APITube's docs describe `next_cursor`, `next_cursor_url`, and a `cursor=` parameter for keyset paging. Production does not return those fields — verified across `sort.by=published_at`, `id`, and `source.rank.opr` — and passing `cursor=` is silently ignored, returning page 1 with no error. Page numbers are the working mechanism: follow `next_page`, which is a complete, ready-to-fetch URL.

---

## Dates (`from` / `to`)

Direct mapping, no reformatting. APITube accepts GNews's exact ISO 8601 format, milliseconds and all — verified:

```
from=2026-07-18T21:32:58.500Z  →  published_at.start=2026-07-18T21:32:58.500Z
to=2026-07-26T00:00:00.000Z    →  published_at.end=2026-07-26T00:00:00.000Z
```

APITube adds a relative syntax GNews did not have:

| Form | Example |
|------|---------|
| `NOW±<N><UNIT>` | `NOW-6HOURS`, `NOW-2WEEKS` |
| `NOW/<UNIT>` | `NOW/DAY` — start of today, UTC |
| `NOW±<N><UNIT>/<UNIT>` | `NOW-1DAY/DAY` — start of yesterday |
| `<N><UNIT>` | `7DAYS`, `2MONTHS` |
| Short aliases | `1w`, `2m`, `3d`, `4h`, `5y` |

So a rolling window needs no date arithmetic in your code:

```
published_at.start=NOW-7DAYS
```

**Archive depth.** GNews Free reaches back 30 days; paid plans reach 2020. APITube's archive goes back years on every plan.

---

## Sorting (`sortby`)

| GNews.io | APITube |
|----------|---------|
| `sortby=publishedAt` | `sort.by=published_at&sort.order=desc` (the default) |
| `sortby=relevance` | `sort.by=relevance` |

> **⚠️ Known issue.** Combining `title=` with `sort.by=relevance` currently returns `500 ER0183` on the production API. Since `sortby=relevance` on GNews was always paired with a `q`, this hits the common path. Use `sort.by=published_at`, or `sort.by=engagement` / `sort.by=quality`, which work fine with `title=`. Both shims fall back automatically and warn.

### Replacing Google News ranking

GNews's `/top-headlines` used Google News rankings. APITube has no equivalent signal, but offers explicit scoring modes:

| `sort.by` | Optimizes for |
|-----------|---------------|
| `engagement` | Viral potential — closest to a "trending" feed |
| `quality` | Editorial quality — curated digests |
| `trust` | Source credibility — research, fact-checking |
| `controversy` | Polarization — debate topics |
| `source.rank.opr` | Publisher authority (Open Page Rank) |
| `published_at` | Pure recency |

For a headline feed, `sort.by=engagement` combined with `source.rank.opr.min=6` gets closest to what Google News surfaces.

---

## `nullable`

GNews **excludes** articles with null `description`, `content`, or `image` by default. `nullable=description,content,image` opts back in to allowing nulls.

APITube has the inverse: it returns everything, and you opt *in* to requiring a field.

| GNews behaviour | APITube equivalent |
|-----------------|--------------------|
| Default (no `nullable`) | `has_image=1` — the closest single filter |
| `nullable=image` | Omit `has_image` |
| `nullable=description` | No equivalent — APITube does not filter on description presence |
| `nullable=content` | No equivalent — but `body` is present far more consistently |

In practice most APITube articles have an image (a 10-article sample of `title=bitcoin` came back 10/10), so this rarely changes result counts. Related filters GNews had nothing for:

```bash
has_video=1
has_hq_images=1          # width >= 1200px
has_author=1
media.images.count.min=2
```

---

## Errors

| GNews.io | APITube |
|----------|---------|
| `400` + `{"errors": {"q": "..."}}` | `400` + `{"status":"not_ok","errors":[{"code":"ER####","message":"..."}]}` |
| `401` "Your API key is invalid." | `ER0175` |
| `403` daily quota exhausted | HTTP 429 — see [rate limits](https://docs.apitube.io/platform/news-api/rate-limits) |
| `429` rate limited (1 req/s Free, 10 req/s paid) | HTTP 429 |
| `500` / `503` | `ER0183`, or a gateway error on very heavy queries |

Two shape differences: GNews's `errors` is either an array of strings or an object keyed by parameter; APITube's is always an array of objects with `code`, `message`, `status`, `timestamp`, and `links.about`. And an APITube failure can arrive with HTTP 200 and `status: "not_ok"` in the body — check the field, not just the code.

---

## Filters GNews.io never had

| Filter | What it does |
|--------|--------------|
| `sentiment.overall.polarity` | `positive` / `negative` / `neutral` |
| `entity.sentiment.polarity` | Sentiment *toward a specific entity* |
| `person.name`, `organization.name`, `brand.name`, `location.name` | Entity filters from full body text |
| `event.type` | Detected business events: `ipo`, `layoffs`, `merger` |
| `source.rank.opr.min` | Publisher authority floor, 0–10 |
| `source.bias` | `left` / `center` / `right` |
| `source.domain` / `ignore.source.domain` | Include or exclude specific publishers |
| `is_breaking`, `is_paywall`, `is_duplicate` | Editorial and quality flags |
| `readability.difficulty` | `beginner` / `intermediate` / `advanced` / `expert` |
| `topic.id`, `industry.id` | Topic and industry taxonomies |
| `hl=1` | Hit highlighting with configurable tags |
| `facet=true&facet.field=...` | Aggregate counts by any field |
| `export=csv\|xlsx\|parquet\|jsonl\|rss\|xml` | Server-side format conversion |
| `/v1/news/local` | Geographic search by coordinates and radius |
| `/v1/news/trends` | Trending entities, sources, topics with growth rates |

GNews had no way to exclude a publisher, no sentiment, no entities, and no source-quality signal at all.

Full list: [APITube parameters reference](https://docs.apitube.io/platform/news-api/parameters).
