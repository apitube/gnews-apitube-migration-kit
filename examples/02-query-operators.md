# 2. Query operators — the precedence trap

The most important page in this kit. Everything else in the migration fails loudly; this fails silently.

## The problem

GNews binds `OR` **tighter** than `AND`. APITube — like Lucene, Solr, and Elasticsearch — binds `AND` tighter than `OR`.

```
Apple AND iPhone OR Microsoft

GNews:    Apple AND (iPhone OR Microsoft)
APITube:  (Apple AND iPhone) OR Microsoft
```

Both requests succeed. Both return articles. The sets are different.

GNews documents this: "It is important to note that this operator has a higher precedence than the AND operator."

## The fix

Bracket every `OR` chain before translating.

```
GNews:    Apple AND iPhone OR Microsoft
APITube:  query=title:Apple AND (title:iPhone OR title:Microsoft)
```

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  --get "https://api.apitube.io/v1/news/everything" \
  --data-urlencode "query=title:Apple AND (title:iPhone OR title:Microsoft)" \
  --data-urlencode "per_page=10"
```

The shims do this automatically:

```js
client.translateParams({ q: 'Apple AND iPhone OR Microsoft' });
// { query: 'title:Apple AND (title:iPhone OR title:Microsoft)' }
```

## Which queries are affected

Only those mixing `AND` and `OR` **without** brackets.

| GNews query | Affected? |
|-------------|-----------|
| `Apple Microsoft` | No — AND only |
| `Apple OR Microsoft` | No — OR only |
| `Intel AND (i7 OR i9)` | No — already bracketed |
| `Apple AND iPhone OR Microsoft` | **Yes** |
| `Tesla OR Rivian AND recall` | **Yes** |

## Every documented GNews example, converted

GNews's own docs list these. None needs re-bracketing — their examples are well-formed — but here is each one on APITube:

| GNews | APITube |
|-------|---------|
| `Microsoft Windows 10` | `query=title:Microsoft title:Windows title:10` |
| `Apple OR Microsoft` | `query=(title:Apple OR title:Microsoft)` |
| `Apple AND NOT iPhone` | `query=title:Apple AND NOT title:iPhone` |
| `"Apple iPhone 13" AND NOT "Apple iPhone 14"` | `query=title:"Apple iPhone 13" AND NOT title:"Apple iPhone 14"` |
| `Intel AND (i7 OR i9)` | `query=title:Intel AND (title:i7 OR title:i9)` |
| `(Intel AND (i7 OR "i9-14900K")) AND NOT AMD AND NOT "i7-14700K"` | `query=(title:Intel AND (title:i7 OR title:"i9-14900K")) AND NOT title:AMD AND NOT title:"i7-14700K"` |

All verified against the live API.

## Operator mapping

| GNews | APITube |
|-------|---------|
| `space` | `AND` or space |
| `AND` | `AND` |
| `OR` | `OR` (**different precedence**) |
| `NOT keyword` | `NOT title:keyword` |
| `"exact phrase"` | `title:"exact phrase"` |

APITube's precedence: `NOT` > `AND` > `OR`.

## Simple queries do not need `query=`

If there are no operators, use `title` — shorter, and it expands synonyms and morphological forms:

```
GNews:    q=bitcoin
APITube:  title=bitcoin
```

## Beyond what GNews could express

GNews's operators applied only to keywords. APITube's `query` spans every filter field:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  --get "https://api.apitube.io/v1/news/everything" \
  --data-urlencode "query=title:(acquisition OR merger) AND source.country.code:(us OR gb) AND sentiment.overall.polarity:negative AND source.rank.opr:>=6" \
  --data-urlencode "per_page=20"
```

Numeric and date comparators too:

```
read_time:>=8
published_at:[2026-01-01 TO 2026-06-22]
source.rank.opr:>=6
```

## Watch out

**Single-character terms fail.** GNews accepted `q=a AND b`; APITube requires 2–100 characters per term and returns `400 ER0705`. The shims warn about this.

**URL-encode the query.** The `--data-urlencode` form above handles it.

**Audit existing queries before migrating.** Both shims expose the rewrite on its own, so you can check a whole file of queries without sending a request:

```js
import { GNewsShim } from './shim/node/gnews-shim.js';

const shim = new GNewsShim({ apiKey: 'unused', onWarning: () => {} });

for (const q of yourExistingQueries) {
    const rewritten = shim.rebracketOrChains(q);

    if (rewritten !== q) {
        console.log(`NEEDS BRACKETS: ${q}\n            ->  ${rewritten}`);
    }
}
```
