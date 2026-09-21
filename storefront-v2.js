/* Future Studio commerce shell. Product, cart, price and checkout data remain owned by the store. */
(function () {
    'use strict';
    if (window.ZambiaStorefront || typeof CONFIG === 'undefined') return;
    const grid = document.getElementById('productGrid');
    const header = document.querySelector('body > header');
    const hero = document.getElementById('heroSection');
    if (!grid || !header || !hero) return;
    const $id = id => document.getElementById(id);
    const node = (tag, cls, text) => {
        const result = document.createElement(tag);
        if (cls) result.className = cls;
        if (text !== undefined) result.textContent = String(text);
        return result;
    };
    const icon = name => {
        const result = node('i', 'fas ' + name);
        result.setAttribute('aria-hidden', 'true');
        return result;
    };
    const btn = (text, cls, action, iconName) => {
        const result = node('button', cls);
        result.type = 'button';
        if (iconName) result.append(icon(iconName));
        if (text) result.append(node('span', '', text));
        result.addEventListener('click', action);
        return result;
    };
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function photoURL(value) {
        try {
            const raw = String(value || '').trim();
            if (!raw || !/^(https:\/\/|\/\/)/i.test(raw)) return '';
            const url = new URL(raw.replace(/^\/\//, 'https://'));
            return url.protocol === 'https:' ? url.href : '';
        } catch (_) { return ''; }
    }
    const isLive = p => /^\d{6,}$/.test(String(p.id));
    const stripEmoji = text => String(text).replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').trim();
    const brand = CONFIG.STORE_NAME || 'Shop';
    const profiles = {
        ZedMall: ['Global finds. Local possibilities.', 'Find your next', 'everyday favourite.', 'Discover products for your home, your style and your everyday life. Global choice, with prices in kwacha.', 'Everyday discoveries', 'Search products, brands and everyday essentials…'],
        Mwanako: ['For you and your little one.', 'Little moments.', 'Big love.', 'Thoughtful finds for your growing family. Explore baby essentials, nursery favourites and a little something for mum.', 'For every little moment', 'Search feeding, baby clothes, nursery and more…'],
        Chipazi: ['Technology for your everyday.', 'Good tech.', 'More possibilities.', 'Make more of every day with phones, audio and useful gadgets. Find the details and choose the tech that fits your life.', 'Find your next upgrade', 'Search phones, earbuds, chargers and more…'],
        Kayachi: ['Make yourself at home.', 'Make room', 'for better living.', 'Find the useful, the beautiful and the everyday essentials. Thoughtful choices for the place you call home.', 'A little more like home', 'Search kitchen, storage, lighting and more…'],
        Zuwango: ['A brighter everyday.', 'Power your day.', 'Brighten tomorrow.', 'Explore solar, backup power and practical lighting. Compare product specifications to find the right fit for your needs.', 'Power for your everyday', 'Search solar panels, lights, power banks and more…'],
        AgroMall: ['For the things you grow.', 'Start small.', 'Grow something great.', 'Tools, growing essentials and practical finds for your garden and farm. Explore the details before choosing what works for you.', 'Ready for your next season', 'Search seeds, farm tools, irrigation and more…'],
        ZedGlow: ['Beauty on your own terms.', 'Your look.', 'Your kind of glow.', 'Discover hair, beauty and finishing touches that feel like you. Explore your favourites, with prices in kwacha.', 'Find your everyday glow', 'Search hair, skincare, makeup and more…']
    };
    const profile = profiles[brand] || profiles.ZedMall;
    const fallbackIcons = ['fa-mobile-screen-button', 'fa-shirt', 'fa-house', 'fa-clock', 'fa-shapes', 'fa-wand-magic-sparkles', 'fa-solar-panel', 'fa-futbol'];
    const seen = new Set();
    const categories = [...header.querySelectorAll('button[onclick*="searchCategory"]')].map((button, index) => {
        const match = (button.getAttribute('onclick') || '').match(/searchCategory\(['"]([^'"]+)['"]\)/);
        if (!match || seen.has(match[1])) return null;
        seen.add(match[1]);
        const existingIcon = button.querySelector('i');
        return { query: match[1], label: stripEmoji(button.textContent), icon: existingIcon ? [...existingIcon.classList].find(cls => cls.startsWith('fa-')) : fallbackIcons[index % fallbackIcons.length] };
    }).filter(Boolean);
    const ui = { query: '', budget: false, loaded: [], home: [], sort: 'featured', categoryButtons: [], featureSignature: '', cartFocus: null, cartOverflow: '' };
    const main = grid.closest('main');
    const catalog = main.parentElement;
    const scrollCatalog = () => catalog.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.body.classList.add('sf-store');
    document.documentElement.style.colorScheme = 'light';
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = '#06231a';
    if (!document.querySelector('link[data-sf-font]')) {
        const font = node('link');
        font.rel = 'stylesheet';
        font.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap';
        font.dataset.sfFont = 'true';
        document.head.append(font);
    }

    // Build an accessible commerce header while retaining the loyalty wallet slot.
    const wallet = $id('vpSlot');
    const oldSearchValue = $id('searchInput') ? $id('searchInput').value : '';
    const oldLogo = header.querySelector('a img');
    const logoSrc = oldLogo ? oldLogo.getAttribute('src') : 'icon-192.png';
    const announcement = header.previousElementSibling;
    if (announcement && announcement.tagName === 'DIV') {
        announcement.className = 'sf-announcement';
        const inner = node('div', 'sf-container');
        inner.append(node('span', '', 'A world of possibilities. Made for Zambia.'), node('span', '', 'Shop in Zambian kwacha'));
        announcement.replaceChildren(inner);
    }
    header.className = 'sf-header';
    header.replaceChildren();
    const headerMain = node('div', 'sf-container sf-header-main');
    const brandLink = node('a', 'sf-brand');
    brandLink.href = '#';
    brandLink.setAttribute('aria-label', brand + ' home');
    brandLink.addEventListener('click', event => { event.preventDefault(); goHome(); });
    const logo = node('img');
    logo.src = logoSrc;
    logo.alt = '';
    logo.width = 42;
    logo.height = 42;
    const brandText = node('span');
    brandText.append(node('strong', '', brand), node('em', '', profile[0]));
    brandLink.append(logo, brandText);
    const nav = node('nav', 'sf-main-nav');
    nav.setAttribute('aria-label', 'Main navigation');
    nav.append(btn('Shop', 'sf-nav-active', () => { goHome(); }), btn('Categories', '', () => $id('sfCategories').scrollIntoView({ behavior: 'smooth' })), btn('How it works', '', () => $id('how-it-works').scrollIntoView({ behavior: 'smooth' })));
    const form = node('form', 'sf-search');
    form.setAttribute('role', 'search');
    const searchLabel = node('label', 'sf-sr-only', 'Search products');
    searchLabel.htmlFor = 'searchInput';
    const search = node('input');
    search.id = 'searchInput';
    search.type = 'search';
    search.placeholder = profile[5];
    search.value = oldSearchValue;
    search.autocomplete = 'off';
    const searchButton = node('button');
    searchButton.type = 'submit';
    searchButton.setAttribute('aria-label', 'Search products');
    searchButton.append(icon('fa-magnifying-glass'));
    form.append(searchLabel, search, searchButton);
    form.addEventListener('submit', event => { event.preventDefault(); doSearch(); });
    const actions = node('div', 'sf-header-actions');
    if (wallet) actions.append(wallet);
    const bag = btn('Bag', 'sf-cart-button', () => toggleCart(true), 'fa-bag-shopping');
    bag.setAttribute('aria-label', 'Open shopping bag');
    const count = node('span', 'hidden', '0');
    count.id = 'cartCount';
    bag.append(count);
    actions.append(bag);
    headerMain.append(brandLink, nav, form, actions);
    const categoryNav = node('nav', 'sf-category-nav');
    categoryNav.setAttribute('aria-label', 'Quick product categories');
    const categoryNavInner = node('div', 'sf-container');
    categoryNavInner.append(btn('All products', '', () => goHome(), 'fa-border-all'));
    categories.slice(0, 7).forEach(category => {
        const button = btn(category.label, '', () => searchCategory(category.query));
        button.dataset.category = category.query;
        ui.categoryButtons.push(button);
        categoryNavInner.append(button);
    });
    categoryNav.append(categoryNavInner);
    header.append(headerMain, categoryNav);

    // A photographic product-led hero uses only products returned by this store.
    hero.className = 'sf-hero';
    hero.replaceChildren();
    const heroInner = node('div', 'sf-container sf-hero-inner');
    const heroCopy = node('div', 'sf-hero-copy');
    const headline = node('h1', '', profile[1]);
    headline.append(document.createTextNode(' '), node('span', '', profile[2]));
    const heroActions = node('div', 'sf-hero-actions');
    heroActions.append(btn('Explore the collection', 'sf-primary', scrollCatalog, 'fa-arrow-right'), btn('Find your category', 'sf-text-link', () => $id('sfCategories').scrollIntoView({ behavior: 'smooth' })));
    heroActions.firstElementChild.append(heroActions.firstElementChild.firstElementChild);
    const trust = node('div', 'sf-hero-trust');
    [['fa-coins', 'Prices in kwacha'], ['fa-list-check', 'Detailed product info'], ['fa-mobile-screen-button', 'Shop on your phone']].forEach(([name, label]) => {
        const item = node('span');
        item.append(icon(name), document.createTextNode(label));
        trust.append(item);
    });
    heroCopy.append(node('p', 'sf-eyebrow', 'Your next discovery starts here'), headline, node('p', 'sf-hero-description', profile[3]), heroActions, trust);
    const showcase = node('div', 'sf-hero-showcase');
    const featureMain = node('div', 'sf-feature-main');
    const featureSide = node('div', 'sf-feature-side');
    const featureLoading = node('p', 'sf-feature-loading', 'Loading the collection…');
    showcase.append(featureLoading, featureMain, featureSide);
    heroInner.append(heroCopy, showcase);
    hero.append(heroInner);

    const categorySection = node('section', 'sf-categories');
    categorySection.id = 'sfCategories';
    const categoryContainer = node('div', 'sf-container');
    const categoryHeading = node('div', 'sf-section-heading');
    categoryHeading.append(node('h2', '', 'Find your kind of good.'), node('p', '', 'Explore by category'));
    const categoryCards = node('div', 'sf-category-cards');
    categories.slice(0, 6).forEach(category => {
        const button = btn('', 'sf-category-card', () => searchCategory(category.query));
        button.dataset.category = category.query;
        button.append(icon(category.icon || 'fa-box-open'), node('strong', '', category.label), node('small', '', 'Explore'), icon('fa-arrow-right'));
        ui.categoryButtons.push(button);
        categoryCards.append(button);
    });
    categoryContainer.append(categoryHeading, categoryCards);
    categorySection.append(categoryContainer);
    hero.after(categorySection);

    catalog.className = 'sf-container sf-catalog-layout';
    catalog.id = 'sfCatalog';
    main.className = 'sf-catalog-main';
    let sidebar = catalog.querySelector('aside');
    if (!sidebar) { sidebar = node('aside'); catalog.prepend(sidebar); }
    sidebar.className = 'sf-sidebar';
    sidebar.id = 'sfFilters';
    sidebar.replaceChildren();
    const filters = node('div', 'sf-filter-panel');
    const filterTop = node('div', 'sf-filter-heading');
    filterTop.append(node('h3', '', 'Shop by category'), btn('', 'sf-filter-close', () => toggleFilters(false), 'fa-xmark'));
    filterTop.lastChild.setAttribute('aria-label', 'Close categories');
    const sidebarCategories = node('div', 'sf-sidebar-category');
    const allCategory = btn('All products', '', () => { toggleFilters(false); goHome(); }, 'fa-border-all');
    allCategory.dataset.category = '';
    ui.categoryButtons.push(allCategory);
    sidebarCategories.append(allCategory);
    categories.forEach(category => {
        const button = btn(category.label, '', () => { toggleFilters(false); searchCategory(category.query); }, category.icon || 'fa-box-open');
        button.dataset.category = category.query;
        ui.categoryButtons.push(button);
        sidebarCategories.append(button);
    });
    filters.append(filterTop, sidebarCategories, node('p', 'sf-filter-note', 'Open a product and choose its options to see the current price in kwacha.'));
    sidebar.append(filters);
    const filterBackdrop = node('button', 'sf-filter-backdrop');
    filterBackdrop.hidden = true;
    filterBackdrop.type = 'button';
    filterBackdrop.setAttribute('aria-label', 'Close product categories');
    filterBackdrop.addEventListener('click', () => toggleFilters(false));
    document.body.append(filterBackdrop);
    function toggleFilters(open) {
        const wasOpen = sidebar.classList.contains('is-open');
        sidebar.classList.toggle('is-open', open);
        document.body.classList.toggle('sf-filters-open', open);
        filterBackdrop.hidden = !open;
        $id('sfFilterButton').setAttribute('aria-expanded', String(open));
        if (open) sidebar.querySelector('button').focus();
        else if (wasOpen) $id('sfFilterButton').focus();
    }
    const oldResults = $id('resultsTitle').parentElement;
    const results = node('div', 'sf-results-header');
    const resultsCopy = node('div', 'sf-results-copy');
    const resultTitle = node('h2', '', profile[4]);
    resultTitle.id = 'resultsTitle';
    const resultCount = node('span');
    resultCount.id = 'resultsCount';
    resultsCopy.append(node('p', 'sf-eyebrow', 'The collection'), resultTitle, resultCount);
    const resultsActions = node('div', 'sf-results-actions');
    const filterButton = btn('Categories', 'sf-mobile-filter', () => toggleFilters(!sidebar.classList.contains('is-open')), 'fa-border-all');
    filterButton.id = 'sfFilterButton';
    filterButton.setAttribute('aria-controls', 'sfFilters');
    filterButton.setAttribute('aria-expanded', 'false');
    const sortLabel = node('label', 'sf-sort-label', 'Sort by');
    sortLabel.htmlFor = 'sfSort';
    const sort = node('select');
    sort.id = 'sfSort';
    [['featured', 'Recommended'], ['title', 'Name: A to Z'], ['rating', 'Highest rated']].forEach(([value, label]) => {
        const option = node('option', '', label);
        option.value = value;
        sort.append(option);
    });
    sort.addEventListener('change', () => { ui.sort = sort.value; renderGrid(); });
    sortLabel.append(sort);
    resultsActions.append(filterButton, sortLabel);
    results.append(resultsCopy, resultsActions);
    oldResults.replaceWith(results);
    grid.className = 'sf-product-grid';
    grid.setAttribute('aria-live', 'polite');
    const budgetStrip = $id('budgetStrip') || $id('under25Strip');
    if (budgetStrip) {
        // Search and static catalogue prices can be conditional supplier promotions.
        // Only the detail flow can verify a purchasable SKU price.
        budgetStrip.hidden = true;
        budgetStrip.replaceChildren();
    }

    function productCard(p) {
        const photo = photoURL(p.img);
        const rating = Number(p.rating);
        return '<article class="sf-product">' +
            '<button type="button" class="sf-product-image" data-sf-product="' + esc(p.id) + '" aria-label="View ' + esc(p.title) + '">' +
            (photo ? '<img src="' + esc(photo) + '" alt="' + esc(p.title) + '" loading="lazy" decoding="async">' : '<span class="sf-photo-unavailable">Photo unavailable</span>') +
            (!isLive(p) ? '<span class="sf-preview-label">Preview only</span>' : '') + '</button>' +
            '<div class="sf-product-info"><button type="button" class="sf-product-title" data-sf-product="' + esc(p.id) + '">' + esc(p.title) + '</button>' +
            '<div class="sf-product-rating">' + (rating > 0 && rating <= 5 ? '<span><i class="fas fa-star" aria-hidden="true"></i> ' + rating.toFixed(1) + '</span>' : '<span>Explore product details</span>') +
            (Number(p.orders) > 0 ? '<span>' + Number(p.orders).toLocaleString() + ' orders</span>' : '') + '</div>' +
            '<div class="sf-product-bottom"><span class="sf-product-price sf-price-prompt">Choose options for price</span>' +
            '<button type="button" class="sf-view-product" data-sf-product="' + esc(p.id) + '" aria-label="View product options for ' + esc(p.title) + '"><i class="fas fa-arrow-right" aria-hidden="true"></i></button></div></div></article>';
    }
    window.productCardHtml = productCard;
    function wirePhotos(scope) {
        scope.querySelectorAll('img:not([data-sf-wired])').forEach(image => {
            image.dataset.sfWired = 'true';
            image.addEventListener('error', () => { image.replaceWith(node('span', 'sf-photo-unavailable', 'Photo unavailable')); }, { once: true });
        });
    }
    function clickProduct(event) {
        const target = event.target.closest('[data-sf-product]');
        if (!target) return;
        event.preventDefault();
        const id = target.dataset.sfProduct;
        openProduct(id);
    }
    grid.addEventListener('click', clickProduct);
    function renderGrid() {
        let list = ui.loaded.slice();
        if (ui.sort === 'title') list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
        if (ui.sort === 'rating') list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
        grid.innerHTML = list.map(productCard).join('');
        if (!list.length) {
            const empty = node('div', 'sf-empty');
            empty.append(icon('fa-magnifying-glass'), node('h3', '', 'Let’s find something you love.'), node('p', '', 'Try another search or explore a category.'), btn('Browse all products', 'sf-primary', () => goHome()));
            grid.append(empty);
        }
        resultCount.textContent = list.length + (list.length !== ui.loaded.length ? ' of ' + ui.loaded.length + ' loaded products' : ' products to explore');
        wirePhotos(grid);
    }
    function featureCard(p, label) {
        const card = btn('', '', () => openProduct(p.id));
        card.setAttribute('aria-label', 'View ' + p.title);
        const image = node('img');
        image.src = photoURL(p.img);
        image.alt = p.title;
        image.decoding = 'async';
        const info = node('div', 'sf-feature-info');
        info.append(node('small', '', label), node('span', '', p.title), node('strong', 'sf-price-prompt', 'Choose options for price'));
        card.append(image, info);
        return card;
    }
    function updateFeatures() {
        const featured = ui.home.filter(p => isLive(p) && photoURL(p.img)).slice(0, 3);
        const signature = featured.map(p => p.id).join(',');
        if (!signature || ui.featureSignature === signature) {
            if (!signature) featureLoading.textContent = 'The collection is loading. Browse below to explore available products.';
            return;
        }
        ui.featureSignature = signature;
        featureLoading.hidden = true;
        featureMain.replaceChildren(featureCard(featured[0], 'Discover something good'));
        featureSide.replaceChildren(...featured.slice(1).map(p => featureCard(p, 'From the collection')));
        wirePhotos(showcase);
    }
    function refreshContext(query, budget) {
        ui.query = query || '';
        ui.budget = !!budget;
        const category = categories.find(item => item.query === ui.query);
        resultTitle.textContent = category ? category.label : query ? 'Results for “' + query + '”' : profile[4];
        hero.hidden = !!query || !!budget;
        categorySection.hidden = !!query || !!budget;
        ui.categoryButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === ui.query && !budget)));
    }
    const originalRenderProducts = window.renderProducts;
    window.renderProducts = function (query, budget, append, appended) {
        // Keep each store's catalogue bookkeeping; replace presentation only.
        originalRenderProducts.apply(this, arguments);
        if (append) {
            const ids = new Set(ui.loaded.map(p => String(p.id)));
            ui.loaded.push(...(appended || []).filter(p => !ids.has(String(p.id))));
        } else {
            ui.loaded = products.slice();
            refreshContext(query, budget);
            if (!query && !budget) { ui.home = products.slice(); updateFeatures(); }
        }
        renderGrid();
        if (!append) requestAnimationFrame(() => {
            if (query || budget) catalog.scrollIntoView({ behavior: 'instant', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'instant' });
        });
    };
    if (typeof window.appendProducts === 'function') {
        const originalAppend = window.appendProducts;
        window.appendProducts = function (items) {
            originalAppend.apply(this, arguments);
            const ids = new Set(ui.loaded.map(p => String(p.id)));
            ui.loaded.push(...items.filter(p => !ids.has(String(p.id))));
            renderGrid();
        };
    }
    ['renderBudgetStrip', 'renderUnder25Strip'].forEach(name => {
        if (typeof window[name] === 'function') window[name] = function () {
            if (budgetStrip) budgetStrip.hidden = true;
        };
    });
    ['showBudget', 'showUnder25'].forEach(name => {
        if (typeof window[name] === 'function') window[name] = function () { goHome(); };
    });

    // Shared typography, improved focus labels and presentation for the existing cart/checkout.
    ['how-it-works', 'about', 'faq', 'support'].forEach(id => {
        const section = $id(id);
        if (section) section.classList.add('sf-info-section');
    });
    // Replace legacy decorative emoji with the store's existing icon library.
    const legacyIcons = { '🛒': 'fa-bag-shopping', '📲': 'fa-mobile-screen-button', '📦': 'fa-box-open', '🎉': 'fa-circle-check', '🔒': 'fa-lock', '🛡️': 'fa-shield-halved', '💬': 'fa-comments', '💸': 'fa-coins', '✅': 'fa-circle-check', '📧': 'fa-envelope', '🤝': 'fa-handshake' };
    document.querySelectorAll('.sf-info-section div,.sf-info-section span').forEach(element => {
        if (element.children.length) return;
        const replacement = legacyIcons[element.textContent.trim()];
        if (replacement) element.replaceChildren(icon(replacement));
    });
    const aboutTitle = $id('about') && $id('about').querySelector('h2,h3');
    if (aboutTitle) aboutTitle.textContent = 'About ' + brand;
    document.querySelectorAll('.sf-info-section h2,.sf-info-section h3').forEach(heading => {
        [...heading.childNodes].filter(child => child.nodeType === 3).forEach(child => {
            child.textContent = child.textContent.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
        });
    });
    const footer = document.querySelector('body > footer');
    if (footer) footer.classList.add('sf-store-footer');
    const cartDrawer = $id('cartDrawer');
    if (cartDrawer) {
        cartDrawer.setAttribute('role', 'dialog');
        cartDrawer.setAttribute('aria-label', 'Your shopping bag');
        cartDrawer.setAttribute('aria-modal', 'true');
        cartDrawer.setAttribute('aria-hidden', 'true');
        cartDrawer.inert = true;
        const close = cartDrawer.querySelector('button[onclick*="toggleCart(false)"]');
        if (close) close.setAttribute('aria-label', 'Close shopping bag');
        const originalToggleCart = window.toggleCart;
        window.toggleCart = function (open) {
            originalToggleCart.apply(this, arguments);
            cartDrawer.setAttribute('aria-hidden', String(!open));
            cartDrawer.inert = !open;
            if (open) {
                ui.cartFocus = document.activeElement;
                ui.cartOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                if (close) close.focus();
            } else {
                document.body.style.overflow = ui.cartOverflow;
                if (ui.cartFocus && ui.cartFocus.isConnected) ui.cartFocus.focus();
            }
        };
    }
    const checkout = $id('checkoutModal');
    if (checkout) {
        checkout.setAttribute('role', 'dialog');
        checkout.setAttribute('aria-modal', 'true');
        checkout.setAttribute('aria-label', 'Checkout');
        const originalOpenCheckout = window.openCheckout;
        const originalCloseCheckout = window.closeCheckout;
        window.openCheckout = function () {
            originalOpenCheckout.apply(this, arguments);
            if (!checkout.classList.contains('hidden')) {
                ui.checkoutFocus = document.activeElement;
                ui.checkoutOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                const first = checkout.querySelector('button, input');
                if (first) first.focus({ preventScroll: true });
            }
        };
        window.closeCheckout = function () {
            const wasOpen = !checkout.classList.contains('hidden');
            originalCloseCheckout.apply(this, arguments);
            if (wasOpen) {
                document.body.style.overflow = ui.checkoutOverflow || '';
                if (ui.checkoutFocus && ui.checkoutFocus.isConnected) ui.checkoutFocus.focus();
            }
        };
        checkout.querySelectorAll('button[onclick*="closeCheckout"]').forEach(button => button.setAttribute('aria-label', 'Close checkout'));
    }
    const originalRenderCart = window.renderCart;
    window.renderCart = function () {
        originalRenderCart.apply(this, arguments);
        const totalItems = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
        bag.setAttribute('aria-label', 'Open shopping bag, ' + totalItems + (totalItems === 1 ? ' item' : ' items'));
        if ($id('cartItems')) {
            $id('cartItems').querySelectorAll('button[onclick]').forEach(button => {
                const action = button.getAttribute('onclick') || '';
                button.setAttribute('aria-label', action.includes('removeFromCart') ? 'Remove item from bag' : action.includes(',-1') ? 'Decrease item quantity' : 'Increase item quantity');
            });
        }
    };
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (sidebar.classList.contains('is-open')) toggleFilters(false);
            else if (checkout && !checkout.classList.contains('hidden')) closeCheckout();
            else if (cartDrawer && cartDrawer.getAttribute('aria-hidden') === 'false') toggleCart(false);
        }
        if (event.key === 'Tab') {
            const scope = sidebar.classList.contains('is-open') ? sidebar : checkout && !checkout.classList.contains('hidden') ? checkout : cartDrawer && cartDrawer.getAttribute('aria-hidden') === 'false' ? cartDrawer : null;
            if (!scope) return;
            const focusable = [...scope.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]')].filter(item => item.getClientRects().length);
            const first = focusable[0], last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    renderCart();
    if (products.length) {
        ui.loaded = products.slice();
        ui.home = products.slice();
        refreshContext('', false);
        renderGrid();
        updateFeatures();
    }
    window.ZambiaStorefront = { version: '2026.09.21', brand };
})();
