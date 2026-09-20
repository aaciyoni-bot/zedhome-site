'use strict';

// Rich product content is fetched only when requested. No checkout/payment state
// is read or changed here. Prices retain the supplier's explicit currency.
const DATAHUB_HOST = 'aliexpress-datahub.p.rapidapi.com';
// The provider's former /item_detail_5 is offline. /item_detail is the active
// Item Detail #1 endpoint; keep this mapping explicit instead of guessing paths.
const DETAIL_PATH = '/item_detail';
const REVIEW_PATH = '/item_review_2';
const MEDIA_HOSTS = ['alicdn.com', 'aliexpress-media.com', 'aliexpress.com', 'aliexpress.us'];
const ID_PATTERN = /^\d{5,24}$/;

function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function first(...values) { return values.find(value => value !== undefined && value !== null && value !== ''); }
function list(value) { return Array.isArray(value) ? value : []; }
function number(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return undefined;
    if (typeof value === 'string' && !/^\s*\d+(?:\.\d+)?\s*$/.test(value)) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function decodeEntities(value) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
        if (entity[0] !== '#') return named[entity.toLowerCase()] || match;
        const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
    });
}
function text(value, max = 2000) {
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    return decodeEntities(String(value).slice(0, Math.max(max * 3, 1000))
        .replace(/<(script|style|iframe|object|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[^]*?-->/g, '')
        .replace(/<\s*(?:br\b[^>]*|\/p\s*|\/div\s*|\/li\s*|\/h[1-6]\s*)>/gi, '\n')
        .replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''))
        .replace(/[\t ]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim().slice(0, max);
}
function mediaUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return '';
    let candidate = decodeEntities(value.trim());
    if (candidate.startsWith('//')) candidate = 'https:' + candidate;
    // A known supplier CDN over HTTP can safely be upgraded to HTTPS.
    if (candidate.startsWith('http://')) candidate = 'https://' + candidate.slice(7);
    try {
        const url = new URL(candidate);
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return '';
        const host = url.hostname.toLowerCase();
        if (!MEDIA_HOSTS.some(domain => host === domain || host.endsWith('.' + domain))) return '';
        return url.href;
    } catch (_) { return ''; }
}
function imageValue(entry) {
    if (typeof entry === 'string') return mediaUrl(entry);
    const value = object(entry);
    return mediaUrl(first(value.url, value.image, value.imageUrl, value.imageURL, value.src, value.original, value.img));
}
function images(...collections) {
    const all = collections.flatMap(value => Array.isArray(value) ? value : value ? [value] : []);
    return [...new Set(all.map(imageValue).filter(Boolean))].slice(0, 80);
}
function htmlImages(html) {
    if (typeof html !== 'string') return [];
    const result = [];
    const pattern = /<img\b[^>]*?\b(?:src|data-src)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
    for (const match of html.slice(0, 500000).matchAll(pattern)) {
        const url = mediaUrl(match[1] || match[2] || match[3]);
        if (url) result.push(url);
        if (result.length >= 80) break;
    }
    return [...new Set(result)];
}
function currency(...values) {
    for (const value of values) if (typeof value === 'string' && /^[A-Za-z]{3}$/.test(value)) return value.toUpperCase();
    return undefined;
}
function source(id) { return { name: 'AliExpress', url: 'https://www.aliexpress.com/item/' + id + '.html' }; }
function schemaKeys(value) {
    return Object.keys(object(value)).filter(key => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(key)).slice(0, 25);
}
function unwrap(data) {
    const root = object(data);
    return object(first(root.result, root.data, root));
}
function fields(value) {
    if (Array.isArray(value)) return value;
    return Object.entries(object(value)).map(([name, item]) => ({ name, value: item }));
}
function specifications(value) {
    return fields(value).map(entry => {
        const prop = object(entry);
        const value = first(prop.value, prop.attrValue, prop.attr_value, prop.attrValueName, prop.propertyValue, prop.values);
        return {
            name: text(first(prop.name, prop.attrName, prop.attr_name, prop.propertyName), 150),
            value: text(Array.isArray(value) ? value.map(v => typeof v === 'object' ? first(v.name, v.value) : v).join(', ') : value, 1500)
        };
    }).filter(prop => prop.name && prop.value).slice(0, 100);
}
function options(value) {
    return list(value).map(prop => {
        const groupId = text(first(prop.pid, prop.id, prop.propertyId, prop.skuPropertyId), 80);
        return {
            id: groupId,
            name: text(first(prop.name, prop.propertyName, prop.skuPropertyName), 150),
            values: list(first(prop.values, prop.valueList, prop.skuPropertyValues)).map(entry => ({
                id: text(first(entry.vid, entry.id, entry.propertyValueId), 80),
                name: text(first(entry.name, entry.value, entry.propertyValueDisplayName, entry.propertyValueName), 200),
                image: imageValue(first(entry.image, entry.imageUrl, entry.skuPropertyImagePath)) || undefined
            })).filter(entry => entry.id && entry.name).slice(0, 120)
        };
    }).filter(group => group.id && group.name && group.values.length).slice(0, 12);
}
function variants(value, groups, defaultCurrency) {
    return list(value).map(raw => {
        const entry = object(raw);
        const id = text(first(entry.skuId, entry.id, entry.sku_id), 100);
        const attr = text(first(entry.skuAttr, entry.propMap, entry.sku_attr, entry.skuPropIds), 2000);
        const pairs = attr.split(';').map(pair => pair.split('#')[0].split(':')).filter(pair => pair.length === 2);
        const selected = {};
        let image = imageValue(first(entry.image, entry.skuImage));
        for (const [groupId, valueId] of pairs) {
            const group = groups.find(group => group.id === groupId);
            const option = group && group.values.find(option => option.id === valueId);
            if (group && option) {
                selected[group.name] = option.name;
                image = image || option.image;
            }
        }
        const explicitOptions = object(entry.options);
        for (const [name, option] of Object.entries(explicitOptions).slice(0, 12)) {
            if (text(name, 150) && text(option, 200)) selected[text(name, 150)] = text(option, 200);
        }
        const priceObject = object(entry.price);
        const regular = number(first(priceObject.value, priceObject.amount, entry.price, entry.skuPrice));
        // Preserve the regular cost where supplied; introductory promotions must
        // never silently replace the retailer's existing selling price.
        const price = regular;
        const stock = number(first(entry.quantity, entry.stock, entry.skuVal && entry.skuVal.availQuantity));
        const available = typeof entry.available === 'boolean' ? entry.available : stock !== undefined ? stock > 0 : undefined;
        return {
            id, skuId: id, skuAttr: attr || undefined,
            label: text(first(entry.label, entry.name), 300) || Object.entries(selected).map(([key, val]) => key + ': ' + val).join(' · ') || id,
            options: selected, optionValueIds: pairs.map(pair => pair.join(':')),
            image: image || undefined, price,
            currency: currency(entry.currency, priceObject.currency, entry.priceCurrency, defaultCurrency), available
        };
    }).filter(entry => entry.id).slice(0, 500);
}
function normalizeProduct(data, id, requestedCurrency) {
    const result = unwrap(data);
    const status = number(object(result.status).code);
    if (status !== undefined && status !== 200) return null;
    const item = object(first(result.item, result.product, result));
    const title = text(first(item.title, item.subject, item.productTitle), 1000);
    if (!title) return null;
    const suppliedId = text(first(item.itemId, item.productId, item.id), 30);
    if (suppliedId && suppliedId !== id) return null;
    const sku = object(item.sku);
    const def = object(sku.def);
    const descriptionValue = first(item.description, item.desc, result.description, result.desc);
    const descriptionObject = object(descriptionValue);
    const descriptionRaw = typeof descriptionValue === 'string' ? descriptionValue : first(descriptionObject.html, descriptionObject.body, descriptionObject.text, descriptionObject.description, '');
    const descriptionText = /^https?:\/\/\S+$/.test(String(descriptionRaw).trim()) ? '' : text(descriptionRaw, 60000);
    const descriptionImages = images(htmlImages(descriptionRaw), descriptionObject.images, item.descriptionImages);
    const groups = options(first(sku.props, sku.properties, item.skuProperties, item.options));
    const variantList = variants(first(sku.base, sku.skus, item.skus, item.variants), groups, currency(def.currency, sku.currency, item.currency, result.currency, object(result.settings).currency, requestedCurrency));
    const videosRaw = first(item.videos, item.video, result.videos);
    const videoEntries = Array.isArray(videosRaw) ? videosRaw : videosRaw ? [videosRaw] : [];
    const videos = videoEntries.map(entry => {
        const video = object(entry);
        return {
            url: mediaUrl(typeof entry === 'string' ? entry : first(video.url, video.videoUrl, video.playUrl, video.videoURL)),
            poster: imageValue(first(video.poster, video.posterUrl, video.thumbnail, video.cover, video.image)) || undefined
        };
    }).filter(video => video.url).slice(0, 8);
    const ratingValue = number(first(item.averageStarRate, item.rating, object(item.feedback).rating, object(item.reviews).rating));
    const reviewCount = number(first(item.reviewCount, item.feedbackCount, object(item.reviews).count, object(item.feedback).total));
    return {
        id, title, descriptionText, description: descriptionText, descriptionImages,
        images: images(item.images, item.image, item.imageList, item.imageUrls), videos,
        specifications: specifications(first(object(item.properties).list, item.properties, item.props, item.specifications, item.attributes)),
        options: groups, variants: variantList,
        rating: ratingValue !== undefined && ratingValue <= 5 ? ratingValue : undefined,
        reviewCount, source: source(id), sourceUrl: source(id).url,
        detailsAvailable: true,
        available: typeof item.available === 'boolean' ? item.available : undefined
    };
}
function normalizeReviews(data, id, page) {
    const result = unwrap(data);
    const status = number(object(result.status).code);
    if (status !== undefined && status !== 200) return null;
    const wrapper = object(result.reviews);
    const candidates = [result.reviews, result.reviewList, result.resultList, result.feedbacks, result.list, wrapper.list, wrapper.items];
    const raw = candidates.find(Array.isArray);
    if (!raw) return null;
    const reviews = raw.slice(0, 100).map((entry, index) => {
        const review = entry.review && typeof entry.review === 'object' ? object(entry.review) : object(entry);
        const buyer = object(entry.buyer);
        const ratingValue = number(first(review.reviewStarts, review.rating, review.star, review.starRating, review.buyerEval));
        const content = text(first(review.reviewContent, review.content, review.text, review.feedback, review.buyerFeedback, review.reviewText, typeof review.review === 'string' ? review.review : undefined), 8000);
        const reviewImages = images(review.reviewImages, review.images, review.photos, review.imageList, review.buyerImages);
        return {
            id: text(first(review.id, review.reviewId, review.feedbackId), 100) || id + ':' + page + ':' + index,
            author: text(first(buyer.buyerTitle, review.author, review.buyerName, review.userName, review.name), 150),
            rating: ratingValue !== undefined && ratingValue <= 5 ? ratingValue : undefined,
            content, text: content,
            date: text(first(review.date, review.reviewDate, review.evalDate, review.createdAt), 80) || undefined,
            images: reviewImages,
            country: text(first(buyer.buyerCountry, review.country, review.buyerCountry), 80) || undefined,
            variant: text(first(review.itemSpecInfo, review.variant, review.skuInfo, review.sku), 500) || undefined,
            source: 'AliExpress'
        };
    }).filter(review => review.content || review.images.length || review.rating !== undefined);
    if (raw.length && !reviews.length) {
        // A changed supplier schema is not evidence that a product has no
        // reviews. Diagnose field names only, and let the UI offer a retry.
        const firstEntry = object(raw[0]);
        const nestedKeys = {};
        for (const key of schemaKeys(firstEntry).slice(0, 12)) {
            const nested = schemaKeys(firstEntry[key]);
            if (nested.length) nestedKeys[key] = nested;
        }
        console.warn('product-content: unsupported review entries', JSON.stringify({ resultKeys: schemaKeys(result), firstEntryKeys: schemaKeys(firstEntry), nestedKeys }));
        return null;
    }
    const base = object(result.base);
    const total = number(first(result.total, result.totalCount, result.reviewCount, wrapper.total, base.total, base.totalCount, base.reviewCount));
    const pageSize = number(first(result.pageSize, result.page_size, wrapper.pageSize, base.pageSize));
    const totalPages = number(first(result.totalPages, result.totalPage, wrapper.totalPages, base.totalPages, base.totalPage));
    if (schemaKeys(base).length && total === undefined && totalPages === undefined) {
        console.warn('product-content: review pagination schema', JSON.stringify({ baseKeys: schemaKeys(base) }));
    }
    let hasMore = raw.length > 0;
    if (typeof result.hasMore === 'boolean') hasMore = result.hasMore;
    else if (totalPages !== undefined) hasMore = page < totalPages;
    else if (pageSize && total !== undefined) hasMore = page * pageSize < total;
    else if (page === 1 && total !== undefined && raw.length >= total) hasMore = false;
    if (!raw.length) hasMore = false;
    return { reviews, page, hasMore, total, source: source(id) };
}

function mountProductDetails(app, { axios, apiHost, apiKey }) {
    const cache = new Map();
    const pending = new Map();
    const host = String(apiHost || DATAHUB_HOST).trim().toLowerCase();
    const MAX_CACHE_ENTRIES = 180;
    const MAX_PENDING = 24;
    function error(res, status, code, message) {
        res.set('Cache-Control', 'no-store');
        return res.status(status).json({ error: code, message, availability: 'unavailable' });
    }
    async function handler(req, res, type) {
        const id = String(req.params.id || '');
        if (!ID_PATTERN.test(id)) return error(res, 400, 'INVALID_PRODUCT_ID', 'Choose a valid product.');
        const pageRaw = req.query.page === undefined ? '1' : String(req.query.page);
        if (type === 'reviews' && (!/^\d{1,3}$/.test(pageRaw) || Number(pageRaw) < 1 || Number(pageRaw) > 100)) {
            return error(res, 400, 'INVALID_PAGE', 'Choose a review page between 1 and 100.');
        }
        if (host !== DATAHUB_HOST) return error(res, 503, 'DETAILS_PROVIDER_UNSUPPORTED', 'Product details are not available from this supplier connection yet.');
        if (!apiKey) return error(res, 503, 'DETAILS_NOT_CONFIGURED', 'Product details are temporarily unavailable.');
        const page = Number(pageRaw);
        const key = type + ':' + id + ':' + (type === 'reviews' ? page : 1);
        const now = Date.now();
        const hit = cache.get(key);
        if (hit && hit.expires > now) {
            cache.delete(key); cache.set(key, hit);
            res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
            return res.json(hit.body);
        }
        if (hit) cache.delete(key);
        if (!pending.has(key) && pending.size >= MAX_PENDING) return error(res, 503, 'DETAILS_BUSY', 'Product details are busy. Please try again shortly.');
        try {
            if (!pending.has(key)) {
                const task = (async () => {
                    const response = await axios.get('https://' + host + (type === 'reviews' ? REVIEW_PATH : DETAIL_PATH), {
                        headers: { 'x-rapidapi-host': host, 'x-rapidapi-key': apiKey },
                        params: type === 'reviews' ? { itemId: id, page: String(page), filter: 'allReviews' } : { itemId: id, currency: 'USD', locale: 'en_US' },
                        timeout: 18000, maxContentLength: 4 * 1024 * 1024, maxRedirects: 0
                    });
                    let body;
                    if (type === 'reviews') body = normalizeReviews(response.data, id, page);
                    else {
                        const product = normalizeProduct(response.data, id, 'USD');
                        if (product) body = { product, capabilities: { reviews: true }, source: 'AliExpress' };
                    }
                    if (!body) {
                        // Log schema keys only: never supplier credentials,
                        // request headers, raw payloads or customer review text.
                        const result = unwrap(response.data);
                        console.warn('product-content: unrecognized supplier schema', JSON.stringify({ type, resultKeys: schemaKeys(result), reviewKeys: schemaKeys(result.reviews) }));
                        throw new Error('UNRECOGNIZED_DETAILS');
                    }
                    cache.set(key, { expires: Date.now() + (type === 'reviews' ? 5 : 15) * 60000, body });
                    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
                    return body;
                })();
                pending.set(key, task);
                // Attach cleanup to both outcomes without making an unobserved
                // rejected promise when the provider fails.
                task.then(() => pending.delete(key), () => pending.delete(key));
            }
            const body = await pending.get(key);
            res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
            return res.json(body);
        } catch (failure) {
            const status = failure.response && failure.response.status;
            if (status === 404) return error(res, 404, 'PRODUCT_DETAILS_NOT_FOUND', 'The supplier has no details for this product.');
            if (status === 429) return error(res, 503, 'DETAILS_BUSY', 'Product details are busy. Please try again shortly.');
            if (failure.code === 'ECONNABORTED' || failure.code === 'ETIMEDOUT') return error(res, 504, 'DETAILS_TIMEOUT', 'The supplier is taking longer than expected. Please try again.');
            return error(res, 502, 'DETAILS_UNAVAILABLE', 'Product details are temporarily unavailable. Please try again.');
        }
    }
    app.get('/api/products/:id/reviews', (req, res) => handler(req, res, 'reviews'));
    app.get('/api/products/:id', (req, res) => handler(req, res, 'details'));
}

module.exports = { mountProductDetails, normalizeProduct, normalizeReviews, mediaUrl, text };
