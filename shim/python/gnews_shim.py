"""GNews.io v4 compatibility shim for the APITube News API.

Accepts GNews query parameters, calls APITube, and returns a response shaped like GNews's
so existing call sites keep working.

The important part: GNews gives OR HIGHER precedence than AND, the reverse of APITube.
``translate_query`` re-brackets before emitting, so a query that mixed the two operators
keeps the meaning it had on GNews. See reference/query-syntax.md.

Requires: requests (``pip install requests``)
"""

from __future__ import annotations

import re
import warnings
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import urljoin

import requests

APITUBE_BASE_URL = "https://api.apitube.io"

# GNews category -> APITube filter. See reference/category-mapping.md.
CATEGORY_MAP: Dict[str, Dict[str, str]] = {
    "business": {"category.id": "medtop:04000000"},
    "entertainment": {"category.id": "medtop:01000000"},
    "health": {"category.id": "medtop:07000000"},
    "science": {"category.id": "medtop:20000717"},
    "sports": {"category.id": "medtop:15000000"},
    "technology": {"category.id": "medtop:20000756"},
    "general": {},
    # 'world' and 'nation' are reader-relative, not subjects — handled in translate_category.
    "world": {},
    "nation": {},
}

UNSUPPORTED_LANGUAGES = {"ml", "mr", "pa", "ru", "uk"}
UNSUPPORTED_COUNTRIES = {"ru", "ua"}

MAX_MULTI_VALUES = 3
MAX_TITLE_LENGTH = 100


class GNewsShimError(Exception):
    """Raised when APITube rejects a request."""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status: Optional[int] = None,
        request_id: Optional[str] = None,
        url: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.request_id = request_id
        self.url = url


def _default_warning(message: str) -> None:
    warnings.warn(f"[gnews-shim] {message}", stacklevel=2)


class GNewsShim:
    """Drop-in replacement for GNews.io v4."""

    def __init__(
        self,
        api_key: str,
        base_url: str = APITUBE_BASE_URL,
        on_warning: Callable[[str], None] = _default_warning,
        include_total_articles: bool = True,
        session: Optional[requests.Session] = None,
        timeout: int = 30,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required")

        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.on_warning = on_warning
        self.include_total_articles = include_total_articles
        self.session = session or requests.Session()
        self.timeout = timeout

    # --- public API -----------------------------------------------------------

    def search(self, **gnews_params: Any) -> Dict[str, Any]:
        """Equivalent of ``GET /api/v4/search``."""
        if not gnews_params.get("q"):
            self._warn("GNews required q on /search. APITube does not, so the request will run unfiltered.")

        params = self.translate_params(gnews_params, endpoint="search")
        payload = self._request("/v1/news/everything", params)
        total = self.count(params) if self.include_total_articles else None

        return self._to_gnews_response(payload, total)

    def top_headlines(self, **gnews_params: Any) -> Dict[str, Any]:
        """Equivalent of ``GET /api/v4/top-headlines``."""
        params = self.translate_params(gnews_params, endpoint="top_headlines")

        # GNews ranks these by Google News. APITube has no such signal, so the order must
        # be explicit — /v1/news/top-headlines is unordered otherwise.
        if "sort.by" not in params:
            params["sort.by"] = "published_at"
            params["sort.order"] = "desc"

        has_filters = any(params.get(key) for key in ("category.id", "title", "query"))
        path = "/v1/news/everything" if has_filters else "/v1/news/top-headlines"
        payload = self._request(path, params)
        total = self.count(params) if self.include_total_articles else None

        return self._to_gnews_response(payload, total)

    def count(self, apitube_params: Dict[str, Any]) -> Optional[int]:
        """Exact match count for a translated parameter set."""
        skip = {"per_page", "page", "sort.by", "sort.order", "hl", "hl.fl"}
        count_params = {key: value for key, value in apitube_params.items() if key not in skip}

        try:
            payload = self._request("/v1/news/count", count_params)
            value = payload.get("count")

            return value if isinstance(value, int) else None
        except (GNewsShimError, requests.RequestException) as error:
            # totalArticles is a convenience, never a reason to fail the whole call.
            self._warn(f"totalArticles unavailable: {error}")

            return None

    # --- parameter translation ------------------------------------------------

    def translate_params(self, gnews: Dict[str, Any], endpoint: str = "search") -> Dict[str, Any]:
        """GNews parameters -> APITube parameters.

        Exposed so you can inspect what the shim would send without making a request.
        """
        params: Dict[str, Any] = {}

        if gnews.get("q"):
            params.update(self.translate_query(gnews["q"], gnews.get("in")))

        if gnews.get("in") and not gnews.get("q"):
            self._warn("in= without q has no effect — dropped.")

        if gnews.get("lang"):
            params.update(self.translate_language(gnews["lang"]))

        if gnews.get("country"):
            params.update(self.translate_country(gnews["country"], endpoint))

        if gnews.get("category"):
            params.update(self.translate_category(gnews["category"], gnews.get("country")))

        per_page = self.translate_max(gnews.get("max"))

        if per_page is not None:
            params["per_page"] = per_page

        if gnews.get("page") is not None:
            try:
                page = int(gnews["page"])
                if page >= 1:
                    params["page"] = page
                else:
                    raise ValueError
            except (TypeError, ValueError):
                self._warn(f'page="{gnews["page"]}" is not a positive number — ignored.')

        if gnews.get("from"):
            params["published_at.start"] = gnews["from"]

        if gnews.get("to"):
            params["published_at.end"] = gnews["to"]

        params.update(self.translate_sort(gnews.get("sortby") or gnews.get("sortBy"), params))
        params.update(self.translate_nullable(gnews.get("nullable")))

        if gnews.get("truncate"):
            self._warn("truncate has no equivalent — APITube never truncates body mid-article. Dropped.")

        return params

    def translate_query(self, q: str, search_in: Optional[str] = None) -> Dict[str, Any]:
        """GNews ``q`` -> ``title`` (simple) or ``query`` (with operators)."""
        params: Dict[str, Any] = {}
        raw = str(q).strip()

        if search_in:
            fields = [field.strip().lower() for field in str(search_in).split(",")]
            unsupported = [field for field in fields if field != "title"]

            if unsupported:
                self._warn(
                    f'in={",".join(unsupported)} has no APITube equivalent — only title search exists. '
                    "Results will be narrower."
                )
        else:
            self._warn(
                "GNews searched title and description by default; APITube's title filter searches "
                "headlines only, so expect fewer results. See reference/limitations.md."
            )

        if re.search(r'\b(AND|OR|NOT)\b|[()"]', raw):
            rebracketed = self.rebracket_or_chains(raw)

            if rebracketed != raw:
                self._warn(
                    f"GNews binds OR tighter than AND; APITube does the opposite. Re-bracketed "
                    f'"{raw}" as "{rebracketed}" to preserve the original meaning.'
                )

            params["query"] = self.to_query_language(rebracketed)

            return params

        title = raw

        if len(title) > MAX_TITLE_LENGTH:
            self._warn(
                f"q is {len(title)} characters; APITube caps title at {MAX_TITLE_LENGTH} (GNews allowed 200). "
                "Truncated — move long queries to the query language instead."
            )
            title = title[:MAX_TITLE_LENGTH].strip()

        params["title"] = title

        return params

    def rebracket_or_chains(self, expression: str) -> str:
        """Wrap every OR chain in brackets so APITube's AND-first precedence reproduces
        GNews's OR-first precedence.

        Apple AND iPhone OR Microsoft  ->  Apple AND (iPhone OR Microsoft)
        Tesla OR Rivian AND recall     ->  (Tesla OR Rivian) AND recall
        a AND b OR c AND d             ->  a AND (b OR c) AND d
        """
        tokens = self.tokenize(expression)

        if not any(token["type"] == "or" for token in tokens):
            return expression

        output: List[str] = []
        index = 0

        while index < len(tokens):
            token = tokens[index]
            following = tokens[index + 1] if index + 1 < len(tokens) else None

            # An operand followed by OR starts a chain.
            if token["type"] == "operand" and following and following["type"] == "or":
                chain = [token["value"]]
                index += 1

                while (
                    index < len(tokens)
                    and tokens[index]["type"] == "or"
                    and index + 1 < len(tokens)
                    and tokens[index + 1]["type"] == "operand"
                ):
                    chain.append(tokens[index + 1]["value"])
                    index += 2

                output.append(f'({" OR ".join(chain)})')
                continue

            output.append(token["value"])
            index += 1

        return " ".join(output)

    def tokenize(self, expression: str) -> List[Dict[str, str]]:
        """Split an expression into operands and operators. An operand is a bare term, a
        quoted phrase, or a balanced bracket group (kept intact — already unambiguous).
        """
        tokens: List[Dict[str, str]] = []
        source = str(expression)
        index = 0

        while index < len(source):
            char = source[index]

            if char.isspace():
                index += 1
                continue

            if char == "(":
                depth = 0
                end = index

                while end < len(source):
                    if source[end] == "(":
                        depth += 1
                    elif source[end] == ")":
                        depth -= 1
                        if depth == 0:
                            break
                    end += 1

                tokens.append({"type": "operand", "value": source[index : end + 1]})
                index = end + 1
                continue

            if char == '"':
                end = source.find('"', index + 1)
                stop = len(source) if end == -1 else end + 1

                tokens.append({"type": "operand", "value": source[index:stop]})
                index = stop
                continue

            match = re.match(r"\S+", source[index:])
            word = match.group(0) if match else source[index:]

            if re.fullmatch(r"OR", word, re.IGNORECASE):
                tokens.append({"type": "or", "value": "OR"})
            elif re.fullmatch(r"AND", word, re.IGNORECASE):
                tokens.append({"type": "and", "value": "AND"})
            elif re.fullmatch(r"NOT", word, re.IGNORECASE):
                # NOT belongs to the operand that follows it; keep them together.
                rest = re.match(r"\s*(\S+)", source[index + len(word) :])

                if rest:
                    tokens.append({"type": "operand", "value": f"NOT {rest.group(1)}"})
                    index += len(word) + len(rest.group(0))
                    continue

                tokens.append({"type": "operand", "value": word})
            else:
                tokens.append({"type": "operand", "value": word})

            index += len(word)

        return tokens

    def to_query_language(self, expression: str) -> str:
        """Prefix every bare term with the default field so APITube parses it as a title match."""

        def replace(match: re.Match) -> str:
            token = match.group(0)

            if re.fullmatch(r"(AND|OR|NOT)", token, re.IGNORECASE):
                return token.upper()

            if re.fullmatch(r"[()]+", token) or ":" in token:
                return token

            leading = re.match(r"^\(+", token)
            trailing = re.search(r"\)+$", token)
            lead = leading.group(0) if leading else ""
            trail = trailing.group(0) if trailing else ""
            bare = token[len(lead) : len(token) - len(trail)]

            if not bare:
                return token

            # APITube rejects single-character terms with 400 ER0705; GNews accepted them.
            if len(bare.strip('"')) < 2:
                self._warn(
                    f'Term "{bare}" is a single character. APITube requires 2-100 characters per term '
                    "and will return 400 ER0705."
                )

            return f"{lead}title:{bare}{trail}"

        return re.sub(r'"[^"]*"|\S+', replace, expression)

    def translate_language(self, lang: str) -> Dict[str, str]:
        codes = [code.strip().lower() for code in str(lang).split(",") if code.strip()]
        mapped = []

        for code in codes:
            if code in UNSUPPORTED_LANGUAGES:
                self._warn(f'lang="{code}" is not supported by APITube — dropped.')
                continue

            mapped.append(code)

        if not mapped:
            return {}

        return {"language.code": self.cap_multi_value(",".join(mapped), "lang")}

    def translate_country(self, country: str, endpoint: str = "search") -> Dict[str, str]:
        codes = [code.strip().lower() for code in str(country).split(",") if code.strip()]
        mapped = []

        for code in codes:
            if code in UNSUPPORTED_COUNTRIES:
                self._warn(f'country="{code}" is not supported by APITube — dropped.')
                continue

            mapped.append(code)

        if not mapped:
            return {}

        if endpoint == "top_headlines":
            self._warn(
                "GNews's top-headlines country also pulled in articles merely relevant to that country. "
                "APITube's source.country.code is publisher location only — add location.name if you "
                "want subject-country coverage."
            )

        return {"source.country.code": self.cap_multi_value(",".join(mapped), "country")}

    def translate_category(self, category: str, country: Optional[str] = None) -> Dict[str, str]:
        key = str(category).lower().strip()

        if key not in CATEGORY_MAP:
            self._warn(
                f'category="{category}" is not a GNews category — dropped. See reference/category-mapping.md.'
            )

            return {}

        if key == "general":
            self._warn(
                "category=general has no APITube equivalent — the filter was dropped, which widens the feed."
            )

            return {}

        if key == "nation":
            if country:
                self._warn(f"category=nation mapped to source.country.code={str(country).lower()}.")

                return {}

            self._warn(
                "category=nation needs a country to be meaningful — no country given, so the filter was dropped."
            )

            return {}

        if key == "world":
            if country:
                self._warn(
                    f"category=world mapped to ignore.source.country.code={str(country).lower()} "
                    "(everything except your home country)."
                )

                return {"ignore.source.country.code": str(country).lower()}

            self._warn(
                "category=world has no direct equivalent. Consider category.id=medtop:16000000 "
                "(conflict, war and peace) or ignore.source.country.code. Filter dropped."
            )

            return {}

        return dict(CATEGORY_MAP[key])

    def translate_max(self, max_value: Any) -> Optional[int]:
        if max_value is None:
            return None

        try:
            value = int(max_value)
        except (TypeError, ValueError):
            self._warn(f'max="{max_value}" is not a positive number — ignored.')

            return None

        if value < 1:
            self._warn(f'max="{max_value}" is not a positive number — ignored.')

            return None

        if value > 250:
            self._warn(f"max={value} exceeds the APITube maximum of 250 — clamped.")

            return 250

        return value

    def translate_sort(self, sortby: Optional[str], current_params: Dict[str, Any]) -> Dict[str, str]:
        if not sortby:
            return {}

        value = str(sortby).lower()

        if value == "publishedat":
            return {"sort.by": "published_at", "sort.order": "desc"}

        if value == "relevance":
            # Known production issue: title= combined with sort.by=relevance returns 500 ER0183.
            if current_params.get("title"):
                self._warn(
                    "sortby=relevance combined with a search term currently fails on the APITube API "
                    "(500 ER0183). Falling back to sort.by=published_at. See reference/limitations.md."
                )

                return {"sort.by": "published_at", "sort.order": "desc"}

            return {"sort.by": "relevance", "sort.order": "desc"}

        self._warn(f'sortby="{sortby}" is not a GNews value (publishedAt|relevance) — ignored.')

        return {}

    def translate_nullable(self, nullable: Optional[str]) -> Dict[str, int]:
        """GNews excluded articles with null description/content/image by default; ``nullable``
        opted back in. APITube is the other way round — it returns everything unless you
        require a field.
        """
        allowed = {field.strip().lower() for field in str(nullable or "").split(",") if field.strip()}

        # No nullable= means GNews required an image; mirror that with has_image.
        if "image" not in allowed:
            return {"has_image": 1}

        return {}

    def cap_multi_value(self, value: str, parameter_name: str) -> str:
        """APITube caps comma-separated filters at 3 values and ignores the rest silently."""
        items = [item.strip() for item in str(value).split(",") if item.strip()]

        if len(items) <= MAX_MULTI_VALUES:
            return ",".join(items)

        kept = items[:MAX_MULTI_VALUES]
        dropped = items[MAX_MULTI_VALUES:]

        self._warn(
            f"{parameter_name} had {len(items)} values; APITube applies at most {MAX_MULTI_VALUES} and "
            f'ignores the rest silently. Kept: {",".join(kept)}. Dropped: {",".join(dropped)}.'
        )

        return ",".join(kept)

    # --- response translation -------------------------------------------------

    def _to_gnews_response(self, payload: Dict[str, Any], total_articles: Optional[int] = None) -> Dict[str, Any]:
        results = payload.get("results") or []

        if not isinstance(results, list):
            results = []

        response: Dict[str, Any] = {
            "totalArticles": total_articles if total_articles is not None else len(results),
            "articles": [self._to_article(article) for article in results],
        }

        # Not part of GNews's contract — kept so paging code has something to follow.
        response["apitube"] = {
            "page": payload.get("page"),
            "limit": payload.get("limit"),
            "hasNextPage": payload.get("has_next_pages"),
            "nextPage": payload.get("next_page"),
            "nextPageUrl": payload.get("next_page"),
            "requestId": payload.get("request_id"),
        }

        return response

    def _to_article(self, article: Dict[str, Any]) -> Dict[str, Any]:
        source = article.get("source") or {}
        location = source.get("location") or {}

        return {
            "id": str(article["id"]) if article.get("id") is not None else None,
            "title": article.get("title"),
            "description": article.get("description"),
            # GNews truncated this on the Free plan; APITube returns the whole article.
            "content": article.get("body"),
            "url": article.get("href"),
            "image": article.get("image"),
            "publishedAt": article.get("published_at"),
            "lang": article.get("language"),
            "source": {
                "id": str(source["id"]) if source.get("id") is not None else None,
                "name": source.get("domain") or "",
                "url": source.get("home_page_url") or "",
                "country": location.get("country_code"),
            },
            # Everything GNews never returned, kept out of the way of existing code.
            "apitube": article,
        }

    # --- transport ------------------------------------------------------------

    def _request(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        url = urljoin(self.base_url + "/", path.lstrip("/"))
        clean = {key: value for key, value in params.items() if value not in (None, "")}

        response = self.session.get(
            url,
            params=clean,
            headers={"X-API-Key": self.api_key, "Accept": "application/json"},
            timeout=self.timeout,
        )

        # Gateway errors (502/504 on heavy aggregations) come back as HTML, not JSON.
        try:
            payload = response.json()
        except ValueError:
            raise GNewsShimError(
                f"APITube returned a non-JSON response (HTTP {response.status_code}). This usually means "
                "the query was too heavy and the gateway timed out — narrow the filters or drop the "
                "totalArticles lookup.",
                status=response.status_code,
                url=response.url,
            ) from None

        if payload.get("status") in ("not_ok", "error"):
            errors = payload.get("errors") or [{}]
            error = errors[0]

            raise GNewsShimError(
                error.get("message", "APITube request failed"),
                code=error.get("code"),
                status=error.get("status", response.status_code),
                request_id=payload.get("request_id"),
                url=response.url,
            )

        if not response.ok:
            raise GNewsShimError(
                f"APITube returned HTTP {response.status_code}",
                status=response.status_code,
                url=response.url,
            )

        return payload

    def _warn(self, message: str) -> None:
        if callable(self.on_warning):
            self.on_warning(message)
