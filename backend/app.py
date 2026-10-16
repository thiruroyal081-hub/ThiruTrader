import os
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
# This API serves public market-history/strategy results only. It does not accept broker secrets.
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
CORS(app, resources={r"/api/*": {"origins": allowed_origins.split(",") if allowed_origins != "*" else "*"}})

SYMBOLS = {
    "RELIANCE": "RELIANCE.NS", "HDFCBANK": "HDFCBANK.NS",
    "ICICIBANK": "ICICIBANK.NS", "TCS": "TCS.NS", "INFY": "INFY.NS",
    "BHARTIARTL": "BHARTIARTL.NS", "TATAMOTORS": "TATAMOTORS.NS",
    "M&M": "M&M.NS", "ITC": "ITC.NS", "HINDUNILVR": "HINDUNILVR.NS",
    "SBIN": "SBIN.NS", "NTPC": "NTPC.NS", "LT": "LT.NS",
    "ONGC": "ONGC.NS", "MARUTI": "MARUTI.NS", "WIPRO": "WIPRO.NS",
    "AXISBANK": "AXISBANK.NS", "BAJFINANCE": "BAJFINANCE.NS",
}
PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}
INTERVALS = {"1d", "1wk", "1mo"}


def resolve_symbol(raw):
    symbol = (raw or "RELIANCE").strip().upper()
    if symbol in SYMBOLS:
        return symbol, SYMBOLS[symbol]
    # Allow explicitly selected Yahoo Finance symbols only for NSE/BSE cash equities.
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        base = symbol[:-3]
        if base and base.replace("&", "").replace("-", "").replace(".", "").isalnum():
            return base, symbol
    raise ValueError("Unsupported symbol. Use a listed equity symbol such as RELIANCE, TCS, or INFY.")


def get_history(raw_symbol, period="1y", interval="1d"):
    if period not in PERIODS:
        raise ValueError("period must be one of: " + ", ".join(sorted(PERIODS)))
    if interval not in INTERVALS:
        raise ValueError("interval must be one of: " + ", ".join(sorted(INTERVALS)))
    label, ticker = resolve_symbol(raw_symbol)
    frame = yf.Ticker(ticker).history(period=period, interval=interval, auto_adjust=False, actions=False)
    if frame is None or frame.empty:
        raise LookupError("No historical data returned for this symbol. Check the symbol and try later.")
    frame = frame.rename(columns={c: c.lower().replace(" ", "_") for c in frame.columns})
    needed = ["open", "high", "low", "close", "volume"]
    if not set(needed).issubset(frame.columns):
        raise LookupError("The data provider did not return the required OHLCV fields.")
    frame = frame[needed].dropna()
    frame = frame[(frame["close"] > 0) & (frame["high"] >= frame["low"])]
    if frame.empty:
        raise LookupError("No valid candles returned for this symbol.")
    return label, ticker, frame


def calculate_indicators(frame):
    out = frame.copy()
    out["ema20"] = out["close"].ewm(span=20, adjust=False, min_periods=20).mean()
    out["ema50"] = out["close"].ewm(span=50, adjust=False, min_periods=50).mean()
    delta = out["close"].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    out["rsi14"] = 100 - (100 / (1 + rs))
    out.loc[(avg_loss == 0) & (avg_gain > 0), "rsi14"] = 100
    out.loc[(avg_loss == 0) & (avg_gain == 0), "rsi14"] = 50
    ema12 = out["close"].ewm(span=12, adjust=False).mean()
    ema26 = out["close"].ewm(span=26, adjust=False).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False).mean()
    out["volume_sma20"] = out["volume"].rolling(20, min_periods=20).mean()
    out["volume_confirm"] = out["volume"] > out["volume_sma20"]
    # Strategy is a transparent educational example, not a promise of profitability.
    out["entry_signal"] = (
        (out["close"] > out["ema20"]) &
        (out["ema20"] > out["ema50"]) &
        (out["rsi14"] >= 50) & (out["rsi14"] < 70) &
        (out["macd"] > out["macd_signal"]) &
        out["volume_confirm"]
    )
    out["exit_signal"] = (
        (out["close"] < out["ema20"]) |
        (out["macd"] < out["macd_signal"]) |
        (out["rsi14"] < 45)
    )
    return out


def json_safe(value):
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, (int, float)):
        return float(value)
    return value


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "service": "ThiruTrade educational equity strategy API",
        "data_source": "Yahoo Finance via yfinance",
        "data_type": "historical; may be delayed, incomplete, or unavailable",
        "broker_connected": False,
        "real_orders_enabled": False,
        "server_time_utc": datetime.now(timezone.utc).isoformat(),
    })


@app.get("/api/history")
def history():
    try:
        symbol, ticker, frame = get_history(request.args.get("symbol", "RELIANCE"),
                                            request.args.get("period", "1y"),
                                            request.args.get("interval", "1d"))
        candles = []
        for idx, row in frame.tail(500).iterrows():
            ts = idx.to_pydatetime()
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            candles.append({
                "time": int(ts.timestamp()),
                "date": ts.isoformat(),
                **{key: json_safe(row[key]) for key in ("open", "high", "low", "close", "volume")}
            })
        return jsonify({"symbol": symbol, "provider_symbol": ticker, "source": "Yahoo Finance via yfinance",
                        "data_type": "historical; not guaranteed real-time", "period": request.args.get("period", "1y"),
                        "interval": request.args.get("interval", "1d"), "candles": candles})
    except (ValueError, LookupError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("History request failed")
        return jsonify({"error": "Market history provider failed. Try again later; no sample values were substituted."}), 502


@app.get("/api/analyze")
def analyze():
    try:
        symbol, ticker, raw = get_history(request.args.get("symbol", "RELIANCE"),
                                          request.args.get("period", "1y"),
                                          request.args.get("interval", "1d"))
        frame = calculate_indicators(raw).dropna(subset=["ema20", "ema50", "rsi14", "macd_signal", "volume_sma20"])
        if frame.empty:
            raise LookupError("Not enough candles to calculate the indicators.")
        last = frame.iloc[-1]
        prev = frame.iloc[-2] if len(frame) > 1 else last
        checks = {
            "trend_up": bool(last["close"] > last["ema20"] and last["ema20"] > last["ema50"]),
            "momentum_ok": bool(50 <= last["rsi14"] < 70),
            "macd_up": bool(last["macd"] > last["macd_signal"]),
            "volume_confirmed": bool(last["volume_confirm"] and last["close"] >= prev["close"]),
        }
        score = sum(checks.values())
        entry = bool(all(checks.values()))
        exit_now = bool(last["close"] < last["ema20"] or last["macd"] < last["macd_signal"] or last["rsi14"] < 45)
        signal = "BUY CANDIDATE" if entry else ("EXIT / AVOID CANDIDATE" if exit_now else "HOLD / NO TRADE")
        return jsonify({
            "symbol": symbol, "provider_symbol": ticker, "source": "Yahoo Finance via yfinance",
            "data_type": "historical; not guaranteed real-time", "signal": signal, "score": score,
            "score_out_of": 4, "checks": checks, "close": json_safe(last["close"]),
            "ema20": json_safe(last["ema20"]), "ema50": json_safe(last["ema50"]),
            "rsi14": json_safe(last["rsi14"]), "macd": json_safe(last["macd"]),
            "macd_signal": json_safe(last["macd_signal"]), "volume": json_safe(last["volume"]),
            "volume_sma20": json_safe(last["volume_sma20"]), "candle_date": frame.index[-1].isoformat(),
            "rules": ["close > EMA20 > EMA50", "RSI(14) from 50 to below 70",
                      "MACD above signal", "volume above 20-candle average with non-down close"],
            "disclaimer": "Educational rule output on historical provider data, not a recommendation or an execution command."
        })
    except (ValueError, LookupError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Analysis request failed")
        return jsonify({"error": "Market data or indicator calculation failed. No sample signal was substituted."}), 502


@app.post("/api/backtest")
def backtest():
    body = request.get_json(silent=True) or {}
    try:
        symbol, ticker, raw = get_history(body.get("symbol", "RELIANCE"),
                                          body.get("period", "2y"),
                                          body.get("interval", "1d"))
        capital = float(body.get("capital", 100000))
        risk_pct = float(body.get("risk_pct", 1))
        fee_bps = float(body.get("cost_bps_per_side", 10))
        if not (capital > 0 and 0 < risk_pct <= 5 and 0 <= fee_bps <= 200):
            raise ValueError("capital must be positive, risk_pct must be >0 and <=5, and cost_bps_per_side must be 0–200.")
        data = calculate_indicators(raw).dropna(subset=["ema20", "ema50", "rsi14", "macd_signal", "volume_sma20"]).copy()
        if len(data) < 3:
            raise LookupError("Not enough historical candles to backtest.")
        cash = capital
        shares = 0
        entry_price = 0.0
        entry_fee = 0.0
        trades = []
        equity_curve = []
        cost_rate = fee_bps / 10000
        # Signals from close are acted on at the next candle open to avoid same-close look-ahead.
        rows = list(data.iterrows())
        for i in range(len(rows) - 1):
            date, row = rows[i]
            next_date, next_row = rows[i + 1]
            price = float(next_row["open"])
            if shares == 0 and bool(row["entry_signal"]):
                stop_distance = price * 0.03
                risk_budget = cash * (risk_pct / 100)
                quantity = int(min(risk_budget / stop_distance, cash / (price * (1 + cost_rate))))
                if quantity > 0:
                    gross = quantity * price
                    entry_fee = gross * cost_rate
                    cash -= gross + entry_fee
                    shares = quantity
                    entry_price = price
                    entry_date = next_date.isoformat()
            elif shares > 0 and bool(row["exit_signal"]):
                gross = shares * price
                fee = gross * cost_rate
                cash += gross - fee
                pnl = (price - entry_price) * shares - entry_fee - fee
                trades.append({"entry_date": entry_date, "exit_date": next_date.isoformat(),
                               "entry_price": round(entry_price, 4), "exit_price": round(price, 4),
                               "quantity": shares, "pnl": round(pnl, 2),
                               "return_pct": round((price / entry_price - 1) * 100, 3)})
                shares = 0
                entry_price = 0
                entry_fee = 0
            mark = cash + shares * float(next_row["close"]) * (1 - cost_rate)
            equity_curve.append({"date": next_date.isoformat(), "equity": round(mark, 2)})
        final_close = float(data.iloc[-1]["close"])
        final_equity = cash + shares * final_close * (1 - cost_rate)
        if shares:
            pnl = (final_close - entry_price) * shares - entry_fee - shares * final_close * cost_rate
            trades.append({"entry_date": entry_date, "exit_date": "OPEN POSITION (marked to final close)",
                           "entry_price": round(entry_price, 4), "exit_price": round(final_close, 4),
                           "quantity": shares, "pnl": round(pnl, 2),
                           "return_pct": round((final_close / entry_price - 1) * 100, 3), "open": True})
        returns = [float(t["pnl"]) for t in trades]
        wins = sum(1 for pnl in returns if pnl > 0)
        peak = capital
        max_drawdown = 0.0
        for point in equity_curve:
            peak = max(peak, point["equity"])
            if peak:
                max_drawdown = max(max_drawdown, (peak - point["equity"]) / peak * 100)
        return jsonify({
            "symbol": symbol, "provider_symbol": ticker, "source": "Yahoo Finance via yfinance",
            "data_type": "historical backtest; not live trading", "period": body.get("period", "2y"),
            "interval": body.get("interval", "1d"), "strategy": "EMA20/EMA50 + RSI14 + MACD + volume confirmation",
            "initial_capital": round(capital, 2), "final_equity_marked_to_market": round(final_equity, 2),
            "net_pnl": round(final_equity - capital, 2),
            "return_pct": round((final_equity / capital - 1) * 100, 3),
            "closed_and_open_trades": len(trades), "wins": wins,
            "win_rate_pct": round(wins / len(trades) * 100, 2) if trades else None,
            "max_drawdown_pct": round(max_drawdown, 2), "cost_bps_per_side": fee_bps,
            "trades": trades[-100:], "equity_curve": equity_curve[-500:],
            "limitations": ["Daily/weekly/monthly historical data only; no intraday streaming.",
                            "Costs are a simplified basis-point estimate and do not model every Indian tax/fee.",
                            "No slippage, circuit limits, corporate-action edge cases, order queue, or broker execution.",
                            "Historical results do not predict future performance."]
        })
    except (ValueError, LookupError) as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        app.logger.exception("Backtest request failed")
        return jsonify({"error": "Backtest failed. No simulated data was substituted."}), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
