# ThiruTrader

A responsive NSE/BSE equities dashboard prototype with a prepared Python Flask backend for future Kite Connect integration.

## Frontend features
- Stock search and sector filters
- Illustrative stock charts and example index values
- Rule-based EMA 20/50, RSI 14, MACD and volume analysis using generated sample history
- Explainable BUY candidate / SELL candidate / HOLD signals and browser-local signal history
- Browser-local watchlist
- Practice trade journal saved in the current browser
- Responsive dark dashboard

## Important limitations
- **All displayed prices, index values, chart points, and analysis history are sample/illustrative data, not live quotes or validated trading signals.**
- The signal engine is an educational rules demo. Its generated sample history must not be used for real trading decisions.
- The frontend now has an in-site backend URL, connection-status check, Kite login button, and manual selected-stock quote request.
- The technical-analysis engine still uses generated sample candles; live historical-candle integration is a separate next step.
- No broker account is connected and no real orders are placed.
- Watchlist and journal data stay in the current browser's local storage.
- This is an educational prototype, not investment advice.

## Open the static website
The frontend files are `index.html`, `styles.css`, and `script.js`. You can open `index.html` directly, or run a local static server:
```bash
python3 -m http.server 8000
```
Then visit `http://127.0.0.1:8000`. Chart.js is loaded from a CDN, so chart rendering requires internet access.

## Backend setup (local development only)
The backend scaffold is in `app.py`; dependencies are in `requirements.txt`.

1. Install Python 3.11 or newer.
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and set a long, random `FLASK_SECRET_KEY`. Do not commit `.env`.
4. Keep `KITE_API_KEY` and `KITE_API_SECRET` blank until valid API credentials are available. Store real values only in the backend environment—not in frontend JavaScript, GitHub files, or screenshots.
5. For production cross-origin browser login, use HTTPS and set `FRONTEND_ORIGIN` to the exact GitHub Pages origin (for example `https://thiruroyal081-hub.github.io`). Configure the session-cookie settings and test login/logout carefully.
6. Set the redirect URL in your Kite developer app to match `KITE_REDIRECT_URL`.
7. Start the local API:
   ```bash
   python app.py
   ```
8. Check `http://127.0.0.1:5000/api/health`. A healthy response only confirms the local server is running; it does not confirm live market access.

## Backend endpoints scaffolded
- `GET /api/health` — backend status
- `GET /auth/login` and `GET /auth/callback` — Kite login/session exchange
- `POST /auth/logout`
- `GET /api/profile`
- `GET /api/quote?i=NSE:INFY&i=NSE:RELIANCE`
- `GET /api/historical/<instrument_token>/<interval>?from=YYYY-MM-DD%20HH:MM:SS&to=YYYY-MM-DD%20HH:MM:SS`

These endpoints are scaffolding and have not been end-to-end tested with a configured broker account.

## Before public/live deployment
- GitHub Pages serves static files only; it cannot run this Python server. Deploy the backend separately to a server/host that supports Python.
- Configure HTTPS, a strong secret key, secure session cookies, and exact allowed frontend origins in the hosting environment.
- Test authentication and API errors before connecting the frontend to the backend.
- Keep real order placement disabled until authentication, risk controls, and comprehensive testing are completed.
- Live quotes and historical candles require appropriate Kite Connect access/plan. Until that is configured and tested, use clearly labelled sample data only.

Kite Connect documentation: https://kite.trade/docs/connect/v3/
GitHub Pages publishing guide: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
