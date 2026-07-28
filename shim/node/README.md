# GNews.io v4 shim — Node.js

Accepts GNews.io v4 parameters, calls the APITube News API, returns a GNews-shaped response. Zero dependencies, Node 18+.

## Install

```bash
npm install /path/to/shim/node
```

Or copy `gnews-shim.js` into your project.

## Use

```js
import { GNewsShim } from './gnews-shim.js';

const client = new GNewsShim({ apiKey: process.env.APITUBE_API_KEY });

const response = await client.search({
    q: 'bitcoin',
    lang: 'en',
    country: 'us',
    max: 10,
    sortby: 'publishedAt'
});

for (const article of response.articles) {
    console.log(article.title, article.url, article.source.name, article.publishedAt);
}
```

`response.articles[]` carries the fields your existing code reads: `id`, `title`, `description`, `content`, `url`, `image`, `publishedAt`, `lang`, and `source{id,name,url,country}`.

Two improvements over GNews that need no code change: `content` is never truncated, and `source.country` is present on every endpoint rather than only on `/search`.

## The main reason to use the shim

GNews gives `OR` **higher** precedence than `AND`. APITube does the opposite. A query mixing both without brackets means different things on each API, and neither returns an error.

The shim re-brackets automatically:

```js
client.translateParams({ q: 'Apple AND iPhone OR Microsoft' });
// { query: 'title:Apple AND (title:iPhone OR title:Microsoft)' }

client.translateParams({ q: 'Tesla OR Rivian AND recall' });
// { query: '(title:Tesla OR title:Rivian) AND title:recall' }
```

Doing this by hand across a codebase is where migrations go wrong. Details: [query-syntax.md](../../reference/query-syntax.md).

## Options

```js
new GNewsShim({
    apiKey: 'your_key',                  // required
    baseUrl: 'https://api.apitube.io',   // override the API base URL
    onWarning: message => log(message),  // called for every lossy conversion
    includeTotalArticles: true,          // populate totalArticles via /v1/news/count
    fetch: customFetch                   // custom fetch implementation
});
```

`includeTotalArticles` costs one extra request per call. Turn it off if you page by `has_next_pages` — `totalArticles` then falls back to the number of articles returned.

## Methods

| Method | GNews.io equivalent |
|--------|---------------------|
| `search(params)` | `GET /api/v4/search` |
| `topHeadlines(params)` | `GET /api/v4/top-headlines` |
| `count(apitubeParams)` | Exact match count via `/v1/news/count` |
| `translateParams(params)` | Returns the APITube parameters without sending a request |
| `rebracketOrChains(q)` | The precedence rewrite on its own — useful for auditing existing queries |

Parameter names are GNews's (`q`, `lang`, `country`, `max`, `in`, `nullable`, `sortby`, `from`, `to`, `page`), so existing objects can be splatted straight in.

## Warnings

```
[gnews-shim] GNews binds OR tighter than AND; APITube does the opposite. Re-bracketed "..." as "..."
[gnews-shim] GNews searched title and description by default; APITube's title filter searches headlines only...
[gnews-shim] lang="ru" is not supported by APITube — dropped.
[gnews-shim] max=500 exceeds the APITube maximum of 250 — clamped.
[gnews-shim] sortby=relevance combined with a search term currently fails on the APITube API (500 ER0183)...
```

Each marks a place where results will differ. Read them once, then silence with `onWarning: () => {}`.

## Escaping the shim

Every article carries the untouched APITube object under `apitube`:

```js
const article = response.articles[0];

article.apitube.author.name;                   // GNews returns no author at all
article.apitube.sentiment.overall.polarity;
article.apitube.entities;                      // named entities with Wikidata links
article.apitube.source.rankings.opr;           // publisher authority, 0-10
article.apitube.source.bias;                   // 'left' | 'center' | 'right'
article.apitube.categories;                    // IPTC classification with scores
article.apitube.body_html;
```

Paging state lives on `response.apitube`:

```js
response.apitube.hasNextPage;
response.apitube.nextPageUrl;  // ready-to-fetch URL — no 1,000-article wall
response.apitube.requestId;
```

## Errors

```js
import { GNewsShim, GNewsShimError } from './gnews-shim.js';

try {
    await client.search({ q: 'test', lang: 'ru' });
} catch (error) {
    if (error instanceof GNewsShimError) {
        console.error(error.code, error.status, error.requestId, error.message);
    }
}
```

A failed `totalArticles` lookup never throws — it warns and falls back to the article count.

## Run the example and tests

```bash
APITUBE_API_KEY=your_key node example.js
node --test
```

The tests make no network calls.
