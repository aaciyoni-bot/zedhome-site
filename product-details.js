/* Shared supplier-backed product experience. Load after the store's main script. */
(function () {
    'use strict';
    if (window.ZambiaProductDetails) return;
    const cache = new Map();
    let state = null;
    const el = (tag, cls, text) => {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text !== undefined) node.textContent = String(text);
        return node;
    };
    const button = (label, cls, action) => {
        const node = el('button', cls, label);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    };
    function mediaUrl(value) {
        if (typeof value !== 'string') return '';
        try {
            const url = new URL(value.startsWith('//') ? 'https:' + value : value);
            return url.protocol === 'https:' ? url.href : '';
        } catch (_) { return ''; }
    }
    function picture(url, alt, cls, lazy) {
        const img = el('img', cls);
        img.alt = alt || 'Product photo';
        img.decoding = 'async';
        if (lazy) img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.src = mediaUrl(url);
        img.addEventListener('error', () => {
            img.replaceWith(el('span', 'pd-image-unavailable', 'Photo unavailable'));
        }, { once: true });
        return img;
    }
    // All physical stores use the same AliExpress supplier. The maintained
    // content service is shared; their existing checkout APIs remain separate.
    const baseURL = () => String(CONFIG.PRODUCT_DETAILS_API_URL || 'https://zedmall-site.vercel.app').replace(/\/$/, '');
    function note(text, cls) { return el('p', 'pd-note ' + (cls || ''), text); }
    function checkedPrice(item) {
        const price = Number(item && (item.price !== undefined ? item.price : item.priceUSD));
        const currency = String(item && (item.currency || (item.priceUSD !== undefined ? 'USD' : '')) || '').toUpperCase();
        if (!Number.isFinite(price) || price <= 0 || !['USD', 'ZMW'].includes(currency)) return null;
        const converted = currency === 'USD' ? usdToKwacha(price) : price;
        return typeof retailZmw === 'function' ? retailZmw(converted) : converted;
    }
    function activePrice(s) {
        if (s.variant) return checkedPrice(s.variant);
        if (s.variants.length) return null;
        return checkedPrice(s.detail) || (Number.isFinite(Number(s.base.priceZmw)) ? Number(s.base.priceZmw) : null);
    }
    function isReady(s) {
        return !!s.detail && !s.loading && !s.error &&
            /^\d{6,}$/.test(String(s.base.id)) && s.detail.available !== false &&
            (!s.variants.length || !!s.variant) && !s.unmappedOptions &&
            (!s.variant || (s.variant.available !== false && !!(s.variant.skuId || s.variant.id))) && activePrice(s) > 0;
    }
    async function request(path, controller) {
        if (!baseURL()) throw new Error('Product information is not connected yet.');
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
            const response = await fetch(baseURL() + path, { signal: controller.signal, headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('Supplier information is temporarily unavailable.');
            const data = await response.json();
            if (data.error) throw new Error('Supplier information is temporarily unavailable.');
            return data;
        } finally { clearTimeout(timeout); }
    }
    const overlay = el('div', 'pd-overlay');
    overlay.hidden = true;
    overlay.id = 'richProductModal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pd-title');
    const panel = el('div', 'pd-panel');
    const header = el('header', 'pd-header');
    const brand = el('span', 'pd-brand', CONFIG.STORE_NAME || 'Product details');
    header.append(brand, button('✕', 'pd-icon-button', () => closeProduct()));
    header.lastChild.setAttribute('aria-label', 'Close product details');
    const scroll = el('div', 'pd-scroll');
    const footer = el('footer', 'pd-footer');
    panel.append(header, scroll, footer);
    overlay.append(panel);
    document.body.append(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeProduct(); });
    // Follow each shop's existing accent without requiring another configuration file.
    const accent = document.querySelector('.bg-zam-green');
    if (accent) {
        const color = getComputedStyle(accent).backgroundColor;
        if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') overlay.style.setProperty('--pd-accent', color);
    }

    function updatePurchase(s) {
        if (state !== s) return;
        const price = activePrice(s);
        const text = price > 0 ? fmtK(price) : (s.variants.length && !s.variant ? 'Choose an option' : 'Price unavailable');
        s.price.textContent = text;
        s.footerPrice.textContent = text;
        let hint = '';
        if (s.preview) hint = 'Preview product — ordering unavailable.';
        else if (s.loading) hint = 'Checking product details and options…';
        else if (s.error) hint = 'Retry product details to check available options.';
        else if (s.detail && s.detail.available === false) hint = 'This product is currently unavailable.';
        else if (s.unmappedOptions) hint = 'This product’s options are not available from the supplier yet.';
        else if (s.variant && s.variant.available === false) hint = 'This option is currently unavailable.';
        else if (s.variants.length && !s.variant) hint = 'Choose your options before adding to your bag.';
        else if (!price) hint = 'The supplier has not provided a price for this option.';
        s.purchaseHint.textContent = hint;
        s.add.disabled = !isReady(s);
        s.add.textContent = s.loading ? 'Loading details…' : 'Add to bag';
        if (s.variant && s.variant.image) {
            const image = mediaUrl(s.variant.image);
            const index = s.images.indexOf(image);
            if (index >= 0) selectImage(s, index);
        }
    }
    function selectImage(s, index) {
        if (!s.images.length || state !== s) return;
        s.imageIndex = (index + s.images.length) % s.images.length;
        s.hero.replaceChildren(picture(s.images[s.imageIndex], s.base.title, 'pd-main-image'));
        s.hero.append(el('span', 'pd-zoom-label', '↗ Enlarge image'));
        s.counter.textContent = (s.imageIndex + 1) + ' / ' + s.images.length;
        [...s.thumbnails.children].forEach((node, i) => node.setAttribute('aria-pressed', String(i === s.imageIndex)));
        if (s.lightbox) {
            s.lightboxImage.replaceChildren(picture(s.images[s.imageIndex], s.base.title, 'pd-lightbox-image'));
            s.lightboxCount.textContent = s.counter.textContent;
        }
    }
    function gallery(s) {
        s.thumbnails.replaceChildren();
        if (!s.images.length) {
            s.hero.replaceChildren(el('span', 'pd-image-unavailable', 'Product photo unavailable'));
            s.counter.textContent = '';
            return;
        }
        s.images.forEach((url, i) => {
            const thumb = button('', 'pd-thumb', () => selectImage(s, i));
            thumb.setAttribute('aria-label', 'View product image ' + (i + 1));
            thumb.append(picture(url, '', '', true));
            s.thumbnails.append(thumb);
        });
        selectImage(s, Math.min(s.imageIndex || 0, s.images.length - 1));
    }
    function closeZoom(s) {
        if (!s || !s.lightbox) return false;
        s.lightbox.remove();
        s.lightbox = null;
        panel.inert = false;
        s.hero.focus();
        return true;
    }
    function zoom(s) {
        if (!s.images.length || s.lightbox) return;
        const box = el('div', 'pd-lightbox');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-label', 'Product image viewer');
        const close = button('✕', 'pd-icon-button pd-lightbox-close', () => closeZoom(s));
        close.setAttribute('aria-label', 'Close image viewer');
        s.lightboxImage = el('div', 'pd-lightbox-picture');
        s.lightboxCount = el('span', 'pd-lightbox-count');
        box.append(close, s.lightboxImage, s.lightboxCount);
        if (s.images.length > 1) {
            const previous = button('‹', 'pd-icon-button pd-lightbox-prev', () => selectImage(s, s.imageIndex - 1));
            previous.setAttribute('aria-label', 'Previous image');
            const next = button('›', 'pd-icon-button pd-lightbox-next', () => selectImage(s, s.imageIndex + 1));
            next.setAttribute('aria-label', 'Next image');
            box.append(previous, next);
        }
        s.lightbox = box;
        panel.inert = true;
        overlay.append(box);
        selectImage(s, s.imageIndex);
        close.focus();
    }
    function options(s) {
        s.optionBox.replaceChildren();
        const variants = s.variants;
        if (!variants.length) return;
        s.optionBox.append(el('h3', 'pd-label', 'Choose your options'));
        if (variants.length === 1) {
            s.variant = variants[0];
            const label = variants[0].label || Object.entries(variants[0].options || {}).map(([key, value]) => key + ': ' + value).join(' · ');
            if (label) s.optionBox.append(el('p', 'pd-single-option', label));
            return;
        }
        const names = [...new Set(variants.flatMap(v => Object.keys(v.options || {})))];
        const canGroup = names.length && variants.every(v => names.every(name => v.options && v.options[name] !== undefined)) &&
            new Set(variants.map(v => JSON.stringify(names.map(n => v.options[n])))).size === variants.length;
        if (canGroup) {
            const selections = {};
            names.forEach((name, index) => {
                const label = el('label', 'pd-option-label', name);
                const select = el('select', 'pd-select');
                select.id = 'pd-option-' + index;
                label.htmlFor = select.id;
                const placeholder = el('option', '', 'Select ' + name.toLowerCase());
                placeholder.value = '';
                select.append(placeholder);
                [...new Set(variants.map(v => String(v.options[name])))].forEach(value => {
                    const option = el('option', '', value);
                    option.value = value;
                    select.append(option);
                });
                select.addEventListener('change', () => {
                    selections[name] = select.value;
                    const matches = variants.filter(v => names.every(n => selections[n] && String(v.options[n]) === selections[n]));
                    s.variant = matches.length === 1 ? matches[0] : null;
                    updatePurchase(s);
                });
                label.append(select);
                s.optionBox.append(label);
            });
        } else {
            const select = el('select', 'pd-select');
            select.setAttribute('aria-label', 'Product option');
            const placeholder = el('option', '', 'Select an option');
            placeholder.value = '';
            select.append(placeholder);
            variants.forEach((v, i) => {
                const label = v.label || Object.entries(v.options || {}).map(([key, value]) => key + ': ' + value).join(' · ') || 'Option ' + (i + 1);
                const option = el('option', '', label + (v.available === false ? ' — unavailable' : ''));
                option.value = String(i);
                select.append(option);
            });
            select.addEventListener('change', () => {
                s.variant = select.value === '' ? null : variants[Number(select.value)];
                updatePurchase(s);
            });
            s.optionBox.append(select);
        }
    }
    function renderDetails(s) {
        const p = s.detail;
        const photos = [...(Array.isArray(p.images) ? p.images : []), ...s.variants.map(v => v.image), s.base.img];
        s.images = [...new Set(photos.map(mediaUrl).filter(Boolean))];
        gallery(s);
        if (p.title) s.title.textContent = p.title;
        s.rating.replaceChildren();
        if (Number(p.rating) > 0 && Number(p.rating) <= 5) {
            s.rating.append(el('span', 'pd-stars', '★'), document.createTextNode(' ' + Number(p.rating).toFixed(1) + ' / 5'));
            if (Number(p.reviewCount) > 0) s.rating.append(document.createTextNode(' · ' + Number(p.reviewCount).toLocaleString() + ' supplier ratings'));
        }
        options(s);
        s.overview.replaceChildren();
        const description = p.descriptionText || p.description;
        if (description) {
            s.overview.append(el('h2', 'pd-section-title', 'About this product'));
            // Supplier content is text only; no supplier HTML, scripts, styles or event handlers enter the page.
            s.overview.append(el('div', 'pd-description', description));
        }
        const videos = (Array.isArray(p.videos) ? p.videos : []).filter(v => mediaUrl(typeof v === 'string' ? v : v.url));
        if (videos.length) {
            s.overview.append(el('h2', 'pd-section-title', 'See it in action'));
            videos.forEach(v => {
                const video = el('video', 'pd-video');
                video.controls = true;
                video.preload = 'none';
                video.playsInline = true;
                video.src = mediaUrl(typeof v === 'string' ? v : v.url);
                if (v.poster && mediaUrl(v.poster)) video.poster = mediaUrl(v.poster);
                video.append(document.createTextNode('Your browser cannot play this video.'));
                s.overview.append(video);
            });
        }
        const detailImages = [...new Set((p.descriptionImages || []).map(mediaUrl).filter(Boolean))];
        if (detailImages.length) {
            s.overview.append(el('h2', 'pd-section-title', 'A closer look'));
            const images = el('div', 'pd-description-images');
            detailImages.forEach((url, i) => images.append(picture(url, 'Product details ' + (i + 1), '', true)));
            s.overview.append(images);
        }
        if (!description && !videos.length && !detailImages.length) s.overview.append(note('The supplier has not provided a detailed description for this product yet.'));
        s.specifications.replaceChildren();
        const specs = Array.isArray(p.specifications) ? p.specifications : [];
        if (specs.length) {
            s.specifications.append(el('h2', 'pd-section-title', 'Product specifications'));
            const table = el('dl', 'pd-specs');
            specs.forEach(spec => {
                if (!spec.name || spec.value === undefined) return;
                const row = el('div', 'pd-spec-row');
                row.append(el('dt', '', spec.name), el('dd', '', spec.value));
                table.append(row);
            });
            s.specifications.append(table);
        } else s.specifications.append(note('No additional specifications were provided by the supplier.'));
        s.status.replaceChildren();
        updatePurchase(s);
    }
    async function loadDetails(s, retry) {
        if (!/^\d{6,}$/.test(String(s.base.id))) {
            s.preview = true;
            s.loading = false;
            s.status.replaceChildren(note('This preview product is not available to order. Choose a product from the live catalogue.'));
            s.overview.replaceChildren(note('Full product information is available for live supplier products.'));
            updatePurchase(s);
            return;
        }
        if (s.controller) s.controller.abort();
        s.controller = new AbortController();
        s.loading = true;
        s.error = null;
        s.status.replaceChildren(note('Loading photos, specifications and product options…', 'pd-loading'));
        updatePurchase(s);
        try {
            const key = baseURL() + '/' + s.base.id;
            const hit = cache.get(key);
            const result = !retry && hit && Date.now() - hit.at < 10 * 60 * 1000 ? hit.data : await request('/api/products/' + encodeURIComponent(s.base.id), s.controller);
            if (state !== s) return;
            if (!result.product || typeof result.product !== 'object') throw new Error('No product details were returned.');
            cache.set(key, { data: result, at: Date.now() });
            s.detail = result.product;
            s.capabilities = result.capabilities || {};
            s.variants = Array.isArray(s.detail.variants) ? s.detail.variants : [];
            s.unmappedOptions = !s.variants.length && Array.isArray(s.detail.options) && s.detail.options.length > 0;
            s.loading = false;
            renderDetails(s);
        } catch (_) {
            if (state !== s) return;
            s.loading = false;
            s.error = true;
            const alert = el('div', 'pd-error');
            alert.setAttribute('role', 'status');
            alert.append(note('We could not load the full product information. Please try again.'), button('Try again', 'pd-secondary-button', () => loadDetails(s, true)));
            s.status.replaceChildren(alert);
            s.overview.replaceChildren(note('Full product details are temporarily unavailable.'));
            s.specifications.replaceChildren(note('Specifications will appear when the supplier information loads.'));
            updatePurchase(s);
        }
    }
    function reviewCard(review) {
        const card = el('article', 'pd-review');
        const top = el('div', 'pd-review-top');
        top.append(el('strong', '', review.author || 'AliExpress customer'));
        if (Number(review.rating) > 0 && Number(review.rating) <= 5) top.append(el('span', 'pd-stars', '★ ' + Number(review.rating).toFixed(1)));
        card.append(top);
        const meta = [review.date, review.country, review.variant].filter(Boolean).join(' · ');
        if (meta) card.append(el('p', 'pd-review-meta', meta));
        if (review.text || review.content) card.append(el('p', 'pd-review-text', review.text || review.content));
        const images = (review.images || []).map(mediaUrl).filter(Boolean);
        if (images.length) {
            const photos = el('div', 'pd-review-images');
            images.forEach(url => {
                const link = el('a');
                link.href = url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.setAttribute('aria-label', 'Open customer photo');
                link.append(picture(url, 'Customer photo', '', true));
                photos.append(link);
            });
            card.append(photos);
        }
        return card;
    }
    async function loadReviews(s, page) {
        if (s.reviewsLoading) return;
        if (s.capabilities.reviews === false) {
            s.reviewStatus.replaceChildren(note('Customer reviews are not available from this supplier connection.'));
            return;
        }
        s.reviewsLoading = true;
        s.reviewStatus.replaceChildren(note('Loading customer reviews…', 'pd-loading'));
        const controller = new AbortController();
        s.reviewController = controller;
        try {
            const result = await request('/api/products/' + encodeURIComponent(s.base.id) + '/reviews?page=' + page, controller);
            if (state !== s) return;
            const reviews = Array.isArray(result.reviews) ? result.reviews : [];
            s.reviewsLoaded = true;
            if (page === 1) s.reviewList.replaceChildren();
            reviews.forEach(review => s.reviewList.append(reviewCard(review)));
            s.reviewStatus.replaceChildren();
            if (!s.reviewList.children.length) s.reviewStatus.append(note('No written reviews are available for this product yet.'));
            if (result.hasMore && reviews.length) s.reviewStatus.append(button('Load more reviews', 'pd-secondary-button', () => loadReviews(s, page + 1)));
        } catch (_) {
            if (state !== s) return;
            s.reviewStatus.replaceChildren(note('Customer reviews could not be loaded.'), button('Retry reviews', 'pd-secondary-button', () => loadReviews(s, page)));
        } finally { s.reviewsLoading = false; }
    }
    function showTab(s, name, focus) {
        s.tabButtons.forEach((node, index) => {
            const selected = node.dataset.tab === name;
            node.setAttribute('aria-selected', String(selected));
            node.tabIndex = selected ? 0 : -1;
            s.tabPanels[index].hidden = !selected;
            if (selected && focus) node.focus();
        });
        if (name === 'reviews' && !s.reviewsLoaded) loadReviews(s, 1);
    }
    function addSelection(s) {
        if (!isReady(s)) return;
        const skuId = s.variant ? String(s.variant.skuId || s.variant.id || '') : '';
        const productId = String(s.base.id);
        // Hex encoding keeps existing inline cart controls safe for arbitrary supplier SKU identifiers.
        const token = [...new TextEncoder().encode(skuId)].map(n => n.toString(16).padStart(2, '0')).join('');
        const id = skuId ? productId + '__sku_' + token : productId;
        const selectedOptions = s.variant && s.variant.options || {};
        const optionLabel = s.variant && (s.variant.label || Object.entries(selectedOptions).map(([key, value]) => key + ': ' + value).join(' · '));
        const title = String(s.detail.title || s.base.title) + (optionLabel ? ' — ' + optionLabel : '');
        const item = {
            id, productId, skuId, selectedOptions,
            skuAttr: s.variant && s.variant.skuAttr || '',
            title, priceZmw: activePrice(s),
            img: mediaUrl(s.variant && s.variant.image) || s.images[0] || '',
            qty: s.quantity,
            sourceUrl: mediaUrl(s.detail.sourceUrl || s.detail.source && s.detail.source.url) || ''
        };
        const existing = cart.find(entry => entry.id === id);
        if (existing) {
            existing.qty += s.quantity;
            existing.priceZmw = item.priceZmw;
        } else cart.push(item);
        try { saveCart(); } catch (_) { renderCart(); }
        closeProduct();
        showToast('Added to your bag');
    }
    function build(s) {
        scroll.replaceChildren();
        footer.replaceChildren();
        const top = el('div', 'pd-top');
        const imageColumn = el('section', 'pd-gallery');
        s.hero = button('', 'pd-hero', () => zoom(s));
        s.hero.setAttribute('aria-label', 'Enlarge product image');
        s.counter = el('span', 'pd-image-counter');
        s.thumbnails = el('div', 'pd-thumbnails');
        imageColumn.append(s.hero, s.counter, s.thumbnails);
        const summary = el('section', 'pd-summary');
        summary.append(el('p', 'pd-eyebrow', 'Discover the details'));
        s.title = el('h1', 'pd-title', s.base.title);
        s.title.id = 'pd-title';
        s.rating = el('div', 'pd-rating');
        s.price = el('div', 'pd-price');
        const priceMeta = note('Prices in Zambian kwacha. Checkout fees are shown in your bag.');
        s.optionBox = el('div', 'pd-options');
        const quantityRow = el('div', 'pd-quantity-row');
        quantityRow.append(el('label', 'pd-label', 'Quantity'));
        const stepper = el('div', 'pd-stepper');
        const count = el('output', '', s.quantity);
        s.quantityOutput = count;
        count.setAttribute('aria-label', 'Quantity');
        count.setAttribute('aria-live', 'polite');
        const minus = button('−', '', () => { s.quantity = Math.max(1, s.quantity - 1); count.textContent = s.quantity; });
        minus.setAttribute('aria-label', 'Decrease quantity');
        const plus = button('+', '', () => { s.quantity = Math.min(20, s.quantity + 1); count.textContent = s.quantity; });
        plus.setAttribute('aria-label', 'Increase quantity');
        stepper.append(minus, count, plus);
        quantityRow.append(stepper);
        const delivery = el('div', 'pd-delivery');
        delivery.append(el('strong', '', 'Delivery to Zambia'), note('Delivery times and costs depend on the product and destination. Contact the store to confirm before ordering.'));
        summary.append(s.title, s.rating, s.price, priceMeta, s.optionBox, quantityRow, delivery);
        s.status = el('div', 'pd-status');
        s.status.setAttribute('aria-live', 'polite');
        top.append(imageColumn, summary);
        const tabs = el('div', 'pd-tabs');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Product information');
        s.overview = el('section', 'pd-tab-panel');
        s.specifications = el('section', 'pd-tab-panel');
        const reviews = el('section', 'pd-tab-panel');
        reviews.append(el('h2', 'pd-section-title', 'Customer reviews'), note('Reviews are from AliExpress customers and may include purchases made outside this store.'));
        s.reviewList = el('div', 'pd-review-list');
        s.reviewStatus = el('div', 'pd-review-status');
        s.reviewStatus.setAttribute('aria-live', 'polite');
        reviews.append(s.reviewList, s.reviewStatus);
        s.tabPanels = [s.overview, s.specifications, reviews];
        s.tabButtons = ['overview', 'specifications', 'reviews'].map((name, index) => {
            const tab = button(['Overview', 'Specifications', 'Reviews'][index], 'pd-tab', () => showTab(s, name));
            tab.dataset.tab = name;
            tab.id = 'pd-tab-' + name;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', 'pd-panel-' + name);
            tab.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                showTab(s, ['overview', 'specifications', 'reviews'][next], true);
            });
            s.tabPanels[index].id = 'pd-panel-' + name;
            s.tabPanels[index].setAttribute('role', 'tabpanel');
            s.tabPanels[index].setAttribute('aria-labelledby', tab.id);
            tabs.append(tab);
            return tab;
        });
        const content = el('div', 'pd-content');
        content.append(tabs, ...s.tabPanels);
        scroll.append(top, s.status, content);
        const footerInfo = el('div', 'pd-footer-info');
        s.footerPrice = el('strong', 'pd-footer-price');
        s.purchaseHint = el('span', 'pd-purchase-hint');
        s.purchaseHint.id = 'pd-purchase-hint';
        s.purchaseHint.setAttribute('aria-live', 'polite');
        footerInfo.append(s.footerPrice, s.purchaseHint);
        s.add = button('Loading details…', 'pd-add-button', () => addSelection(s));
        s.add.setAttribute('aria-describedby', 'pd-purchase-hint');
        footer.append(footerInfo, s.add);
        gallery(s);
        showTab(s, 'overview');
    }
    window.openProduct = function (id) {
        const base = products.find(p => String(p.id) === String(id));
        if (!base) return;
        const returnFocus = state ? state.returnFocus : document.activeElement;
        const oldOverflow = state ? state.oldOverflow : document.body.style.overflow;
        if (state) {
            if (state.controller) state.controller.abort();
            if (state.reviewController) state.reviewController.abort();
            closeZoom(state);
        }
        currentProduct = base;
        state = {
            base, returnFocus, oldOverflow, quantity: 1, detail: null, variant: null,
            variants: [], images: [mediaUrl(base.img)].filter(Boolean), imageIndex: 0,
            loading: true, capabilities: {}, reviewsLoaded: false
        };
        build(state);
        overlay.hidden = false;
        scroll.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.body.style.overflow = 'hidden';
        header.lastChild.focus();
        loadDetails(state);
    };
    window.closeProduct = function () {
        if (!state) return;
        const old = state;
        if (old.controller) old.controller.abort();
        if (old.reviewController) old.reviewController.abort();
        overlay.querySelectorAll('video').forEach(video => video.pause());
        closeZoom(old);
        state = null;
        overlay.hidden = true;
        document.body.style.overflow = old.oldOverflow;
        if (old.returnFocus && old.returnFocus.isConnected) old.returnFocus.focus();
    };
    // Grid shortcuts must also check supplier options; never silently buy the first SKU.
    window.addToCart = function (id, quantity) {
        openProduct(id);
        if (state && quantity > 1) { state.quantity = Math.min(20, quantity); state.quantityOutput.textContent = state.quantity; }
    };
    document.addEventListener('keydown', event => {
        const s = state;
        if (!s) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!closeZoom(s)) closeProduct();
        }
        if (s.lightbox && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            selectImage(s, s.imageIndex + (event.key === 'ArrowRight' ? 1 : -1));
        }
        if (event.key === 'Tab') {
            const scope = s.lightbox || panel;
            const candidates = [...scope.querySelectorAll('button:not([disabled]),a[href],select:not([disabled]),video[controls],[tabindex="0"]')].filter(n => n.getClientRects().length && !n.closest('[hidden]'));
            const first = candidates[0], last = candidates[candidates.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    }, true);
    window.ZambiaProductDetails = { version: '1.0.0' };
})();
