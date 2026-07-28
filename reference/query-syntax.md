# Query syntax: the precedence trap

This is the most dangerous part of the migration, so it gets its own page. Everything else fails loudly; this fails silently.

## The problem in one line

GNews.io gives `OR` **higher** precedence than `AND`. APITube — like Lucene, Solr, Elasticsearch, and every other query engine you have used — gives `AND` higher precedence than `OR`.

```
Query string:  Apple AND iPhone OR Microsoft

GNews reads:   Apple AND (iPhone OR Microsoft)
APITube reads: (Apple AND iPhone) OR Microsoft
```

Both requests succeed. Both return articles. The result sets are different, and nothing tells you.

GNews documents this themselves:

> "It is important to note that this operator has a higher precedence than the AND operator… Because of the precedence of the OR operator, in practice the query will return articles matching Apple AND iPhone or Apple AND Microsoft."

## Which queries are affected

Only queries that mix `AND` and `OR` **without brackets**. If every `OR` group is already parenthesized, the query is safe.

| GNews query | Affected? | Why |
|-------------|-----------|-----|
| `Apple Microsoft` | No | AND only (space = AND) |
| `Apple OR Microsoft` | No | OR only |
| `(Apple AND iPhone) OR Microsoft` | No | Already bracketed |
| `Intel AND (i7 OR i9)` | No | Already bracketed |
| `Apple AND iPhone OR Microsoft` | **Yes** | Mixed, unbracketed |
| `Tesla OR Rivian AND recall` | **Yes** | Mixed, unbracketed |
| `a AND b OR c AND d` | **Yes** | Mixed, unbracketed |

## The rewrite rule

Wrap every `OR` chain in brackets, then translate:

```
GNews:    Apple AND iPhone OR Microsoft
Meaning:  Apple AND (iPhone OR Microsoft)
APITube:  query=title:Apple AND (title:iPhone OR title:Microsoft)
```

```
GNews:    Tesla OR Rivian AND recall
Meaning:  (Tesla OR Rivian) AND recall
APITube:  query=(title:Tesla OR title:Rivian) AND title:recall
```

```
GNews:    a AND b OR c AND d
Meaning:  a AND (b OR c) AND d
APITube:  query=title:a AND (title:b OR title:c) AND title:d
```

Read the GNews query right to left, bind each `OR` to its immediate neighbours first, and put brackets there.

Both shims in this repository do this automatically — `translateParams` re-brackets before emitting `query=`.

## Operator-by-operator mapping

| GNews | APITube | Notes |
|-------|---------|-------|
| `space` (implicit AND) | `AND` or space | Same meaning in both |
| `AND` | `AND` | Same |
| `OR` | `OR` | **Different precedence** — see above |
| `NOT keyword` | `NOT title:keyword` | Same meaning |
| `"exact phrase"` | `title:"exact phrase"` | Same meaning |
| `(brackets)` | `(brackets)` | Same |

APITube's precedence is `NOT` > `AND` > `OR`.

## Phrase search

Both APIs use quotes for exact phrases, and both require quotes around special characters.

```
GNews:    "Apple iPhone 13"
APITube:  title="Apple iPhone 13"        (flat filter)
          query=title:"Apple iPhone 13"  (boolean language)
```

GNews rejects unquoted special characters (`Hello!`, `Left - Right`, `Question?`) with a syntax error. APITube's `title` filter accepts them but treats them as plain tokens; in the `query` language, quote anything containing a colon, space, or parenthesis.

## Worked conversions

GNews's own documentation lists these as valid queries. Here is each one on APITube:

| GNews | APITube |
|-------|---------|
| `Microsoft Windows 10` | `query=title:Microsoft AND title:Windows AND title:10` |
| `Apple OR Microsoft` | `query=title:(Apple OR Microsoft)` |
| `Apple AND NOT iPhone` | `query=title:Apple AND NOT title:iPhone` |
| `(Windows 7) AND (Windows 10)` | `query=(title:Windows AND title:7) AND (title:Windows AND title:10)` |
| `"Apple iPhone 13" AND NOT "Apple iPhone 14"` | `query=title:"Apple iPhone 13" AND NOT title:"Apple iPhone 14"` |
| `Intel AND (i7 OR i9)` | `query=title:Intel AND (title:i7 OR title:i9)` |
| `(Intel AND (i7 OR "i9-14900K")) AND NOT AMD AND NOT "i7-14700K"` | `query=(title:Intel AND (title:i7 OR title:"i9-14900K")) AND NOT title:AMD AND NOT title:"i7-14700K"` |

None of these mix `AND` and `OR` unbracketed, so none needs re-bracketing — GNews's examples happen to be well-formed. Real-world queries often are not.

## Simple queries do not need the boolean language

If your `q` has no operators, use the flat `title` filter instead — shorter and it gets synonym expansion:

```
GNews:    q=bitcoin
APITube:  title=bitcoin
```

`title` expands each keyword with synonyms and morphological forms (`merger` also matches "mergers", "merged"), which the `query` language does not do for bare terms in the same way. Multiple space-separated words in `title` are AND, matching GNews's default.

## Length limits

| | GNews | APITube |
|---|-------|---------|
| `q` / `title` | 200 characters | 100 characters |
| `query` | — | Longer, with its own cap |

A `q` over 100 characters must go through `query=` rather than `title=`.

## What neither API can do

GNews has no field-scoped operators — every term applies to whatever `in` is set to. APITube's `query` language applies boolean logic across **every** filter field, which is strictly more expressive:

```
query=title:(acquisition OR merger) AND source.country.code:(us OR gb) AND sentiment.overall.polarity:negative AND source.rank.opr:>=6
```

Nothing in GNews expresses that.
