# ZedHome 🏠🇿🇲

**Home & kitchen delivered, paid for with Mobile Money — made for your phone.**

ZedHome is a mirror-store for AliExpress **specialised in home & kitchen for
Zambia**: kitchen appliances, cookware & pots, small appliances, food storage,
home décor, cleaning, bedding & textiles, bathroom, organizers and lighting —
the same products, priced in Zambian Kwacha (ZMW) and paid with **MTN MoMo,
Airtel Money or Zamtel Kwacha** — no credit card required.

Built on the proven [ZedMall](https://github.com/aaciyoni-bot/zedmall-site) /
[ZedGlow](https://github.com/aaciyoni-bot/zedglow-site) architecture, narrowed to
the home & kitchen niche and tuned mobile-first. An **ORIZIS TECHNOLOGY** brand.

## Business model

Customer pays with Mobile Money → order lands in WhatsApp (with a direct product
link) → we order the item on AliExpress to the customer's address → drop-ship
(12–25 days).

**Company profit = 30 % markup** applied to every item price (`MARKUP_PERCENT: 30`),
plus a 5 % service fee at checkout that covers Mobile Money charges.

## Structure

Single-page storefront + a small backend.

| File | Purpose |
|------|---------|
| `index.html` | The entire storefront — catalog, cart, Mobile Money checkout, infinite scroll. All config lives in the `CONFIG` block at the top of the `<script>`. |
| `backend/` | Express (Vercel serverless): `/api/products` proxies AliExpress via RapidAPI (key server-side), `/api/pay` + `/api/pay/status` drive pawaPay Mobile Money. |
| `manifest.json`, `sw.js`, `icon-*.png` | PWA — installable "app" on Android/iPhone. |

### CONFIG (top of `index.html`)

```js
API_BASE_URL: "https://zedhome-site.vercel.app",  // backend; "" = demo mode
USD_TO_ZMW: 27.5,          // exchange rate USD → Kwacha
MARKUP_PERCENT: 30,        // company profit on every purchase
SERVICE_FEE_PERCENT: 5,    // checkout fee (covers MoMo charges)
BUDGET_MAX_ZMW: 200,       // ceiling for the "Home deals under K200" strip
WHATSAPP_ORDERS: "260971234567",
WHATSAPP_SUPPORT: "260971234567"
```

If the backend is unreachable (or has no `RAPIDAPI_KEY`), the storefront falls back to
a built-in set of **demo home & kitchen products** — it never shows a broken page.

## Deploy

**Storefront** (static, no build): push to `main` → GitHub Pages. Optional custom
domain via a `CNAME` file.

**Backend** (Vercel):
- Root Directory: `backend`
- Env vars: `RAPIDAPI_KEY` (required for live products), `PAWAPAY_TOKEN` +
  `PAWAPAY_ENV=production` (required for real Mobile Money charges).
- Health check: `GET /api/health`.

## Going live checklist

1. Add `RAPIDAPI_KEY` in Vercel → real home & kitchen catalog replaces the demo products.
2. Create a [pawapay.io](https://pawapay.io) account → set `PAWAPAY_TOKEN`
   (sandbox → production) → real Mobile Money charges.
3. Set your real `WHATSAPP_ORDERS` / `WHATSAPP_SUPPORT` numbers in `CONFIG`.
4. Point a domain at GitHub Pages via a `CNAME` file.
