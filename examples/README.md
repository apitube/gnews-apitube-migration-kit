# Before / after examples

Six worked conversions covering the GNews.io call patterns that appear in real codebases. Every APITube request here was executed against the live API before being written down.

| # | Example | GNews.io pattern |
|---|---------|------------------|
| 1 | [Basic search](01-basic-search.md) | `/api/v4/search` with `q`, `lang`, `country` |
| 2 | [Query operators](02-query-operators.md) | **The precedence trap** — read this one |
| 3 | [Top headlines](03-top-headlines.md) | `/api/v4/top-headlines` with `category` |
| 4 | [Paging and article limits](04-paging.md) | `max` + `page` + the 1,000-article wall |
| 5 | [Sorting](05-sorting.md) | `sortby=publishedAt\|relevance`, Google News ranking |
| 6 | [Full content](06-full-content.md) | `content` truncation and `truncate` |

Replace `YOUR_API_KEY` throughout. Get one at [apitube.io](https://apitube.io).
