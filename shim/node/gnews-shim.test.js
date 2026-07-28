import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GNewsShim } from './gnews-shim.js';

const silent = () => new GNewsShim({ apiKey: 'test', onWarning: () => {} });
const recording = () => {
    const warnings = [];

    return [new GNewsShim({ apiKey: 'test', onWarning: message => warnings.push(message) }), warnings];
};

test('maps the canonical GNews search call', () => {
    const params = silent().translateParams({
        q: 'bitcoin',
        lang: 'en',
        country: 'us',
        max: 10,
        sortby: 'publishedAt'
    });

    assert.deepEqual(params, {
        title: 'bitcoin',
        'language.code': 'en',
        'source.country.code': 'us',
        per_page: 10,
        'sort.by': 'published_at',
        'sort.order': 'desc',
        has_image: 1
    });
});

// --- the precedence rewrite, the reason this shim exists --------------------

test('re-brackets OR chains to preserve GNews precedence', () => {
    const shim = silent();

    assert.equal(shim.rebracketOrChains('Apple AND iPhone OR Microsoft'), 'Apple AND (iPhone OR Microsoft)');
    assert.equal(shim.rebracketOrChains('Tesla OR Rivian AND recall'), '(Tesla OR Rivian) AND recall');
    assert.equal(shim.rebracketOrChains('a AND b OR c AND d'), 'a AND (b OR c) AND d');
});

test('leaves already-bracketed queries alone', () => {
    const shim = silent();

    assert.equal(shim.rebracketOrChains('Intel AND (i7 OR i9)'), 'Intel AND (i7 OR i9)');
    assert.equal(shim.rebracketOrChains('Apple AND NOT iPhone'), 'Apple AND NOT iPhone');
    assert.equal(shim.rebracketOrChains('Microsoft Windows 10'), 'Microsoft Windows 10');
});

test('handles a chain of three or more ORs', () => {
    assert.equal(
        silent().rebracketOrChains('a OR b OR c AND d'),
        '(a OR b OR c) AND d'
    );
});

test('keeps quoted phrases intact through the rewrite', () => {
    const shim = silent();

    assert.equal(
        shim.rebracketOrChains('"Apple iPhone 13" AND NOT "Apple iPhone 14"'),
        '"Apple iPhone 13" AND NOT "Apple iPhone 14"'
    );
    assert.equal(
        shim.toQueryLanguage('"Apple iPhone 13" AND NOT "Apple iPhone 14"'),
        'title:"Apple iPhone 13" AND NOT title:"Apple iPhone 14"'
    );
});

test('keeps NOT attached to its operand', () => {
    assert.equal(silent().rebracketOrChains('Apple OR NOT iPhone AND Samsung'), '(Apple OR NOT iPhone) AND Samsung');
});

test('warns when it re-brackets', () => {
    const [shim, warnings] = recording();

    shim.translateParams({ q: 'Apple AND iPhone OR Microsoft' });
    assert.ok(warnings.some(message => message.includes('binds OR tighter than AND')));
});

test('converts every documented GNews example query', () => {
    const shim = silent();
    const convert = q => shim.toQueryLanguage(shim.rebracketOrChains(q));

    assert.equal(convert('Apple OR Microsoft'), '(title:Apple OR title:Microsoft)');
    assert.equal(convert('Apple AND NOT iPhone'), 'title:Apple AND NOT title:iPhone');
    assert.equal(convert('Intel AND (i7 OR i9)'), 'title:Intel AND (title:i7 OR title:i9)');
    assert.equal(
        convert('(Intel AND (i7 OR "i9-14900K")) AND NOT AMD AND NOT "i7-14700K"'),
        '(title:Intel AND (title:i7 OR title:"i9-14900K")) AND NOT title:AMD AND NOT title:"i7-14700K"'
    );
});

test('warns about single-character terms APITube rejects', () => {
    const [shim, warnings] = recording();

    shim.toQueryLanguage('title:a AND title:b');
    shim.toQueryLanguage('a AND b');
    assert.ok(warnings.some(message => message.includes('ER0705')));
});

// --- plain parameters ------------------------------------------------------

test('uses title for queries without operators', () => {
    const params = silent().translateParams({ q: 'bitcoin etf' });

    assert.equal(params.title, 'bitcoin etf');
    assert.equal(params.query, undefined);
});

test('truncates q beyond the APITube title limit', () => {
    const [shim, warnings] = recording();
    const params = shim.translateParams({ q: 'x'.repeat(150) });

    assert.equal(params.title.length, 100);
    assert.ok(warnings.some(message => message.includes('GNews allowed 200')));
});

test('stays quiet about title-only search when in=title', () => {
    const [shim, warnings] = recording();

    shim.translateParams({ q: 'bitcoin', in: 'title' });
    assert.ok(!warnings.some(message => message.includes('expect fewer results')));
});

test('warns that in=content has no equivalent', () => {
    const [shim, warnings] = recording();

    shim.translateParams({ q: 'bitcoin', in: 'title,content' });
    assert.ok(warnings.some(message => message.includes('in=content')));
});

test('clamps max to the APITube maximum', () => {
    const [shim, warnings] = recording();

    assert.equal(shim.translateParams({ max: 500 }).per_page, 250);
    assert.ok(warnings.some(message => message.includes('clamped')));
});

test('maps page unchanged', () => {
    assert.equal(silent().translateParams({ page: 4 }).page, 4);
});

test('passes ISO 8601 dates through untouched', () => {
    const params = silent().translateParams({
        from: '2026-07-18T21:32:58.500Z',
        to: '2026-07-26T00:00:00.000Z'
    });

    assert.equal(params['published_at.start'], '2026-07-18T21:32:58.500Z');
    assert.equal(params['published_at.end'], '2026-07-26T00:00:00.000Z');
});

test('maps both sortby values', () => {
    const shim = silent();

    assert.equal(shim.translateParams({ sortby: 'publishedAt' })['sort.by'], 'published_at');
    assert.equal(shim.translateParams({ sortby: 'relevance', lang: 'en' })['sort.by'], 'relevance');
});

test('falls back to published_at when relevance is combined with a search term', () => {
    const [shim, warnings] = recording();
    const params = shim.translateParams({ q: 'tesla', sortby: 'relevance' });

    assert.equal(params['sort.by'], 'published_at');
    assert.ok(warnings.some(message => message.includes('500 ER0183')));
});

test('drops the five unsupported languages', () => {
    const [shim, warnings] = recording();

    for (const code of ['ml', 'mr', 'pa', 'ru', 'uk']) {
        assert.deepEqual(shim.translateLanguage(code), {});
    }

    assert.equal(warnings.length, 5);
});

test('drops the two unsupported countries', () => {
    const [shim, warnings] = recording();

    assert.deepEqual(shim.translateCountry('ru'), {});
    assert.deepEqual(shim.translateCountry('ua'), {});
    assert.equal(warnings.length, 2);
});

test('maps the six subject categories', () => {
    const shim = silent();

    assert.deepEqual(shim.translateCategory('business'), { 'category.id': 'medtop:04000000' });
    assert.deepEqual(shim.translateCategory('entertainment'), { 'category.id': 'medtop:01000000' });
    assert.deepEqual(shim.translateCategory('health'), { 'category.id': 'medtop:07000000' });
    assert.deepEqual(shim.translateCategory('science'), { 'category.id': 'medtop:20000717' });
    assert.deepEqual(shim.translateCategory('sports'), { 'category.id': 'medtop:15000000' });
    assert.deepEqual(shim.translateCategory('technology'), { 'category.id': 'medtop:20000756' });
});

test('maps world to a country exclusion when a country is given', () => {
    const [shim, warnings] = recording();

    assert.deepEqual(shim.translateCategory('world', 'de'), { 'ignore.source.country.code': 'de' });
    assert.deepEqual(shim.translateCategory('world'), {});
    assert.ok(warnings.some(message => message.includes('no direct equivalent')));
});

test('drops general and nation with an explanation', () => {
    const [shim, warnings] = recording();

    assert.deepEqual(shim.translateCategory('general'), {});
    assert.deepEqual(shim.translateCategory('nation', 'de'), {});
    assert.equal(warnings.length, 2);
});

test('inverts nullable into has_image', () => {
    const shim = silent();

    assert.deepEqual(shim.translateNullable(undefined), { has_image: 1 });
    assert.deepEqual(shim.translateNullable('description'), { has_image: 1 });
    assert.deepEqual(shim.translateNullable('image'), {});
    assert.deepEqual(shim.translateNullable('description,content,image'), {});
});

test('caps multi-value filters at 3', () => {
    const [shim, warnings] = recording();

    assert.equal(shim.translateLanguage('en,de,fr,it')['language.code'], 'en,de,fr');
    assert.ok(warnings.some(message => message.includes('Dropped: it')));
});

// --- response --------------------------------------------------------------

test('shapes an APITube payload into a GNews response', () => {
    const response = silent().toGNewsResponse(
        {
            status: 'ok',
            page: 1,
            has_next_pages: true,
            next_page: 'https://api.apitube.io/v1/news/everything?page=2',
            request_id: 'req-1',
            results: [
                {
                    id: 3067022102,
                    title: 'M5 chip leak reveals big gains',
                    description: 'Summary',
                    body: 'Full article text with no truncation.',
                    href: 'https://9to5mac.com/a',
                    image: 'https://9to5mac.com/i.jpg',
                    published_at: '2026-07-20T14:30:00.000Z',
                    language: 'en',
                    source: {
                        id: 4232,
                        domain: '9to5mac.com',
                        home_page_url: 'https://9to5mac.com',
                        location: { country_code: 'us' }
                    }
                }
            ]
        },
        54904
    );

    assert.equal(response.totalArticles, 54904);

    const [article] = response.articles;

    assert.equal(article.id, '3067022102');
    assert.equal(article.title, 'M5 chip leak reveals big gains');
    assert.equal(article.content, 'Full article text with no truncation.');
    assert.equal(article.url, 'https://9to5mac.com/a');
    assert.equal(article.image, 'https://9to5mac.com/i.jpg');
    assert.equal(article.lang, 'en');
    assert.deepEqual(article.source, {
        id: '4232',
        name: '9to5mac.com',
        url: 'https://9to5mac.com',
        country: 'us'
    });
    assert.equal(article.apitube.id, 3067022102);
    assert.equal(response.apitube.nextPageUrl, 'https://api.apitube.io/v1/news/everything?page=2');
});

test('falls back to the article count when totalArticles is unavailable', () => {
    const response = silent().toGNewsResponse({ results: [{ id: 1, title: 'x', source: {} }] });

    assert.equal(response.totalArticles, 1);
});
