# GNews.io categories → APITube categories

GNews.io has nine categories on `/api/v4/top-headlines`. APITube classifies against **IPTC MediaTopics**, an open standard used across the news industry.

Every `category.id` below was verified against the live API: the request returns articles, and those articles actually carry the requested category.

## The nine categories

| GNews.io | APITube | IPTC name |
|----------|---------|-----------|
| `business` | `category.id=medtop:04000000` | economy, business and finance |
| `entertainment` | `category.id=medtop:01000000` | arts, culture, entertainment and media |
| `health` | `category.id=medtop:07000000` | health |
| `science` | `category.id=medtop:20000717` | natural science |
| `sports` | `category.id=medtop:15000000` | sport |
| `technology` | `category.id=medtop:20000756` | technology and engineering |
| `general` | *(omit the filter)* | — |
| `world` | *(see below)* | — |
| `nation` | *(see below)* | — |

Six map cleanly. Three are editorial groupings rather than subjects, and need a different approach.

## `general`

GNews's default category — the undifferentiated feed. No IPTC code corresponds to "no particular subject", so drop the parameter:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/top-headlines?per_page=20&language.code=en&sort.by=published_at&sort.order=desc"
```

For the front-page mix specifically, use the breaking-news flag:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?is_breaking=1&per_page=20&language.code=en&published_at.start=NOW-1DAY"
```

## `world` and `nation`

These are relative to the reader, not properties of the article. GNews decides what counts as "world" versus "nation" from the `country` you pass alongside. APITube has no reader context, so you express the intent directly.

**`nation`** — news published in one country:

```bash
# GNews: category=nation&country=de
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?source.country.code=de&language.code=de&per_page=20&sort.by=published_at&sort.order=desc"
```

**`world`** — international coverage. Two readings, pick the one you meant:

```bash
# Everything except your home country's publishers
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?ignore.source.country.code=de&language.code=en&per_page=20"

# Or: articles about international conflict and diplomacy
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?category.id=medtop%3A16000000&per_page=20"
```

`medtop:16000000` is "conflict, war and peace" — the closest IPTC subject to a world-news desk, though narrower than GNews's version.

## Narrower alternatives

Some GNews categories are closer to an *industry* than a *subject*:

| GNews category | Narrower APITube alternative |
|----------------|------------------------------|
| `technology` | `topic.id=industry.technology_news` |
| `business` | `topic.id=industry.financial_news` |
| `health` | `topic.id=industry.healthcare_news` |

`category.id` is broad and high-recall; `topic.id` is narrow and high-precision. If a GNews category feed felt noisy, use the topic. Full list: [topics](https://docs.apitube.io/platform/news-api/list-of-topics).

## Multiple categories

GNews took one category per request. APITube takes up to 3, OR logic:

```bash
# science OR technology OR health in one request
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?category.id=medtop%3A20000717,medtop%3A20000756,medtop%3A07000000&per_page=20"
```

And exclusions, which GNews had no parameter for:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?language.code=en&ignore.category.id=medtop%3A15000000&per_page=20"
```

## Combining categories with search

GNews allowed `q` alongside `category` on `/top-headlines`. APITube allows the same, plus every other filter at once:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?category.id=medtop%3A04000000&title=merger&source.country.code=gb&source.rank.opr.min=6&per_page=20"
```

## Watch out

**An article carries many categories, not one.** GNews returned no category on the article object at all. APITube returns a scored array. When you filter by `category.id=medtop:04000000`, the article matched — but `categories[0]` may be something else, because the array is not ordered by your filter. Read the `score`, or match the `medtop:` code inside `categories[].links.self`.

**Scores below roughly 0.3 are weak signals.** Filter on `score` client-side or switch to a narrower `topic.id` if a feed feels noisy.

## Finding a category ID

1. **The full list** — [all IPTC MediaTopics](https://docs.apitube.io/platform/news-api/list-of-categories), several thousand entries.
2. **Autocomplete** — `/v1/suggest/categories?prefix=football` returns matches with IDs. (The parameter is `prefix`, not `q`.)
3. **Read them off an article** — `categories[].links.self` contains the `medtop:` code.
