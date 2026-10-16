import os
from datetime import date
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, session
from flask_cors import CORS
from kiteconnect import KiteConnect

load_dotenv()
app = Flask(__name__)
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("Set FLASK_SECRET_KEY in the backend environment before starting the server.")
app.secret_key = SECRET_KEY
# Cross-site browser sessions require HTTPS in production when frontend and API use different hosts.
COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "true").lower() in {"1", "true", "yes"}
app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=COOKIE_SECURE,
    SESSION_COOKIE_HTTPONLY=True,
)
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("FRONTEND_ORIGIN", "http://127.0.0.1:5500").split(",")
    if origin.strip()
]
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

API_KEY = os.environ.get("KITE_API_KEY", "")
API_SECRET = os.environ.get("KITE_API_SECRET", "")

def kite_client():
    if not API_KEY:
        raise RuntimeError("KITE_API_KEY is not configured.")
    client = KiteConnect(api_key=API_KEY)
    token = session.get("kite_access_token")
    if token:
        client.set_access_token(token)
    return client


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("kite_access_token"):
            return jsonify({"error": "not_authenticated", "message": "Connect Kite through /auth/login first."}), 401
        return fn(*args, **kwargs)
    return wrapper


@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "mode": "sample-until-authorized",
        "kite_configured": bool(API_KEY and API_SECRET),
        "authenticated": bool(session.get("kite_access_token")),
        "date": date.today().isoformat(),
    })


@app.get("/auth/login")
def auth_login():
    if not API_KEY:
        return jsonify({"error": "missing_configuration", "message": "Set KITE_API_KEY in your environment first."}), 503
    # Kite login redirects to the redirect URL registered in the Kite developer console.
    session["kite_oauth_started"] = True
    return redirect(kite_client().login_url())


@app.get("/auth/callback")
def auth_callback():
    request_token = request.args.get("request_token")
    if not session.pop("kite_oauth_started", False):
        return jsonify({"error": "login_not_started", "message": "Start login from /auth/login first."}), 400
    if request.args.get("status") != "success" or not request_token:
        return jsonify({"error": "login_not_completed", "message": "Kite login did not return a successful request_token."}), 400
    if not API_SECRET:
        return jsonify({"error": "missing_configuration", "message": "Set KITE_API_SECRET on the backend."}), 503
    try:
        data = kite_client().generate_session(request_token, api_secret=API_SECRET)
    except Exception:
        app.logger.exception("Kite session exchange failed")
        return jsonify({"error": "session_exchange_failed", "message": "Kite session exchange failed. Check server logs and app redirect configuration."}), 502
    session["kite_access_token"] = data["access_token"]
    session["kite_user_id"] = data.get("user_id")
    return redirect(os.environ.get("FRONTEND_SUCCESS_URL", "https://thiruroyal081-hub.github.io/ThiruTrader/"))


@app.post("/auth/logout")
def auth_logout():
    session.pop("kite_access_token", None)
    session.pop("kite_user_id", None)
    return jsonify({"status": "logged_out"})


@app.get("/api/profile")
@login_required
def profile():
    try:
        return jsonify(kite_client().profile())
    except Exception:
        app.logger.exception("Kite profile request failed")
        return jsonify({"error": "kite_request_failed"}), 502


@app.get("/api/quote")
@login_required
def quote():
    instruments = request.args.getlist("i")
    if not instruments or len(instruments) > 100:
        return jsonify({"error": "invalid_instruments", "message": "Pass 1 to 100 repeated i=EXCHANGE:SYMBOL parameters."}), 400
    if any(":" not in item for item in instruments):
        return jsonify({"error": "invalid_instruments", "message": "Each instrument must look like NSE:INFY."}), 400
    try:
        return jsonify(kite_client().quote(instruments))
    except Exception:
        app.logger.exception("Kite quote request failed")
        return jsonify({"error": "kite_request_failed", "message": "Could not fetch quotes. Verify API access and instrument symbols."}), 502


@app.get("/api/historical/<int:instrument_token>/<interval>")
@login_required
def historical(instrument_token, interval):
    allowed = {"minute", "3minute", "5minute", "10minute", "15minute", "30minute", "60minute", "day"}
    if interval not in allowed:
        return jsonify({"error": "invalid_interval", "allowed": sorted(allowed)}), 400
    start = request.args.get("from")
    end = request.args.get("to")
    if not start or not end:
        return jsonify({"error": "missing_dates", "message": "Provide from and to in YYYY-MM-DD HH:MM:SS format."}), 400
    try:
        candles = kite_client().historical_data(instrument_token, start, end, interval)
        return jsonify({"candles": candles})
    except Exception:
        app.logger.exception("Kite historical data request failed")
        return jsonify({"error": "kite_request_failed", "message": "Historical data request failed. Check your plan and date range."}), 502


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "not_found"}), 404


if __name__ == "__main__":
    # Local development only. Use a production WSGI server when deployed.
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
