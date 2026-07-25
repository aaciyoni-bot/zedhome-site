const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Environment variables (Vercel -> Project Settings -> Environment Variables):
//   RAPIDAPI_KEY   - required. RapidAPI key for the product search API.
//   RAPIDAPI_HOST  - optional. Defaults to the Aliexpress DataHub host.
//   PAWAPAY_TOKEN  - optional. pawaPay API token; when absent, /api/pay
//                    reports simulated mode and the storefront falls back to
//                    its built-in payment simulation.
//   PAWAPAY_ENV    - optional. 'sandbox' (default) or 'production'.
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const API_HOST = process.env.RAPIDAPI_HOST || 'aliexpress-datahub.p.rapidapi.com';
const PAWAPAY_TOKEN = process.env.PAWAPAY_TOKEN;
const PAWAPAY_BASE = process.env.PAWAPAY_ENV === 'production'
    ? 'https://api.pawapay.io'
    : 'https://api.sandbox.pawapay.io';

app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        service: 'zedhome-backend',
        keyConfigured: Boolean(RAPIDAPI_KEY),
        apiHost: API_HOST,
        paymentsConfigured: Boolean(PAWAPAY_TOKEN),
        paymentsEnv: process.env.PAWAPAY_ENV === 'production' ? 'production' : 'sandbox',
        veripointsConfigured: Boolean(process.env.VERIPOINTS_API && process.env.VERIPOINTS_SERVER_KEY)
    });
});

/* =====================================================================
   PRODUCT SEARCH (with in-memory cache to preserve RapidAPI quota)
   ===================================================================== */

// Flattens an Aliexpress DataHub search result into the simple shape the
// storefront expects: { products: [{ id, title, price, image, orders, rating }] }
function mapDataHubResponse(data) {
    const list = data && data.result && data.result.resultList;
    if (!Array.isArray(list)) return null;
    const products = list.map(entry => {
        const it = entry.item || {};
        const sku = (it.sku && it.sku.def) || {};
        return {
            id: String(it.itemId || ''),
            title: it.title || '',
            price: sku.promotionPrice || sku.price || 0,
            original_price: sku.price || 0,
            image: it.image || '',
            orders: parseInt(it.sales) || 0,
            rating: parseFloat(it.averageStarRate) || 0
        };
    }).filter(p => p.id && p.title);
    return { products };
}

// Same searches repeat constantly (home page, categories, budget strip) —
// serving them from memory keeps the free RapidAPI quota for new queries.
// Serverless instances recycle, so this is best-effort, not persistence.
const searchCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

app.get('/api/products', async (req, res) => {
    const query = req.query.q || 'kitchen cookware home appliance';
    const sort = req.query.sort || '';
    const page = String(parseInt(req.query.page) || 1);

    if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RAPIDAPI_KEY environment variable is not set' });
    }

    const cacheKey = query + '|' + sort + '|' + page;
    const hit = searchCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
        return res.json(hit.body);
    }

    const isDataHub = API_HOST.includes('datahub');
    const url = isDataHub
        ? `https://${API_HOST}/item_search_2`
        : `https://${API_HOST}/search`;
    const params = isDataHub
        ? { q: query, page }
        : { SearchText: query, page };
    if (isDataHub && sort) params.sort = sort;

    try {
        const response = await axios.get(url, {
            headers: {
                'x-rapidapi-host': API_HOST,
                'x-rapidapi-key': RAPIDAPI_KEY
            },
            params,
            timeout: 25000
        });

        const body = mapDataHubResponse(response.data) || response.data;
        searchCache.set(cacheKey, { at: Date.now(), body });
        res.json(body);
    } catch (error) {
        res.status(502).json({
            error: 'UPSTREAM_ERROR',
            message: error.message,
            response: error.response ? error.response.data : null
        });
    }
});

/* =====================================================================
   MOBILE MONEY PAYMENTS (pawaPay - Zambia)
   Without PAWAPAY_TOKEN these endpoints report simulated mode, and the
   storefront keeps using its built-in simulation.
   ===================================================================== */

const { randomUUID } = require('crypto');

const PAWAPAY_PROVIDERS = {
    mtn: 'MTN_MOMO_ZMB',
    airtel: 'AIRTEL_OAPI_ZMB',
    zamtel: 'ZAMTEL_ZMB'
};

const pawapayHeaders = () => ({
    Authorization: `Bearer ${PAWAPAY_TOKEN}`,
    'Content-Type': 'application/json'
});

// Starts a mobile money deposit. The customer then gets a PIN prompt on
// their phone; the storefront polls /api/pay/status until it resolves.
app.post('/api/pay', async (req, res) => {
    if (!PAWAPAY_TOKEN) return res.json({ simulated: true });

    const { phone, network, amount } = req.body || {};
    const provider = PAWAPAY_PROVIDERS[String(network || '').toLowerCase()];
    if (!/^(9|7)\d{8}$/.test(String(phone)) || !(amount > 0) || !provider) {
        return res.status(400).json({ error: 'INVALID_INPUT' });
    }

    const depositId = randomUUID();
    try {
        const r = await axios.post(`${PAWAPAY_BASE}/v2/deposits`, {
            depositId,
            amount: String(Math.round(amount * 100) / 100),
            currency: 'ZMW',
            payer: {
                type: 'MMO',
                accountDetails: {
                    phoneNumber: '260' + phone,
                    provider
                }
            },
            customerMessage: 'ZedHome order'
        }, { headers: pawapayHeaders(), timeout: 25000 });

        res.json({ tx_ref: depositId, status: r.data && r.data.status });
    } catch (error) {
        res.status(502).json({
            error: 'PAYMENT_ERROR',
            message: error.message,
            response: error.response ? error.response.data : null
        });
    }
});

// Maps pawaPay deposit statuses onto the simple states the storefront
// understands: successful / failed / pending.
app.get('/api/pay/status', async (req, res) => {
    if (!PAWAPAY_TOKEN) return res.json({ simulated: true, status: 'successful' });

    try {
        const r = await axios.get(`${PAWAPAY_BASE}/v2/deposits/${encodeURIComponent(req.query.tx_ref || '')}`, {
            headers: pawapayHeaders(),
            timeout: 20000
        });
        const d = r.data && (r.data.data || (Array.isArray(r.data) ? r.data[0] : r.data));
        const s = String((d && d.status) || 'pending').toUpperCase();
        const status = s === 'COMPLETED' ? 'successful'
            : (s === 'FAILED' || s === 'REJECTED' || s === 'CANCELLED') ? 'failed'
            : 'pending';
        res.json({ status });
    } catch (error) {
        // Status often 404s for a moment right after initiation - treat as pending
        res.json({ status: 'pending' });
    }
});

/* =====================================================================
   VERIPOINTS — shared ORIZIS wallet (server-side seam)
   Real value only moves here, never in the browser. Both endpoints stay
   inert (enabled:false) until VERIPOINTS_API + VERIPOINTS_SERVER_KEY are
   set, so the storefront cleanly falls back to Mobile-Money-only.
     VERIPOINTS_API         - base URL of the central VeriPoints service
     VERIPOINTS_SERVER_KEY  - secret serverKey for capture/credit (per siteId)
   ===================================================================== */
const VERIPOINTS_API = process.env.VERIPOINTS_API;
const VERIPOINTS_SERVER_KEY = process.env.VERIPOINTS_SERVER_KEY;
const vpReady = () => Boolean(VERIPOINTS_API && VERIPOINTS_SERVER_KEY);
const vpUrl = path => `${String(VERIPOINTS_API).replace(/\/$/, '')}${path}`;
const vpAuth = () => ({ Authorization: `Bearer ${VERIPOINTS_SERVER_KEY}`, 'Content-Type': 'application/json' });

// Captures a hold the client already placed → finalises a VeriPoints payment.
app.post('/api/vp/capture', async (req, res) => {
    if (!vpReady()) return res.json({ enabled: false, captured: false });
    const { holdId, siteId } = req.body || {};
    if (!holdId) return res.status(400).json({ error: 'INVALID_INPUT', captured: false });
    try {
        const r = await axios.post(vpUrl('/capture'),
            { holdId, siteId, serverKey: VERIPOINTS_SERVER_KEY },
            { headers: vpAuth(), timeout: 25000 });
        res.json({ captured: Boolean(r.data && (r.data.captured || r.data.ok)) });
    } catch (error) {
        res.status(502).json({ error: 'VP_CAPTURE_ERROR', captured: false, message: error.message });
    }
});

// Credits loyalty points to the customer after any successful order.
// Best-effort: failures never block the order the storefront already placed.
app.post('/api/vp/earn', async (req, res) => {
    if (!vpReady()) return res.json({ enabled: false, credited: false });
    const { points, siteId, reference, idToken } = req.body || {};
    if (!(points > 0)) return res.status(400).json({ error: 'INVALID_INPUT', credited: false });
    try {
        const r = await axios.post(vpUrl('/credit'),
            { points, siteId, reference, idToken, serverKey: VERIPOINTS_SERVER_KEY },
            { headers: vpAuth(), timeout: 20000 });
        res.json({ credited: Boolean(r.data && (r.data.credited || r.data.ok)) });
    } catch (error) {
        res.status(502).json({ error: 'VP_EARN_ERROR', credited: false, message: error.message });
    }
});

module.exports = app;
