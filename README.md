# Homes

Homes is a web app for discovering and supporting home-based businesses in Singapore. Customers browse listings by category or on a map, chat with sellers, book services and leave verified reviews. Sellers can create listings, see how they're performing and pay to boost them.

Built with Vue 3, Firebase and Stripe for the WAD2 module.

## Features

- **Explore:** browse listings by category, search, filter by distance, or use the map explorer
- **Listings:** create and manage business listings with photos, opening hours and locations
- **Chat:** real-time messaging between customers and sellers, with unread notifications
- **Bookings:** request a time slot from a listing
- **Verified reviews:** each listing has a QR code; customers scan it to unlock a review
- **Boosting:** sellers pay through Stripe Checkout to feature a listing for 1 day, 7 days or 1 month
- **Seller levels:** badges from Bronze to Diamond based on activity
- **Profile analytics:** views, likes and reviews over time
- **Admin:** dashboard and report moderation for admin accounts
- **Accounts:** email/password or Google sign-in, email verification and password reset
- **Dark mode** and mobile-friendly layouts

## Tech stack

| Area | Tools |
| --- | --- |
| Frontend | Vue 3, Vue Router, Vite, Bootstrap 5, Iconify, Chart.js |
| Backend | Express server for Stripe Checkout (`server.js`) |
| Data and auth | Firebase Auth, Cloud Firestore, Firebase Storage |
| Maps | Google Maps JavaScript API (Places) |
| Payments | Stripe Checkout |

## Getting started

You need **Node.js 20.19+ (or 22.12+)**, a Firebase project, a Google Maps API key, and a Stripe account in test mode.

```bash
git clone https://github.com/hendery666/homes.git
cd homes
npm install
cp .env.example .env   # then fill in your keys
```

Run the frontend and the payment server in two terminals:

```bash
npm run dev      # frontend → http://localhost:5173
npm run server   # payment server → http://localhost:4242 (only needed for boosting)
```

Restart `npm run dev` after changing `.env`.

## Environment variables

See [`.env.example`](.env.example) for the full list.

| Variable | Used by | What it is |
| --- | --- | --- |
| `VITE_FIREBASE_*` | Frontend | Your Firebase web app config (Project settings → Your apps) |
| `VITE_GOOGLE_MAPS_API_KEY` | Frontend | Google Maps JavaScript API key with the Places API enabled |
| `VITE_API_URL` | Frontend | URL of the payment server (`http://localhost:4242` locally) |
| `STRIPE_SECRET_KEY` | Server | Stripe secret key (use a `sk_test_...` key) |
| `PRICE_ID_1D`, `PRICE_ID_7D`, `PRICE_ID_30D` | Server | Stripe Price IDs for the three boost plans |
| `FRONTEND_URL` | Server | Where Stripe sends users back after checkout |

## How boosting works

1. The seller picks a plan on `/boosting` and the frontend asks the server for a Stripe Checkout session.
2. After paying, Stripe redirects back to `/boosting?status=success&session_id=...`.
3. The frontend calls `GET /verify-checkout-session` on the server, which checks with Stripe that the session was paid and returns the listing and plan.
4. Only then is the listing's `boostedUntil` extended. The session ID is saved in the listing's `boostSessionIds`, so the same payment can't be applied twice.

Your Firestore rules must let a listing's owner update `boostedUntil` and `boostSessionIds`.

For test payments, use card `4242 4242 4242 4242` with any future expiry date and any CVC. More test cards are listed in [docs/STRIPE_TEST_CARDS.md](docs/STRIPE_TEST_CARDS.md).

## Deployment

- **Frontend:** Vercel. `vercel.json` already sets up the build and the single-page-app rewrites. Add the `VITE_*` variables in the Vercel project settings.
- **Payment server:** any Node host (for example Render) running `npm start`. Set the server variables, and set `FRONTEND_URL` to your Vercel URL. If your frontend runs on a different domain, add it to `allowedOrigins` in `server.js`.

## Project structure

```
├── index.html
├── server.js                 # Stripe Checkout server
├── public/                   # static files (favicon, email-verified page)
├── docs/                     # Git workflow notes, Stripe test cards
└── src/
    ├── main.js               # app entry: Bootstrap, theme, router, global Icon component
    ├── App.vue               # layout: navbar, page, footer, toasts
    ├── firebase.js           # Firebase setup
    ├── router/index.js       # routes and auth/admin guards
    ├── components/           # pages and UI components
    ├── composables/          # dark mode, toasts, seller levels, message notifications
    ├── helpers/ and utils/   # chat helper, review QR codes, Google Maps loader
    └── assets/               # theme, images, badges, category art
```

## Troubleshooting

- **Blank page or "Firebase: Error (auth/invalid-api-key)":** check the `VITE_FIREBASE_*` values in `.env` and restart `npm run dev`.
- **Map doesn't load:** check `VITE_GOOGLE_MAPS_API_KEY`, and make sure billing and the Places API are enabled in Google Cloud.
- **"Cannot connect to the payment server":** start `npm run server` and check that `VITE_API_URL` matches it.
- **CORS error on checkout:** the frontend's URL must be in `allowedOrigins` in `server.js`.
- **Port already in use:** stop the other process, or change the port in `vite.config.js` or set `PORT` for the server.
