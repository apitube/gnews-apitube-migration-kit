# GNews.io languages and countries → APITube

Both lists were checked code by code against APITube's reference lists and confirmed on the live API.

## Languages

GNews.io supports 26 codes. APITube supports 60. **Twenty-one map directly; five do not.**

| GNews.io | APITube `language.code` | Language | |
|----------|------------------------|----------|---|
| `ar` | `ar` | Arabic | ✅ |
| `bn` | `bn` | Bengali | ✅ |
| `zh` | `zh` | Chinese | ✅ |
| `nl` | `nl` | Dutch | ✅ |
| `en` | `en` | English | ✅ |
| `fr` | `fr` | French | ✅ |
| `de` | `de` | German | ✅ |
| `el` | `el` | Greek | ✅ |
| `he` | `he` | Hebrew | ✅ |
| `hi` | `hi` | Hindi | ✅ |
| `id` | `id` | Indonesian | ✅ |
| `it` | `it` | Italian | ✅ |
| `ja` | `ja` | Japanese | ✅ |
| `no` | `no` | Norwegian | ✅ |
| `pt` | `pt` | Portuguese | ✅ |
| `ro` | `ro` | Romanian | ✅ |
| `es` | `es` | Spanish | ✅ |
| `sv` | `sv` | Swedish | ✅ |
| `ta` | `ta` | Tamil | ✅ |
| `te` | `te` | Telugu | ✅ |
| `tr` | `tr` | Turkish | ✅ |
| `ml` | — | Malayalam | ❌ |
| `mr` | — | Marathi | ❌ |
| `pa` | — | Punjabi | ❌ |
| `ru` | — | Russian | ❌ |
| `uk` | — | Ukrainian | ❌ |

All five unsupported codes return `400 ER0237` — a loud failure, not a silent empty result.

**Indian-language coverage is the notable gap.** GNews carries Malayalam, Marathi, and Punjabi; APITube carries Bengali, Hindi, Tamil, Telugu, Gujarati, Kannada, and Urdu, but not those three. If your feed targets Kerala, Maharashtra, or Punjab specifically, check coverage before committing.

For Russian and Ukrainian there is no substitute. The closest workaround is tracking the subject in another language:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?location.name=Ukraine&language.code=en&per_page=20"
```

### Multiple languages

GNews took one code per request. APITube takes up to 3, OR logic:

```bash
language.code=en,de,fr
```

A fourth value is **silently ignored**. Exclusions also work: `ignore.language.code=zh`.

### The 39 languages APITube adds

`af`, `sq`, `hy`, `az`, `eu`, `by`, `bs`, `bg`, `ca`, `hr`, `cs`, `da`, `et`, `fi`, `ka`, `gu`, `hu`, `is`, `ga`, `kn`, `ko`, `la`, `lv`, `lt`, `mk`, `ms`, `mt`, `fa`, `pl`, `sr`, `sk`, `sl`, `sw`, `th`, `ur`, `vi`, `cy`, `yi`, plus `un` for unknown.

Korean, Polish, Vietnamese, Thai, Persian, Czech, Danish, Finnish, and Hungarian were all missing from GNews.

Full list: [languages](https://docs.apitube.io/platform/news-api/list-of-languages).

---

## Countries

GNews.io supports 37 codes. APITube supports 178. **Thirty-five map directly.**

| GNews.io | APITube | Country | |
|----------|---------|---------|---|
| `ar` | `ar` | Argentina | ✅ |
| `au` | `au` | Australia | ✅ |
| `bd` | `bd` | Bangladesh | ✅ |
| `br` | `br` | Brazil | ✅ |
| `ca` | `ca` | Canada | ✅ |
| `cn` | `cn` | China | ✅ |
| `co` | `co` | Colombia | ✅ |
| `eg` | `eg` | Egypt | ✅ |
| `fr` | `fr` | France | ✅ |
| `de` | `de` | Germany | ✅ |
| `gr` | `gr` | Greece | ✅ |
| `hk` | `hk` | Hong Kong | ✅ |
| `in` | `in` | India | ✅ |
| `id` | `id` | Indonesia | ✅ |
| `ie` | `ie` | Ireland | ✅ |
| `il` | `il` | Israel | ✅ |
| `it` | `it` | Italy | ✅ |
| `jp` | `jp` | Japan | ✅ |
| `my` | `my` | Malaysia | ✅ |
| `mx` | `mx` | Mexico | ✅ |
| `nl` | `nl` | Netherlands | ✅ |
| `no` | `no` | Norway | ✅ |
| `pk` | `pk` | Pakistan | ✅ |
| `pe` | `pe` | Peru | ✅ |
| `ph` | `ph` | Philippines | ✅ |
| `pt` | `pt` | Portugal | ✅ |
| `ro` | `ro` | Romania | ✅ |
| `sg` | `sg` | Singapore | ✅ |
| `es` | `es` | Spain | ✅ |
| `se` | `se` | Sweden | ✅ |
| `ch` | `ch` | Switzerland | ✅ |
| `tw` | `tw` | Taiwan | ✅ |
| `tr` | `tr` | Türkiye | ✅ |
| `gb` | `gb` | United Kingdom | ✅ |
| `us` | `us` | United States | ✅ |
| `ru` | — | Russia | ❌ |
| `ua` | — | Ukraine | ❌ |

Codes are lowercase in both APIs. Unsupported codes return `400 ER0212`.

### A semantic difference worth knowing

GNews's `country` on `/search` filters on **where the source publishes from**, explicitly noting the article content is not necessarily about that country. On `/top-headlines` it is looser: "most articles will come from sources originating in that country, and the others will be relevant to that country."

APITube's `source.country.code` is the first kind only — publisher location, consistently, on every endpoint. It draws on publisher metadata, and spot checks put precision at 90–98%; a small share of results come from elsewhere. If you need a hard guarantee, check `source.location.country_code` per article and drop mismatches.

For "news **about** a country", filter on the place instead — this runs on entities extracted from the article body:

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/everything?location.name=Japan&language.code=en&per_page=20"
```

That is closer to what GNews's top-headlines `country` was doing, and it works on any endpoint.

### Multiple countries

```bash
source.country.code=us,gb,ca
```

Up to 3, OR logic; a fourth is silently ignored. Exclusions: `ignore.source.country.code=cn`.

### Geographic search GNews did not have

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  "https://api.apitube.io/v1/news/local?lat=52.52&lng=13.40&radius=50"
```

Coordinates and a radius in kilometres, or a `place` name it geocodes for you. Results are sorted by proximity and every article gains a `distance_km`. For a plain geographic constraint on a normal search, `/v1/news/everything` takes the dotted form — `location.lat`, `location.lng`, `location.radius` — plus `location.bbox` for a bounding box and `location.radius.min` for a ring. Details: [local news](https://docs.apitube.io/platform/news-api/local).

Full country list: [countries](https://docs.apitube.io/platform/news-api/list-of-countries) — 178 supported.
