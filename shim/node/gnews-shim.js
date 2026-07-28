/**
 * GNews.io v4 compatibility shim for the APITube News API.
 *
 * Accepts GNews query parameters, calls APITube, and returns a response shaped like
 * GNews's so existing call sites keep working.
 *
 * The important part: GNews gives OR HIGHER precedence than AND, the reverse of APITube.
 * `translateQuery` re-brackets before emitting, so a query that mixed the two operators
 * keeps the meaning it had on GNews. See reference/query-syntax.md.
 *
 * Anything lossy is reported through `onWarning`.
 */

const APITUBE_BASE_URL = 'https://api.apitube.io';

// GNews category -> APITube filter. See reference/category-mapping.md.
const CATEGORY_MAP = {
    business: { 'category.id': 'medtop:04000000' },
    entertainment: { 'category.id': 'medtop:01000000' },
    health: { 'category.id': 'medtop:07000000' },
    science: { 'category.id': 'medtop:20000717' },
    sports: { 'category.id': 'medtop:15000000' },
    technology: { 'category.id': 'medtop:20000756' },
    general: {},
    // 'world' and 'nation' are reader-relative, not subjects — handled in translateCategory.
    world: {},
    nation: {}
};

const UNSUPPORTED_LANGUAGES = new Set(['ml', 'mr', 'pa', 'ru', 'uk']);
const UNSUPPORTED_COUNTRIES = new Set(['ru', 'ua']);

const MAX_MULTI_VALUES = 3;
const MAX_TITLE_LENGTH = 100;

export class GNewsShim {
    /**
     * @param {object} options
     * @param {string} options.apiKey            APITube API key
     * @param {string} [options.baseUrl]         Override the API base URL
     * @param {function} [options.onWarning]     Called with (message) for every lossy conversion
     * @param {boolean} [options.includeTotalArticles]
     *        Issue a second request to /v1/news/count so `totalArticles` is populated.
     *        On by default — GNews always returned it.
     * @param {function} [options.fetch]         Custom fetch implementation
     */
    constructor({
        apiKey,
        baseUrl = APITUBE_BASE_URL,
        onWarning = message => console.warn(`[gnews-shim] ${message}`),
        includeTotalArticles = true,
        fetch: fetchImpl = globalThis.fetch
    } = {}) {
        if (!apiKey) {
            throw new Error('apiKey is required');
        }

        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.onWarning = onWarning;
        this.includeTotalArticles = includeTotalArticles;
        this.fetch = fetchImpl;
    }

    /**
     * Equivalent of GET /api/v4/search
     * @returns {Promise<object>} { totalArticles, articles }
     */
    async search(gnewsParams = {}) {
        if (!gnewsParams.q) {
            this.warn('GNews required q on /search. APITube does not, so the request will run unfiltered.');
        }

        const params = this.translateParams(gnewsParams, { endpoint: 'search' });
        const payload = await this.request('/v1/news/everything', params);
        const total = this.includeTotalArticles ? await this.count(params) : undefined;

        return this.toGNewsResponse(payload, total);
    }

    /**
     * Equivalent of GET /api/v4/top-headlines
     * @returns {Promise<object>} { totalArticles, articles }
     */
    async topHeadlines(gnewsParams = {}) {
        const params = this.translateParams(gnewsParams, { endpoint: 'topHeadlines' });

        // GNews ranks these by Google News. APITube has no such signal, so the order must be
        // explicit — /v1/news/top-headlines is unordered otherwise.
        if (!params['sort.by']) {
            params['sort.by'] = 'published_at';
            params['sort.order'] = 'desc';
        }

        const hasFilters = Boolean(params['category.id'] || params.title || params.query);
        const path = hasFilters ? '/v1/news/everything' : '/v1/news/top-headlines';
        const payload = await this.request(path, params);
        const total = this.includeTotalArticles ? await this.count(params) : undefined;

        return this.toGNewsResponse(payload, total);
    }

    /** Exact match count for a translated parameter set. */
    async count(apitubeParams) {
        const countParams = { ...apitubeParams };

        for (const key of ['per_page', 'page', 'sort.by', 'sort.order', 'hl', 'hl.fl']) {
            delete countParams[key];
        }

        try {
            const payload = await this.request('/v1/news/count', countParams);

            return typeof payload.count === 'number' ? payload.count : undefined;
        } catch (error) {
            // totalArticles is a convenience, never a reason to fail the whole call.
            this.warn(`totalArticles unavailable: ${error.message}`);

            return undefined;
        }
    }

    // --- parameter translation ------------------------------------------------

    /**
     * GNews parameters -> APITube parameters.
     * Exposed so you can inspect what the shim would send without making a request.
     */
    translateParams(gnews = {}, { endpoint = 'search' } = {}) {
        const params = {};

        if (gnews.q) {
            Object.assign(params, this.translateQuery(gnews.q, gnews.in));
        }

        if (gnews.in && !gnews.q) {
            this.warn('in= without q has no effect — dropped.');
        }

        if (gnews.lang) {
            Object.assign(params, this.translateLanguage(gnews.lang));
        }

        if (gnews.country) {
            Object.assign(params, this.translateCountry(gnews.country, endpoint));
        }

        if (gnews.category) {
            Object.assign(params, this.translateCategory(gnews.category, gnews.country));
        }

        const perPage = this.translateMax(gnews.max);

        if (perPage !== undefined) {
            params.per_page = perPage;
        }

        if (gnews.page !== undefined && gnews.page !== null) {
            const page = Number(gnews.page);

            if (Number.isFinite(page) && page >= 1) {
                params.page = Math.floor(page);
            } else {
                this.warn(`page="${gnews.page}" is not a positive number — ignored.`);
            }
        }

        if (gnews.from) {
            params['published_at.start'] = gnews.from;
        }

        if (gnews.to) {
            params['published_at.end'] = gnews.to;
        }

        Object.assign(params, this.translateSort(gnews.sortby ?? gnews.sortBy, params));
        Object.assign(params, this.translateNullable(gnews.nullable));

        if (gnews.truncate) {
            this.warn('truncate has no equivalent — APITube never truncates body mid-article. Dropped.');
        }

        return params;
    }

    /**
     * GNews q -> title (simple) or query (with operators).
     *
     * Re-brackets OR chains first, because GNews binds OR tighter than AND and APITube
     * does the opposite.
     */
    translateQuery(q, searchIn) {
        const params = {};
        const raw = String(q).trim();

        if (searchIn) {
            const fields = String(searchIn)
                .split(',')
                .map(field => field.trim().toLowerCase());
            const unsupported = fields.filter(field => field !== 'title');

            if (unsupported.length > 0) {
                this.warn(
                    `in=${unsupported.join(',')} has no APITube equivalent — only title search exists. Results will be narrower.`
                );
            }
        } else {
            this.warn(
                "GNews searched title and description by default; APITube's title filter searches headlines only, so expect fewer results. See reference/limitations.md."
            );
        }

        const hasOperators = /\b(AND|OR|NOT)\b|[()"]/.test(raw);

        if (hasOperators) {
            const rebracketed = this.rebracketOrChains(raw);

            if (rebracketed !== raw) {
                this.warn(
                    `GNews binds OR tighter than AND; APITube does the opposite. Re-bracketed "${raw}" as "${rebracketed}" to preserve the original meaning.`
                );
            }

            params.query = this.toQueryLanguage(rebracketed);

            return params;
        }

        let title = raw;

        if (title.length > MAX_TITLE_LENGTH) {
            this.warn(
                `q is ${title.length} characters; APITube caps title at ${MAX_TITLE_LENGTH} (GNews allowed 200). Truncated — move long queries to the query language instead.`
            );
            title = title.slice(0, MAX_TITLE_LENGTH).trim();
        }

        params.title = title;

        return params;
    }

    /**
     * Wrap every OR chain in brackets so APITube's AND-first precedence reproduces
     * GNews's OR-first precedence.
     *
     *   Apple AND iPhone OR Microsoft  ->  Apple AND (iPhone OR Microsoft)
     *   Tesla OR Rivian AND recall     ->  (Tesla OR Rivian) AND recall
     *   a AND b OR c AND d             ->  a AND (b OR c) AND d
     */
    rebracketOrChains(expression) {
        const tokens = this.tokenize(expression);

        if (!tokens.some(token => token.type === 'or')) {
            return expression;
        }

        const output = [];
        let index = 0;

        while (index < tokens.length) {
            const token = tokens[index];

            // An operand followed by OR starts a chain.
            if (token.type === 'operand' && tokens[index + 1]?.type === 'or') {
                const chain = [token.value];

                index += 1;

                while (tokens[index]?.type === 'or' && tokens[index + 1]?.type === 'operand') {
                    chain.push(tokens[index + 1].value);
                    index += 2;
                }

                output.push(`(${chain.join(' OR ')})`);
                continue;
            }

            output.push(token.value);
            index += 1;
        }

        return output.join(' ');
    }

    /**
     * Split an expression into operands and operators. An operand is a bare term, a
     * quoted phrase, or a balanced bracket group (kept intact — already unambiguous).
     */
    tokenize(expression) {
        const tokens = [];
        const source = String(expression);
        let index = 0;

        while (index < source.length) {
            const char = source[index];

            if (/\s/.test(char)) {
                index += 1;
                continue;
            }

            if (char === '(') {
                let depth = 0;
                let end = index;

                for (; end < source.length; end += 1) {
                    if (source[end] === '(') depth += 1;
                    if (source[end] === ')') {
                        depth -= 1;
                        if (depth === 0) break;
                    }
                }

                tokens.push({ type: 'operand', value: source.slice(index, end + 1) });
                index = end + 1;
                continue;
            }

            if (char === '"') {
                const end = source.indexOf('"', index + 1);
                const stop = end === -1 ? source.length : end + 1;

                tokens.push({ type: 'operand', value: source.slice(index, stop) });
                index = stop;
                continue;
            }

            const match = source.slice(index).match(/^\S+/);
            const word = match ? match[0] : source.slice(index);

            if (/^OR$/i.test(word)) {
                tokens.push({ type: 'or', value: 'OR' });
            } else if (/^AND$/i.test(word)) {
                tokens.push({ type: 'and', value: 'AND' });
            } else if (/^NOT$/i.test(word)) {
                // NOT belongs to the operand that follows it; keep them together.
                const rest = source.slice(index + word.length).match(/^\s*(\S+)/);

                if (rest) {
                    tokens.push({ type: 'operand', value: `NOT ${rest[1]}` });
                    index += word.length + rest[0].length;
                    continue;
                }

                tokens.push({ type: 'operand', value: word });
            } else {
                tokens.push({ type: 'operand', value: word });
            }

            index += word.length;
        }

        return tokens;
    }

    /** Prefix every bare term with the default field so APITube parses it as a title match. */
    toQueryLanguage(expression) {
        return expression.replace(/"[^"]*"|\S+/g, token => {
            if (/^(AND|OR|NOT)$/i.test(token)) {
                return token.toUpperCase();
            }

            if (/^[()]+$/.test(token) || token.includes(':')) {
                return token;
            }

            const leading = token.match(/^\(+/)?.[0] ?? '';
            const trailing = token.match(/\)+$/)?.[0] ?? '';
            const bare = token.slice(leading.length, token.length - trailing.length);

            if (!bare) {
                return token;
            }

            // APITube rejects single-character terms with 400 ER0705; GNews accepted them.
            if (bare.replace(/^"|"$/g, '').length < 2) {
                this.warn(
                    `Term "${bare}" is a single character. APITube requires 2-100 characters per term and will return 400 ER0705.`
                );
            }

            return `${leading}title:${bare}${trailing}`;
        });
    }

    translateLanguage(lang) {
        const codes = String(lang)
            .split(',')
            .map(code => code.trim().toLowerCase())
            .filter(Boolean);

        const mapped = codes.filter(code => {
            if (UNSUPPORTED_LANGUAGES.has(code)) {
                this.warn(`lang="${code}" is not supported by APITube — dropped.`);

                return false;
            }

            return true;
        });

        if (mapped.length === 0) {
            return {};
        }

        return { 'language.code': this.capMultiValue(mapped.join(','), 'lang') };
    }

    translateCountry(country, endpoint = 'search') {
        const codes = String(country)
            .split(',')
            .map(code => code.trim().toLowerCase())
            .filter(Boolean);

        const mapped = codes.filter(code => {
            if (UNSUPPORTED_COUNTRIES.has(code)) {
                this.warn(`country="${code}" is not supported by APITube — dropped.`);

                return false;
            }

            return true;
        });

        if (mapped.length === 0) {
            return {};
        }

        if (endpoint === 'topHeadlines') {
            this.warn(
                "GNews's top-headlines country also pulled in articles merely relevant to that country. APITube's source.country.code is publisher location only — add location.name if you want subject-country coverage."
            );
        }

        return { 'source.country.code': this.capMultiValue(mapped.join(','), 'country') };
    }

    translateCategory(category, country) {
        const key = String(category).toLowerCase().trim();

        if (!(key in CATEGORY_MAP)) {
            this.warn(`category="${category}" is not a GNews category — dropped. See reference/category-mapping.md.`);

            return {};
        }

        if (key === 'general') {
            this.warn('category=general has no APITube equivalent — the filter was dropped, which widens the feed.');

            return {};
        }

        if (key === 'nation') {
            if (country) {
                this.warn(`category=nation mapped to source.country.code=${String(country).toLowerCase()}.`);

                return {};
            }

            this.warn('category=nation needs a country to be meaningful — no country given, so the filter was dropped.');

            return {};
        }

        if (key === 'world') {
            if (country) {
                this.warn(
                    `category=world mapped to ignore.source.country.code=${String(country).toLowerCase()} (everything except your home country).`
                );

                return { 'ignore.source.country.code': String(country).toLowerCase() };
            }

            this.warn(
                'category=world has no direct equivalent. Consider category.id=medtop:16000000 (conflict, war and peace) or ignore.source.country.code. Filter dropped.'
            );

            return {};
        }

        return { ...CATEGORY_MAP[key] };
    }

    translateMax(max) {
        if (max === undefined || max === null) {
            return undefined;
        }

        const value = Number(max);

        if (!Number.isFinite(value) || value < 1) {
            this.warn(`max="${max}" is not a positive number — ignored.`);

            return undefined;
        }

        if (value > 250) {
            this.warn(`max=${value} exceeds the APITube maximum of 250 — clamped.`);

            return 250;
        }

        return Math.floor(value);
    }

    translateSort(sortby, currentParams) {
        if (!sortby) {
            return {};
        }

        const value = String(sortby).toLowerCase();

        if (value === 'publishedat') {
            return { 'sort.by': 'published_at', 'sort.order': 'desc' };
        }

        if (value === 'relevance') {
            // Known production issue: title= combined with sort.by=relevance returns 500 ER0183.
            if (currentParams.title) {
                this.warn(
                    'sortby=relevance combined with a search term currently fails on the APITube API (500 ER0183). Falling back to sort.by=published_at. See reference/limitations.md.'
                );

                return { 'sort.by': 'published_at', 'sort.order': 'desc' };
            }

            return { 'sort.by': 'relevance', 'sort.order': 'desc' };
        }

        this.warn(`sortby="${sortby}" is not a GNews value (publishedAt|relevance) — ignored.`);

        return {};
    }

    /**
     * GNews excluded articles with null description/content/image by default; `nullable`
     * opted back in. APITube is the other way round — it returns everything unless you
     * require a field.
     */
    translateNullable(nullable) {
        const allowed = new Set(
            String(nullable ?? '')
                .split(',')
                .map(field => field.trim().toLowerCase())
                .filter(Boolean)
        );

        // No nullable= means GNews required an image; mirror that with has_image.
        if (!allowed.has('image')) {
            return { has_image: 1 };
        }

        return {};
    }

    /** APITube caps comma-separated filters at 3 values and ignores the rest silently. */
    capMultiValue(value, parameterName) {
        const items = String(value)
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

        if (items.length <= MAX_MULTI_VALUES) {
            return items.join(',');
        }

        this.warn(
            `${parameterName} had ${items.length} values; APITube applies at most ${MAX_MULTI_VALUES} and ignores the rest silently. Kept: ${items
                .slice(0, MAX_MULTI_VALUES)
                .join(',')}. Dropped: ${items.slice(MAX_MULTI_VALUES).join(',')}.`
        );

        return items.slice(0, MAX_MULTI_VALUES).join(',');
    }

    // --- response translation -------------------------------------------------

    /** APITube article response -> GNews response */
    toGNewsResponse(payload, totalArticles) {
        const results = Array.isArray(payload.results) ? payload.results : [];

        const response = {
            totalArticles: totalArticles ?? results.length,
            articles: results.map(article => this.toArticle(article))
        };

        // Not part of GNews's contract — kept so paging code has something to follow.
        response.apitube = {
            page: payload.page,
            limit: payload.limit,
            hasNextPage: payload.has_next_pages,
            nextPage: payload.next_page,
            nextPageUrl: payload.next_page,
            requestId: payload.request_id
        };

        return response;
    }

    /** APITube article -> GNews article */
    toArticle(article) {
        const source = article.source ?? {};

        return {
            id: article.id != null ? String(article.id) : null,
            title: article.title,
            description: article.description ?? null,
            // GNews truncated this on the Free plan; APITube returns the whole article.
            content: article.body ?? null,
            url: article.href,
            image: article.image ?? null,
            publishedAt: article.published_at,
            lang: article.language ?? null,
            source: {
                id: source.id != null ? String(source.id) : null,
                name: source.domain ?? '',
                url: source.home_page_url ?? '',
                country: source.location?.country_code ?? null
            },
            // Everything GNews never returned, kept out of the way of existing code.
            apitube: article
        };
    }

    // --- transport ------------------------------------------------------------

    async request(path, params) {
        const url = new URL(`${this.baseUrl}${path}`);

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, String(value));
            }
        }

        const response = await this.fetch(url.toString(), {
            headers: { 'X-API-Key': this.apiKey, Accept: 'application/json' }
        });

        // Gateway errors (502/504 on heavy aggregations) come back as HTML, not JSON.
        const text = await response.text();
        let payload;

        try {
            payload = JSON.parse(text);
        } catch {
            throw new GNewsShimError(
                `APITube returned a non-JSON response (HTTP ${response.status}). This usually means the query was too heavy and the gateway timed out — narrow the filters or drop the totalArticles lookup.`,
                { status: response.status, url: url.toString() }
            );
        }

        if (payload.status === 'not_ok' || payload.status === 'error') {
            const error = payload.errors?.[0] ?? {};

            throw new GNewsShimError(error.message ?? 'APITube request failed', {
                code: error.code,
                status: error.status ?? response.status,
                requestId: payload.request_id,
                url: url.toString()
            });
        }

        if (!response.ok) {
            throw new GNewsShimError(`APITube returned HTTP ${response.status}`, {
                status: response.status,
                url: url.toString()
            });
        }

        return payload;
    }

    warn(message) {
        if (typeof this.onWarning === 'function') {
            this.onWarning(message);
        }
    }
}

export class GNewsShimError extends Error {
    constructor(message, { code, status, requestId, url } = {}) {
        super(message);
        this.name = 'GNewsShimError';
        this.code = code;
        this.status = status;
        this.requestId = requestId;
        this.url = url;
    }
}

export { CATEGORY_MAP, UNSUPPORTED_LANGUAGES, UNSUPPORTED_COUNTRIES };
