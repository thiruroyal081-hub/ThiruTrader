# ThiruTrader

A responsive Indian equities dashboard prototype.

## Current features
- NSE/BSE-themed stock list with search, sector filter, and selection
- Illustrative price chart
- Browser-local watchlist
- Paper-trade journal
- Mobile-friendly dark UI

## Important limitations
- **All displayed prices and index values are illustrative sample data, not live quotes.**
- No Zerodha account is connected. No real orders are submitted.
- The chart is generated from sample values and is not a live or historical market chart.
- The watchlist and journal are stored in this browser only using localStorage.

## Run
Open `index.html` in a modern browser. An internet connection is needed to load Chart.js from its CDN.

## Future Kite Connect integration
Use a server-side backend (for example, Python Flask) for Kite Connect authentication and API calls. Keep the API secret and access tokens on the server and out of frontend JavaScript, public commits, and browser storage. Live market data and historical candle access require the appropriate Kite Connect access/plan. Test with sample/paper data until authorized access is configured.

This project is an educational prototype, not investment advice.
