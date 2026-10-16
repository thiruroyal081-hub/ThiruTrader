# ThiruTrade Equity Strategy API

This backend adds **real calculations on provider-supplied historical equity candles** for educational research. It does not place broker orders, does not provide guaranteed real-time data, and does not promise profitable signals.

## Data and limitations

- Data source: Yahoo Finance through `yfinance`. Availability, accuracy, delay, and rate limits are controlled by that provider. This is not an exchange-authorized feed.
- Supported endpoints use daily, weekly, or monthly historical candles. This is **not an intraday live scanner**.
- The sample strategy is EMA20/EMA50 + RSI14 + MACD + volume confirmation.
- Backtest trades are filled at the next candle's open after a prior-candle signal to reduce same-candle look-ahead. Costs are a simplified configurable basis-point estimate.
- This backend does not use broker credentials or send orders. Real execution requires a supported broker API, user-specific authorization, secure token handling, testing, and compliance review.

## Run locally on a Mac

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Health check: `http://127.0.0.1:5000/api/health`

Example endpoints:
- `/api/history?symbol=RELIANCE&period=1y&interval=1d`
- `/api/analyze?symbol=RELIANCE&period=1y&interval=1d`
- POST `/api/backtest` JSON body: `{"symbol":"RELIANCE","period":"2y","interval":"1d","capital":100000,"risk_pct":1,"cost_bps_per_side":10}`

Supported symbols include RELIANCE, HDFCBANK, ICICIBANK, TCS, INFY, BHARTIARTL, TATAMOTORS, ITC, HINDUNILVR, SBIN, NTPC, LT, ONGC, MARUTI, WIPRO, AXISBANK and BAJFINANCE. Explicit Yahoo symbols ending in `.NS` or `.BO` are also accepted, subject to provider availability.

## Deploy

Deploy this folder as a Python web service on a backend host that supports Flask. Set the start command to:

```
gunicorn app:app
```

Set the service root to `backend` if the host supports a root-directory setting. Otherwise use the repository root and set the start command to `gunicorn backend.app:app` (adjust module import/path as required by the host).

After deployment, test `/api/health` and `/api/analyze?symbol=RELIANCE`. Then use the HTTPS backend URL from the front end. Do not put broker API secrets in GitHub Pages or browser code.

## Important

This is an educational prototype, not investment advice. Review the code, validate provider data, run out-of-sample tests, include realistic charges/slippage, and paper-trade before any consideration of live orders.
