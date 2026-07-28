# 6. Full content

## The GNews limit

On the Free plan, `content` is truncated automatically. The response carries a marker:

```json
{
  "title": "M5 chip leak reveals Apple has big gains coming in key area",
  "content": "Today, Apple's as-yet-unannounced M5 iPad Pro was seemingly leaked by the same YouTuber who last year leaked the M4 MacBook Pro… [1862 chars]"
}
```

Full content starts at the Essential plan, €49.99/month. There is also a `truncate=content` parameter for deliberately shortening it on paid plans.

## APITube

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=bitcoin&per_page=1"
```

```json
{
  "results": [
    {
      "title": "Bitcoin OG Selling Eases, Dormant BTC Movement Hits 4-Year Low",
      "description": "Long-dormant bitcoin wallets have gone quiet...",
      "body": "Long-dormant bitcoin wallets have gone quiet again after a burst of activity earlier this month… (the whole article, no suffix)",
      "body_html": "<p>Long-dormant bitcoin wallets have gone quiet again…</p>",
      "words_count": 1140,
      "characters_count": 6666,
      "read_time": 6
    }
  ]
}
```

No `truncate` parameter, because there is no truncated mode to opt out of.

## What to change in your code

**Delete truncation-detection logic.** If you parsed `[N chars]`, that branch is dead:

```js
// Before
const truncated = /\[\d+ chars\]$/.test(article.content);

if (truncated) {
    article.fullText = await scrapeArticle(article.url);
}

// After
article.fullText = article.body;
```

**Drop `truncate=content` from your requests.** The shim warns and removes it.

**Two body fields, pick one.** `body` is plain text — right for NLP, indexing, and LLM prompts. `body_html` keeps paragraph structure — right for display. GNews returned neither in HTML form.

## What full text unlocks

Server-side analysis that previously needed your own pipeline:

```bash
# Reading time and length metrics, computed from the full text
read_time.min=5

# Readability, from the full text
readability.difficulty=advanced
readability.audience=professional

# Sentiment computed on the body, not just the headline
sentiment.body.polarity=negative

# Clickbait detection: headline sentiment contradicts body sentiment
is_clickbait=1
```

Entities are extracted from the full body, which is why entity filters catch articles that title search misses:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?organization.name=Tesla&entity.sentiment.polarity=negative&per_page=20"
```

And an extractive `summary` array arrives with each article, sentence by sentence, each with its own sentiment — no summarization step needed on your side.

## The author field

GNews returns no author at all. APITube returns `author: { id, name }`, which makes byline-level filtering possible:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?author.name=Jane%20Doe&per_page=20"

# Or only articles that have an attributed author
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?title=bitcoin&has_author=1&per_page=20"
```

There is also a [journalists directory](https://docs.apitube.io/platform/news-api/endpoints) at `/v1/journalists` with per-byline coverage stats.

## Plan differences

APITube's free plan truncates `description`, and `body` availability depends on your subscription — check the [pricing page](https://apitube.io/pricing) for current terms. The structural difference from GNews is where full text sits in the plan ladder: GNews puts it behind €49.99/month, and the Free plan additionally carries a 12-hour delay and a non-commercial licence.
