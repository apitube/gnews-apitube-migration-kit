/**
 * Run with: APITUBE_API_KEY=your_key node example.js
 */

import { GNewsShim } from './gnews-shim.js';

const apiKey = process.env.APITUBE_API_KEY;

if (!apiKey) {
    console.error('Set APITUBE_API_KEY first. Get a key at https://apitube.io');
    process.exit(1);
}

const client = new GNewsShim({ apiKey });

// 1. The call your GNews code already makes, unchanged.
console.log('\n=== search: q + lang + country + max + sortby ===\n');

const search = await client.search({
    q: 'bitcoin',
    lang: 'en',
    country: 'us',
    max: 5,
    sortby: 'publishedAt'
});

console.log(`totalArticles: ${search.totalArticles}`);

for (const article of search.articles) {
    console.log(`  ${article.publishedAt}  ${article.source.name}  (${article.source.country})`);
    console.log(`  ${article.title}`);
    console.log('');
}

// 2. The precedence trap, handled automatically.
console.log('\n=== the OR/AND precedence rewrite ===\n');

for (const q of ['Apple AND iPhone OR Microsoft', 'Tesla OR Rivian AND recall']) {
    const params = client.translateParams({ q });

    console.log(`  GNews:   ${q}`);
    console.log(`  APITube: ${params.query}`);
    console.log('');
}

// 3. Top headlines by category.
console.log('\n=== topHeadlines: category=technology ===\n');

const headlines = await client.topHeadlines({ category: 'technology', lang: 'en', max: 3 });

for (const article of headlines.articles) {
    console.log(`  ${article.source.name}  ${article.title.slice(0, 65)}`);
}

// 4. max beyond the GNews ceiling.
console.log('\n=== max=250 — GNews caps at 10 on Free, 100 on Enterprise ===\n');

const big = await client.search({ q: 'technology', lang: 'en', max: 250 });

console.log(`  articles returned: ${big.articles.length}`);

// 5. Everything GNews never returned.
console.log('\n=== data GNews never returned ===\n');

const first = search.articles[0]?.apitube;

if (first) {
    console.log(`  author:      ${first.author?.name || '(none)'}`);
    console.log(`  sentiment:   ${first.sentiment.overall.polarity} (${first.sentiment.overall.score})`);
    console.log(`  source OPR:  ${first.source.rankings.opr}/10`);
    console.log(`  source bias: ${first.source.bias}`);
    console.log(`  read time:   ${first.read_time} min`);
    console.log(`  entities:    ${(first.entities ?? []).map(e => e.name).slice(0, 5).join(', ')}`);
}

// 6. Inspect the translation without sending a request.
console.log('\n=== translateParams (no request sent) ===\n');
console.log(
    client.translateParams({
        q: 'crypto OR blockchain AND regulation',
        in: 'title',
        lang: 'en',
        country: 'gb',
        max: 50,
        page: 2,
        from: '2026-07-01T00:00:00.000Z',
        sortby: 'publishedAt'
    })
);
