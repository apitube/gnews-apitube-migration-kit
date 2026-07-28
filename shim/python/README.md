# GNews.io v4 shim — Python

Accepts GNews.io v4 parameters, calls the APITube News API, returns a GNews-shaped dict. One dependency (`requests`), Python 3.8+.

## Install

```bash
pip install requests
```

Then copy `gnews_shim.py` into your project.

## Use

```python
import os
from gnews_shim import GNewsShim

client = GNewsShim(api_key=os.environ["APITUBE_API_KEY"])

response = client.search(q="bitcoin", lang="en", country="us", max=10, sortby="publishedAt")

for article in response["articles"]:
    print(article["title"], article["url"], article["source"]["name"], article["publishedAt"])
```

`response["articles"]` carries the fields your existing code reads: `id`, `title`, `description`, `content`, `url`, `image`, `publishedAt`, `lang`, `source{id,name,url,country}`.

`from` is a Python keyword, so pass date filters through a dict:

```python
response = client.search(q="bitcoin", **{"from": "2026-07-18T21:32:58.500Z"})
```

## The main reason to use the shim

GNews gives `OR` **higher** precedence than `AND`. APITube does the opposite. The shim re-brackets automatically:

```python
client.translate_params({"q": "Apple AND iPhone OR Microsoft"})
# {'query': 'title:Apple AND (title:iPhone OR title:Microsoft)', ...}

client.translate_params({"q": "Tesla OR Rivian AND recall"})
# {'query': '(title:Tesla OR title:Rivian) AND title:recall', ...}
```

Details: [query-syntax.md](../../reference/query-syntax.md).

## Options

```python
GNewsShim(
    api_key="your_key",             # required
    base_url="https://api.apitube.io",
    on_warning=print,               # called for every lossy conversion
    include_total_articles=True,    # populate totalArticles via /v1/news/count
    session=None,                   # reuse an existing requests.Session
    timeout=30,
)
```

## Methods

| Method | GNews.io equivalent |
|--------|---------------------|
| `search(**params)` | `GET /api/v4/search` |
| `top_headlines(**params)` | `GET /api/v4/top-headlines` |
| `count(apitube_params)` | Exact match count via `/v1/news/count` |
| `translate_params(params)` | Returns the APITube parameters without sending a request |
| `rebracket_or_chains(q)` | The precedence rewrite on its own — useful for auditing existing queries |

## Warnings

By default warnings go through `warnings.warn`. Route them to your logger:

```python
import logging

client = GNewsShim(api_key=key, on_warning=logging.getLogger("migration").warning)
```

## Escaping the shim

```python
article = response["articles"][0]

article["apitube"]["author"]["name"]              # GNews returns no author at all
article["apitube"]["sentiment"]["overall"]["polarity"]
article["apitube"]["entities"]
article["apitube"]["source"]["rankings"]["opr"]
article["apitube"]["source"]["bias"]
article["apitube"]["categories"]
article["apitube"]["body_html"]
```

Paging state: `response["apitube"]["hasNextPage"]`, `["nextPageUrl"]`, `["requestId"]`.

## Errors

```python
from gnews_shim import GNewsShim, GNewsShimError

try:
    client.search(q="test", lang="ru")
except GNewsShimError as error:
    print(error.code, error.status, error.request_id, error)
```

A failed `totalArticles` lookup never raises — heavy filter combinations can time out or return 502, so the shim warns and falls back to the article count.

## Run the example and tests

```bash
APITUBE_API_KEY=your_key python example.py
python -m unittest
```

The tests make no network calls.
