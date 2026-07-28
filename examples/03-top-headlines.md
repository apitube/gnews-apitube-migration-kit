# 3. Top headlines

## Before — GNews.io

```http
GET https://gnews.io/api/v4/top-headlines?category=technology&lang=en&country=us&max=10&apikey=YOUR_GNEWS_KEY
```

## After — APITube

```http
GET https://api.apitube.io/v1/news/everything?category.id=medtop:20000756&language.code=en&source.country.code=us&per_page=10&sort.by=published_at&sort.order=desc
X-API-Key: YOUR_APITUBE_KEY
```

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?category.id=medtop%3A20000756&language.code=en&source.country.code=us&per_page=10&sort.by=published_at&sort.order=desc"
```

`technology` becomes `medtop:20000756`, the IPTC MediaTopic code for "technology and engineering". All nine categories: [category-mapping.md](../reference/category-mapping.md).

## The nine categories

| GNews | APITube |
|-------|---------|
| `business` | `category.id=medtop:04000000` |
| `entertainment` | `category.id=medtop:01000000` |
| `health` | `category.id=medtop:07000000` |
| `science` | `category.id=medtop:20000717` |
| `sports` | `category.id=medtop:15000000` |
| `technology` | `category.id=medtop:20000756` |
| `general` | omit the filter |
| `world` | `ignore.source.country.code=<your country>` |
| `nation` | `source.country.code=<your country>` |

Six are subjects and map cleanly. `general`, `world`, and `nation` are editorial groupings relative to the reader, so you express the intent directly.

```bash
# GNews: category=nation&country=de
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?source.country.code=de&language.code=de&per_page=20&sort.by=published_at&sort.order=desc"

# GNews: category=world&country=de  (everything but German publishers)
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?ignore.source.country.code=de&language.code=en&per_page=20"
```

## No Google News ranking

GNews's top-headlines picks articles by Google News ranking. APITube has no access to that signal.

The closest reconstruction combines a scoring mode with an authority floor:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?sort.by=engagement&source.rank.opr.min=6&published_at.start=NOW-1DAY&language.code=en&per_page=20"
```

| `sort.by` | What it favours |
|-----------|-----------------|
| `engagement` | Viral potential — closest to a trending feed |
| `quality` | Editorial quality — curated digests |
| `trust` | Source credibility — research, fact-checking |
| `source.rank.opr` | Publisher authority alone |

None reproduces Google's ranking, but each is transparent about what it optimizes for.

## Combining filters

GNews allowed `q` alongside `category`. APITube allows everything at once:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?category.id=medtop%3A04000000&title=merger&source.country.code=gb&source.rank.opr.min=6&is_paywall=0&per_page=20"
```

Category, keyword, country, publisher authority, and paywall status in one request — GNews had no parameter for the last two.

## Multiple categories

```bash
# science OR technology OR health, one request
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?category.id=medtop%3A20000717,medtop%3A20000756,medtop%3A07000000&per_page=20"
```

Up to 3 values, OR logic. And exclusions, which GNews lacked:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?language.code=en&ignore.category.id=medtop%3A15000000&per_page=20"
```

## Watch out

**Set `sort.by` explicitly.** APITube's `/v1/news/top-headlines` returns an unordered mix otherwise.

**GNews's top-headlines `country` was fuzzy** — "most articles will come from sources originating in that country, and the others will be relevant to that country". APITube's `source.country.code` is publisher location only. For subject-country coverage, add `location.name`:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?location.name=Japan&language.code=en&per_page=20"
```

**Classification is per-article, and imperfect.** Scores below roughly 0.3 are weak signals; a `category.id` feed can surface the occasional unrelated story. Read `categories[].score`, or use a narrower `topic.id`.
