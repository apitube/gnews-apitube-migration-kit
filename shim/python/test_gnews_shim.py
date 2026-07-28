"""Parameter-translation tests. No network calls.

Run with: python -m unittest
"""

import unittest

from gnews_shim import GNewsShim


def silent():
    return GNewsShim(api_key="test", on_warning=lambda message: None)


def recording():
    warnings = []
    shim = GNewsShim(api_key="test", on_warning=warnings.append)

    return shim, warnings


class PrecedenceRewriteTest(unittest.TestCase):
    """The reason this shim exists: GNews binds OR tighter than AND, APITube does not."""

    def test_rebrackets_or_chains(self):
        shim = silent()

        self.assertEqual(shim.rebracket_or_chains("Apple AND iPhone OR Microsoft"), "Apple AND (iPhone OR Microsoft)")
        self.assertEqual(shim.rebracket_or_chains("Tesla OR Rivian AND recall"), "(Tesla OR Rivian) AND recall")
        self.assertEqual(shim.rebracket_or_chains("a AND b OR c AND d"), "a AND (b OR c) AND d")

    def test_leaves_bracketed_queries_alone(self):
        shim = silent()

        self.assertEqual(shim.rebracket_or_chains("Intel AND (i7 OR i9)"), "Intel AND (i7 OR i9)")
        self.assertEqual(shim.rebracket_or_chains("Apple AND NOT iPhone"), "Apple AND NOT iPhone")
        self.assertEqual(shim.rebracket_or_chains("Microsoft Windows 10"), "Microsoft Windows 10")

    def test_chain_of_three_ors(self):
        self.assertEqual(silent().rebracket_or_chains("a OR b OR c AND d"), "(a OR b OR c) AND d")

    def test_quoted_phrases_survive(self):
        shim = silent()

        self.assertEqual(
            shim.rebracket_or_chains('"Apple iPhone 13" AND NOT "Apple iPhone 14"'),
            '"Apple iPhone 13" AND NOT "Apple iPhone 14"',
        )
        self.assertEqual(
            shim.to_query_language('"Apple iPhone 13" AND NOT "Apple iPhone 14"'),
            'title:"Apple iPhone 13" AND NOT title:"Apple iPhone 14"',
        )

    def test_not_stays_attached_to_its_operand(self):
        self.assertEqual(
            silent().rebracket_or_chains("Apple OR NOT iPhone AND Samsung"),
            "(Apple OR NOT iPhone) AND Samsung",
        )

    def test_warns_when_rebracketing(self):
        shim, warnings = recording()

        shim.translate_params({"q": "Apple AND iPhone OR Microsoft"})
        self.assertTrue(any("binds OR tighter than AND" in message for message in warnings))

    def test_all_documented_gnews_examples(self):
        shim = silent()

        def convert(q):
            return shim.to_query_language(shim.rebracket_or_chains(q))

        self.assertEqual(convert("Apple OR Microsoft"), "(title:Apple OR title:Microsoft)")
        self.assertEqual(convert("Apple AND NOT iPhone"), "title:Apple AND NOT title:iPhone")
        self.assertEqual(convert("Intel AND (i7 OR i9)"), "title:Intel AND (title:i7 OR title:i9)")
        self.assertEqual(
            convert('(Intel AND (i7 OR "i9-14900K")) AND NOT AMD AND NOT "i7-14700K"'),
            '(title:Intel AND (title:i7 OR title:"i9-14900K")) AND NOT title:AMD AND NOT title:"i7-14700K"',
        )

    def test_single_character_terms_warn(self):
        shim, warnings = recording()

        shim.to_query_language("a AND b")
        self.assertTrue(any("ER0705" in message for message in warnings))


class TranslateParamsTest(unittest.TestCase):
    def test_canonical_search_call(self):
        params = silent().translate_params(
            {"q": "bitcoin", "lang": "en", "country": "us", "max": 10, "sortby": "publishedAt"}
        )

        self.assertEqual(
            params,
            {
                "title": "bitcoin",
                "language.code": "en",
                "source.country.code": "us",
                "per_page": 10,
                "sort.by": "published_at",
                "sort.order": "desc",
                "has_image": 1,
            },
        )

    def test_plain_query_uses_title(self):
        params = silent().translate_params({"q": "bitcoin etf"})

        self.assertEqual(params["title"], "bitcoin etf")
        self.assertNotIn("query", params)

    def test_q_is_truncated_at_100(self):
        shim, warnings = recording()
        params = shim.translate_params({"q": "x" * 150})

        self.assertEqual(len(params["title"]), 100)
        self.assertTrue(any("GNews allowed 200" in message for message in warnings))

    def test_in_title_is_lossless(self):
        shim, warnings = recording()

        shim.translate_params({"q": "bitcoin", "in": "title"})
        self.assertFalse(any("expect fewer results" in message for message in warnings))

    def test_in_content_warns(self):
        shim, warnings = recording()

        shim.translate_params({"q": "bitcoin", "in": "title,content"})
        self.assertTrue(any("in=content" in message for message in warnings))

    def test_max_is_clamped(self):
        shim, warnings = recording()

        self.assertEqual(shim.translate_params({"max": 500})["per_page"], 250)
        self.assertTrue(any("clamped" in message for message in warnings))

    def test_page_passes_through(self):
        self.assertEqual(silent().translate_params({"page": 4})["page"], 4)

    def test_iso_dates_pass_through(self):
        params = silent().translate_params(
            {"from": "2026-07-18T21:32:58.500Z", "to": "2026-07-26T00:00:00.000Z"}
        )

        self.assertEqual(params["published_at.start"], "2026-07-18T21:32:58.500Z")
        self.assertEqual(params["published_at.end"], "2026-07-26T00:00:00.000Z")

    def test_both_sort_values(self):
        shim = silent()

        self.assertEqual(shim.translate_params({"sortby": "publishedAt"})["sort.by"], "published_at")
        self.assertEqual(shim.translate_params({"sortby": "relevance", "lang": "en"})["sort.by"], "relevance")

    def test_relevance_falls_back_with_a_search_term(self):
        shim, warnings = recording()
        params = shim.translate_params({"q": "tesla", "sortby": "relevance"})

        self.assertEqual(params["sort.by"], "published_at")
        self.assertTrue(any("500 ER0183" in message for message in warnings))


class LanguageCountryCategoryTest(unittest.TestCase):
    def test_five_unsupported_languages(self):
        shim, warnings = recording()

        for code in ("ml", "mr", "pa", "ru", "uk"):
            self.assertEqual(shim.translate_language(code), {})

        self.assertEqual(len(warnings), 5)

    def test_two_unsupported_countries(self):
        shim, warnings = recording()

        self.assertEqual(shim.translate_country("ru"), {})
        self.assertEqual(shim.translate_country("ua"), {})
        self.assertEqual(len(warnings), 2)

    def test_six_subject_categories(self):
        shim = silent()

        self.assertEqual(shim.translate_category("business"), {"category.id": "medtop:04000000"})
        self.assertEqual(shim.translate_category("entertainment"), {"category.id": "medtop:01000000"})
        self.assertEqual(shim.translate_category("health"), {"category.id": "medtop:07000000"})
        self.assertEqual(shim.translate_category("science"), {"category.id": "medtop:20000717"})
        self.assertEqual(shim.translate_category("sports"), {"category.id": "medtop:15000000"})
        self.assertEqual(shim.translate_category("technology"), {"category.id": "medtop:20000756"})

    def test_world_maps_to_country_exclusion(self):
        shim, warnings = recording()

        self.assertEqual(shim.translate_category("world", "de"), {"ignore.source.country.code": "de"})
        self.assertEqual(shim.translate_category("world"), {})
        self.assertTrue(any("no direct equivalent" in message for message in warnings))

    def test_general_and_nation_are_dropped(self):
        shim, warnings = recording()

        self.assertEqual(shim.translate_category("general"), {})
        self.assertEqual(shim.translate_category("nation", "de"), {})
        self.assertEqual(len(warnings), 2)

    def test_nullable_inverts_to_has_image(self):
        shim = silent()

        self.assertEqual(shim.translate_nullable(None), {"has_image": 1})
        self.assertEqual(shim.translate_nullable("description"), {"has_image": 1})
        self.assertEqual(shim.translate_nullable("image"), {})
        self.assertEqual(shim.translate_nullable("description,content,image"), {})

    def test_multi_value_cap(self):
        shim, warnings = recording()

        self.assertEqual(shim.translate_language("en,de,fr,it")["language.code"], "en,de,fr")
        self.assertTrue(any("Dropped: it" in message for message in warnings))


class ResponseShapeTest(unittest.TestCase):
    def test_gnews_response_shape(self):
        response = silent()._to_gnews_response(
            {
                "status": "ok",
                "page": 1,
                "has_next_pages": True,
                "next_page": "https://api.apitube.io/v1/news/everything?page=2",
                "request_id": "req-1",
                "results": [
                    {
                        "id": 3067022102,
                        "title": "M5 chip leak reveals big gains",
                        "description": "Summary",
                        "body": "Full article text with no truncation.",
                        "href": "https://9to5mac.com/a",
                        "image": "https://9to5mac.com/i.jpg",
                        "published_at": "2026-07-20T14:30:00.000Z",
                        "language": "en",
                        "source": {
                            "id": 4232,
                            "domain": "9to5mac.com",
                            "home_page_url": "https://9to5mac.com",
                            "location": {"country_code": "us"},
                        },
                    }
                ],
            },
            54904,
        )

        self.assertEqual(response["totalArticles"], 54904)

        article = response["articles"][0]

        self.assertEqual(article["id"], "3067022102")
        self.assertEqual(article["content"], "Full article text with no truncation.")
        self.assertEqual(article["url"], "https://9to5mac.com/a")
        self.assertEqual(article["lang"], "en")
        self.assertEqual(
            article["source"],
            {"id": "4232", "name": "9to5mac.com", "url": "https://9to5mac.com", "country": "us"},
        )
        self.assertEqual(article["apitube"]["id"], 3067022102)
        self.assertEqual(response["apitube"]["nextPageUrl"], "https://api.apitube.io/v1/news/everything?page=2")

    def test_total_falls_back_to_article_count(self):
        response = silent()._to_gnews_response({"results": [{"id": 1, "title": "x", "source": {}}]})

        self.assertEqual(response["totalArticles"], 1)


if __name__ == "__main__":
    unittest.main()
