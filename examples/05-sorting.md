# 5. Sorting

GNews had two sort modes. Both map, one with a caveat.

| GNews.io | APITube |
|----------|---------|
| `sortby=publishedAt` | `sort.by=published_at&sort.order=desc` (the APITube default) |
| `sortby=relevance` | `sort.by=relevance` |

## `publishedAt`

```http
GET https://gnews.io/api/v4/search?q=tesla&sortby=publishedAt&apikey=KEY
```

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=tesla&sort.by=published_at&sort.order=desc&per_page=20"
```

This is APITube's default, so both parameters are optional.

## `relevance`

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?source.country.code=us&sort.by=relevance&per_page=20"
```

> **⚠️ Known issue.** Combining `title=` with `sort.by=relevance` currently returns `500 ER0183` on the production API. Since `sortby=relevance` was always paired with a `q` on GNews, this hits the common path.
>
> Use `sort.by=published_at`, or `sort.by=engagement` / `sort.by=quality` — both work alongside `title=` and are closer to what most people wanted from "relevance". The shims fall back automatically and warn.

## Modes GNews never had

```bash
# Viral potential — social feeds, trending sections
sort.by=engagement

# Editorial quality — curated digests, newsletters
sort.by=quality

# Polarization — debate topics, political analysis
sort.by=controversy

# Source credibility — research, fact-checking
sort.by=trust

# Publisher authority (Open Page Rank)
sort.by=source.rank.opr

# Article length
sort.by=read_time
```

Example — the highest-quality coverage of a topic this week, excluding paywalled and duplicate articles:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=tesla&published_at.start=NOW-7DAYS&is_paywall=0&is_duplicate=0&sort.by=quality&per_page=20"
```

GNews had no equivalent to any of those three filters, let alone the sort.

## Replacing Google News ranking

GNews's `/top-headlines` used Google News ranking. There is no direct substitute. The nearest approach combines a scoring mode with an authority floor:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?sort.by=engagement&source.rank.opr.min=6&published_at.start=NOW-1DAY&language.code=en&per_page=20"
```

## Filtering instead of sorting

Sometimes what you wanted from a sort is really a filter:

```bash
# Only authoritative publishers, in publication order
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=tesla&source.rank.opr.min=7&sort.by=published_at&sort.order=desc&per_page=20"

# Only negative coverage
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?organization.name=Tesla&entity.sentiment.polarity=negative&per_page=20"
```

## Watch out

**`sort.order` is separate.** GNews baked direction into the mode name; APITube splits it. The default is `desc`.

**Composite sorts are computed per request.** `relevance`, `engagement`, `quality`, `controversy`, and `trust` are scored at query time, so results can shift slightly between pages of a long run. Sort by `published_at` or `id` for a stable sweep.

**One ordering quirk.** Sorting by `source.rank.opr` can place an article whose publisher has no rank recorded in the middle of the sequence rather than at the end. If exact ordering matters, sort client-side on `source.rankings.opr` after fetching.
