"""
Si Paling Trading - backend FastAPI

Variabel di file .env (semua opsional kecuali GEMINI_API_KEY kalau mau sinyal AI):
  GEMINI_API_KEY        kunci API Gemini
  GEMINI_MODELS         daftar model dipisah koma, dicoba berurutan
  CORS_ORIGINS          tambahan origin frontend, dipisah koma (localhost sudah otomatis)
  USD_IDR_RATE          kurs untuk menghitung harga dalam rupiah (default 16200)
  ALLOW_SYNTHETIC_DATA  isi 1 untuk memakai data acak saat semua sumber data gagal (hanya untuk demo)
  DEEPSEEK_API_KEY      kunci DeepSeek untuk analisis teknikal (kalau kosong, Gemini yang menggantikan)
  DEEPSEEK_MODEL        nama model DeepSeek (default deepseek-flash)
  DEEPSEEK_BASE_URL     default https://api.deepseek.com
  DEEPSEEK_THINKING     isi 1 untuk mode berpikir (lebih teliti tapi lebih lambat)
  NEWS_SEARCH           isi 1 untuk memakai Gemini + Google Search untuk berita (bisa berbayar)
                        bawaan: judul berita dari RSS media kripto, dinilai oleh Gemini (gratis)

Pembagian peran AI:
  DeepSeek -> analisis teknikal dari angka indikator (tanpa akses internet)
  Gemini + Google Search -> berita dan sentimen terkini
  Keduanya digabung dengan aturan yang transparan di fungsi combine_signals().
"""
import json
import os
import random
import re
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types

load_dotenv()

# ---------------------------------------------------------------- konfigurasi
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODELS = [
    m.strip()
    for m in os.getenv("GEMINI_MODELS", "gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash-lite").split(",")
    if m.strip()
]
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
USD_IDR_RATE = float(os.getenv("USD_IDR_RATE", "16200"))
ALLOW_SYNTHETIC = os.getenv("ALLOW_SYNTHETIC_DATA", "0") == "1"
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_THINKING = os.getenv("DEEPSEEK_THINKING", "0") == "1"
NEWS_CACHE_SECONDS = 900
NEWS_SEARCH = os.getenv("NEWS_SEARCH", "0") == "1"  # 1 = coba Google Search grounding lebih dulu (bisa berbayar)

ANALYSIS_CACHE_SECONDS = 300
KLINE_CACHE_SECONDS = 3
ANALYZE_CANDLES = 300  # cukup untuk EMA 200
DEFAULT_CANDLES = 300

INTERVAL_SECONDS = {"1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400}
FOREX_SYMBOLS = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"]

client = None
if GEMINI_API_KEY:
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        print(f"Gagal inisialisasi Gemini Client: {e}")

app = FastAPI(title="Si Paling Trading Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
    expose_headers=["X-Data-Source"],
)

_analysis_cache: dict = {}
_news_cache: dict = {}
_kline_cache: dict = {}
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})


class UnknownSymbol(Exception):
    """Aset tidak ada di sumber data."""


class SourceDown(Exception):
    """Semua sumber data gagal dihubungi."""


def sig(x: float) -> float:
    """Bulatkan ke 10 angka signifikan, aman untuk harga koin mikro seperti PEPE."""
    return float(f"{x:.10g}")


# ------------------------------------------------------------------- simbol
def normalize_symbol(symbol: str) -> str:
    clean = symbol.strip().upper().replace("/", "").replace(" ", "")
    if clean in FOREX_SYMBOLS:
        return clean
    if clean in ("XAU", "GOLD"):
        return "XAUUSD"
    if clean in ("XAG", "SILVER"):
        return "XAGUSD"
    if clean in ("USDTIDR", "USDTBIDR"):
        return "USDTBIDR"
    if clean == "BTC":
        return "BTCUSDT"
    if not clean.endswith(("USDT", "IDR", "BIDR", "BTC")):
        clean += "USDT"
    return clean


def check_interval(interval: str) -> None:
    if interval not in INTERVAL_SECONDS:
        raise HTTPException(status_code=400, detail=f"Interval tidak didukung. Pilih: {', '.join(INTERVAL_SECONDS)}")


# ------------------------------------------------------------- sumber data
BINANCE_HOSTS = [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
]


def fetch_binance_klines(symbol: str, interval: str, limit: int) -> list:
    for host in BINANCE_HOSTS:
        try:
            res = HTTP.get(
                f"{host}/api/v3/klines",
                params={"symbol": symbol, "interval": interval, "limit": limit},
                timeout=4,
            )
        except requests.RequestException:
            continue
        if res.status_code == 400:  # simbol tidak valid
            raise UnknownSymbol(f"Aset {symbol} tidak ditemukan di Binance")
        if res.status_code != 200:
            continue
        rows = res.json()
        if rows:
            return [
                {
                    "time": int(k[0] / 1000),
                    "open": float(k[1]),
                    "high": float(k[2]),
                    "low": float(k[3]),
                    "close": float(k[4]),
                    "volume": float(k[5]),
                }
                for k in rows
            ]
    raise SourceDown("Binance tidak bisa dihubungi. Cek koneksi internet atau coba lagi sebentar.")


# interval Yahoo, rentang data. 4h dibentuk dari data 60 menit.
YAHOO_PARAMS = {
    "1m": ("1m", "5d"),
    "5m": ("5m", "5d"),
    "15m": ("15m", "1mo"),
    "1h": ("60m", "1mo"),
    "4h": ("60m", "3mo"),
    "1d": ("1d", "2y"),
}
YAHOO_TICKERS = {
    "XAUUSD": ["XAUUSD=X", "GC=F"],
    "XAGUSD": ["XAGUSD=X", "SI=F"],
}


def _aggregate(klines: list, step: int) -> list:
    buckets: dict = {}
    for k in klines:
        buckets.setdefault(k["time"] // step * step, []).append(k)
    out = []
    for t in sorted(buckets):
        g = buckets[t]
        out.append(
            {
                "time": t,
                "open": g[0]["open"],
                "high": max(x["high"] for x in g),
                "low": min(x["low"] for x in g),
                "close": g[-1]["close"],
                "volume": sum(x["volume"] for x in g),
            }
        )
    return out


def fetch_forex_klines(symbol: str, interval: str, limit: int) -> list:
    y_interval, y_range = YAHOO_PARAMS[interval]
    for ticker in YAHOO_TICKERS.get(symbol, [f"{symbol}=X"]):
        try:
            res = HTTP.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
                params={"interval": y_interval, "range": y_range},
                timeout=6,
            )
            if res.status_code != 200:
                continue
            result = res.json()["chart"]["result"][0]
            q = result["indicators"]["quote"][0]
            klines = []
            for i, t in enumerate(result.get("timestamp", [])):
                if None in (q["open"][i], q["high"][i], q["low"][i], q["close"][i]):
                    continue
                klines.append(
                    {
                        "time": int(t),
                        "open": float(q["open"][i]),
                        "high": float(q["high"][i]),
                        "low": float(q["low"][i]),
                        "close": float(q["close"][i]),
                        "volume": float((q.get("volume") or [0] * (i + 1))[i] or 0),
                    }
                )
            if interval == "4h":
                klines = _aggregate(klines, INTERVAL_SECONDS["4h"])
            if klines:
                return klines[-limit:]
        except (requests.RequestException, KeyError, IndexError, TypeError, ValueError) as e:
            print(f"Yahoo {ticker} gagal: {e}")
    raise SourceDown("Yahoo Finance tidak bisa dihubungi atau tidak punya data aset ini.")


SYNTH_BASE = {"SHIB": 0.0000185, "PEPE": 0.0000095, "BONK": 0.000022, "SUI": 0.8145, "BTC": 60000.0,
              "SOL": 140.0, "ETH": 2400.0, "XAU": 2400.0, "EUR": 1.08}


def synthetic_klines(symbol: str, interval: str, limit: int) -> list:
    """Data acak. Hanya aktif kalau ALLOW_SYNTHETIC_DATA=1, tidak mencerminkan pasar."""
    step = INTERVAL_SECONDS[interval]
    start = (int(time.time()) // step) * step - (limit - 1) * step
    rnd = random.Random(f"{symbol}{interval}")
    is_idr = "IDR" in symbol
    price = 17577.0 if is_idr else next((v for k, v in SYNTH_BASE.items() if symbol.startswith(k)), 1.0)
    vol = 0.002 if is_idr else 0.012
    out = []
    for i in range(limit):
        o = price
        c = o * (1 + rnd.gauss(0, vol))
        out.append(
            {
                "time": start + i * step,
                "open": sig(o),
                "high": sig(max(o, c) * (1 + abs(rnd.gauss(0, vol / 3)))),
                "low": sig(min(o, c) * (1 - abs(rnd.gauss(0, vol / 3)))),
                "close": sig(c),
                "volume": round(rnd.uniform(800, 9000), 2),
            }
        )
        price = c
    return out


def get_candles(symbol: str, interval: str, limit: int):
    """Mengembalikan (klines, nama_sumber). Hasil di-cache beberapa detik."""
    sym = normalize_symbol(symbol)
    key = (sym, interval, limit)
    hit = _kline_cache.get(key)
    if hit and time.time() - hit[0] < KLINE_CACHE_SECONDS:
        return hit[1], hit[2]
    try:
        if sym in FOREX_SYMBOLS:
            data, source = fetch_forex_klines(sym, interval, limit), "yahoo"
        else:
            data, source = fetch_binance_klines(sym, interval, limit), "binance"
    except SourceDown:
        if not ALLOW_SYNTHETIC:
            raise
        data, source = synthetic_klines(sym, interval, limit), "synthetic"
    if len(_kline_cache) > 200:
        _kline_cache.clear()
    _kline_cache[key] = (time.time(), data, source)
    return data, source


def http_error(e: Exception) -> HTTPException:
    if isinstance(e, UnknownSymbol):
        return HTTPException(status_code=404, detail=str(e))
    return HTTPException(status_code=503, detail=str(e))


# --------------------------------------------------------------- indikator
def ema_series(values, period: int) -> np.ndarray:
    v = np.asarray(values, dtype=float)
    out = np.full(len(v), np.nan)
    if len(v) < period:
        return out
    k = 2 / (period + 1)
    e = v[:period].mean()
    out[period - 1] = e
    for i in range(period, len(v)):
        e = v[i] * k + e * (1 - k)
        out[i] = e
    return out


def calc_ema(closes, period: int):
    """None kalau data kurang dari `period` candle."""
    last = ema_series(closes, period)[-1]
    return None if np.isnan(last) else sig(float(last))


def calc_rsi(closes, period: int = 14) -> float:
    if len(closes) < period + 1:
        return 50.0
    d = np.diff(np.asarray(closes, dtype=float))
    up, dn = np.clip(d, 0, None), np.clip(-d, 0, None)
    au, ad = up[:period].mean(), dn[:period].mean()
    for i in range(period, len(d)):
        au = (au * (period - 1) + up[i]) / period
        ad = (ad * (period - 1) + dn[i]) / period
    return 100.0 if ad == 0 else round(float(100 - 100 / (1 + au / ad)), 2)


def calc_macd_hist(closes):
    if len(closes) < 40:
        return None
    line = ema_series(closes, 12) - ema_series(closes, 26)
    valid = line[~np.isnan(line)]
    signal = ema_series(valid, 9)
    return None if np.isnan(signal[-1]) else sig(float(valid[-1] - signal[-1]))


def calc_bollinger(closes, period: int = 20, k: float = 2.0):
    if len(closes) < period:
        return None
    w = np.asarray(closes[-period:], dtype=float)
    mid, sd = w.mean(), w.std()
    return sig(float(mid + k * sd)), sig(float(mid)), sig(float(mid - k * sd))


def calc_atr(klines, period: int = 14):
    if len(klines) <= period:
        return None
    tr = [klines[0]["high"] - klines[0]["low"]]
    for i in range(1, len(klines)):
        h, l, pc = klines[i]["high"], klines[i]["low"], klines[i - 1]["close"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    atr = float(np.mean(tr[1 : period + 1]))
    for x in tr[period + 1 :]:
        atr = (atr * (period - 1) + x) / period
    return sig(atr)


# ---------------------------------------------------------------------- AI
def fallback_ai(msg: str) -> dict:
    return {"action": "HOLD", "confidence": 50, "reasoning": msg, "stop_loss": 0, "take_profit": 0}


def sanitize_ai(raw: dict, price: float, atr) -> dict:
    """Pastikan keluaran AI aman dipakai frontend dan stop loss / take profit masuk akal."""
    action = str(raw.get("action", "HOLD")).upper()
    if action not in ("BUY", "SELL", "HOLD"):
        action = "HOLD"
    try:
        confidence = int(max(0, min(100, float(raw.get("confidence", 50)))))
    except (TypeError, ValueError):
        confidence = 50
    try:
        sl, tp = float(raw.get("stop_loss", 0)), float(raw.get("take_profit", 0))
    except (TypeError, ValueError):
        sl = tp = 0.0

    if action == "HOLD":
        sl = tp = 0.0
    else:
        ok = (sl < price < tp) if action == "BUY" else (tp < price < sl)
        if not ok:  # angka AI tidak masuk akal, hitung dari ATR (risk:reward 1:2)
            unit = atr if atr else price * 0.01
            sign = 1 if action == "BUY" else -1
            sl, tp = price - sign * 1.5 * unit, price + sign * 3 * unit
    return {
        "action": action,
        "confidence": confidence,
        "reasoning": str(raw.get("reasoning", ""))[:600],
        "entry_price": sig(price),
        "stop_loss": sig(sl) if sl else 0,
        "take_profit": sig(tp) if tp else 0,
    }


def parse_json_text(text: str) -> dict:
    t = (text or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", t, re.DOTALL)
        if not m:
            raise
        return json.loads(m.group(0))


def build_tech_prompt(m: dict) -> str:
    return f"""Analisa data pasar berikut dan beri rekomendasi singkat.

Aset: {m['symbol']}  Timeframe: {m['interval']}  Jumlah candle: {m['candles']}
Harga sekarang: {m['current_price']}
RSI (14): {m['rsi_14']}
MACD histogram: {m['macd_hist']}
EMA 50: {m['ema_50']}
EMA 200: {m['ema_200'] if m['ema_200'] is not None else 'tidak tersedia (data kurang)'}
Bollinger (atas, tengah, bawah): {m['bollinger']}
ATR (14): {m['atr_14']}
Support / resistance 50 candle: {m['support']} / {m['resistance']}
Tren: {m['trend']} (dasar: {m['trend_basis']})

Aturan jawaban:
- Balas HANYA JSON valid tanpa markdown, dengan kunci: action, confidence, reasoning, stop_loss, take_profit.
- action: "BUY", "SELL", atau "HOLD". confidence: angka 0 sampai 100.
- reasoning: maksimal 2 kalimat Bahasa Indonesia, sebut indikator yang mendasari.
- stop_loss dan take_profit: harga absolut. BUY berarti stop_loss di bawah harga dan take_profit di atas. SELL kebalikannya. Isi 0 kalau HOLD.
- Kalau sinyal saling bertentangan, pilih HOLD dan turunkan confidence."""


DEEPSEEK_SYSTEM = (
    "Kamu analis kuantitatif yang disiplin. Kamu hanya menilai angka yang diberikan "
    "(indikator, level harga, volatilitas) dan tidak mengarang berita. Selalu balas JSON valid."
)


def call_deepseek_technical(m: dict, atr):
    if not DEEPSEEK_API_KEY:
        return None
    body = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": DEEPSEEK_SYSTEM}, {"role": "user", "content": build_tech_prompt(m)}],
        "response_format": {"type": "json_object"},
        "max_tokens": 1200,
        "thinking": {"type": "enabled" if DEEPSEEK_THINKING else "disabled"},
    }
    if not DEEPSEEK_THINKING:
        body["temperature"] = 0.2
    for attempt in range(2):
        try:
            res = HTTP.post(f"{DEEPSEEK_BASE_URL}/chat/completions", headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}, json=body, timeout=30)
            if res.status_code == 400 and "thinking" in body and "thinking" in res.text:
                body.pop("thinking")  # model lama tidak mengenal parameter ini
                continue
            if res.status_code in (429, 500, 502, 503) and attempt == 0:
                time.sleep(1.5)
                continue
            res.raise_for_status()
            text = res.json()["choices"][0]["message"]["content"]
            return sanitize_ai(parse_json_text(text), m["current_price"], atr)
        except Exception as e:
            print(f"DeepSeek gagal (percobaan {attempt + 1}): {e}")
    return None


def call_gemini_technical(m: dict, atr):
    if not client:
        return None
    prompt = build_tech_prompt(m)
    for model in GEMINI_MODELS:
        for attempt in range(2):
            try:
                resp = client.models.generate_content(
                    model=model, contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json"),
                )
                return sanitize_ai(parse_json_text(resp.text), m["current_price"], atr)
            except Exception as e:
                msg = str(e)
                print(f"Gemini {model} (percobaan {attempt + 1}) gagal: {msg}")
                if any(x in msg for x in ("503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED")) and attempt == 0:
                    time.sleep(1.5)
                    continue
                break
    return None


def technical_signal(m: dict, atr):
    """DeepSeek lebih dulu. Kalau tidak tersedia atau gagal, Gemini menggantikan."""
    sig_ds = call_deepseek_technical(m, atr)
    if sig_ds:
        return sig_ds, "deepseek"
    sig_gm = call_gemini_technical(m, atr)
    return (sig_gm, "gemini") if sig_gm else (None, "none")


def asset_label(sym: str) -> str:
    names = {"XAUUSD": "Emas (XAU/USD)", "XAGUSD": "Perak (XAG/USD)"}
    if sym in names:
        return names[sym]
    if sym in FOREX_SYMBOLS:
        return f"{sym[:3]}/{sym[3:]}"
    return sym[:-4] if sym.endswith("USDT") else sym


def _grounding_sources(resp) -> list:
    out = []
    try:
        for ch in (resp.candidates[0].grounding_metadata.grounding_chunks or [])[:4]:
            web = getattr(ch, "web", None)
            if web and getattr(web, "uri", None):
                out.append({"title": (web.title or web.uri)[:80], "uri": web.uri})
    except Exception:
        pass
    return out


def _short_error(e: Exception, n: int = 140) -> str:
    msg = re.sub(r"AIza[0-9A-Za-z_\-]{20,}", "[kunci]", f"{type(e).__name__}: {e}")
    return " ".join(msg.split())[:n]


def _parse_news(raw: dict, sources: list, method: str) -> dict:
    sentiment = str(raw.get("sentiment", "NEUTRAL")).upper()
    if sentiment not in ("BULLISH", "BEARISH", "NEUTRAL"):
        sentiment = "NEUTRAL"
    return {
        "sentiment": sentiment,
        "score": max(-1.0, min(1.0, float(raw.get("score", 0)))),
        "confidence": max(0.0, min(100.0, float(raw.get("confidence", 0)))),
        "risk_event": bool(raw.get("risk_event", False)),
        "summary": str(raw.get("summary", ""))[:400],
        "headlines": [
            {"title": str(h.get("title", ""))[:120], "source": str(h.get("source", ""))[:40]}
            for h in (raw.get("headlines") or [])[:4] if isinstance(h, dict)
        ],
        "sources": sources,
        "method": method,
    }


NEWS_JSON_RULES = """Balas HANYA JSON valid tanpa markdown dengan kunci:
{"sentiment": "BULLISH" atau "BEARISH" atau "NEUTRAL", "score": angka -1.0 sampai 1.0, "confidence": angka 0 sampai 100, "risk_event": true bila ada peristiwa besar dalam 24 jam yang bisa membuat harga bergejolak ekstrem (rapat The Fed, data inflasi, peretasan exchange, keputusan regulator), selain itu false, "summary": "maksimal 2 kalimat Bahasa Indonesia", "headlines": [{"title": "judul", "source": "nama media"}]}"""


def _news_via_search(sym: str, label: str):
    """Gemini + Google Search. Mengembalikan (data, error). Penggunaan grounding bisa berbayar."""
    if not client:
        return None, "GEMINI_API_KEY belum dipasang"
    kind = "forex dan komoditas" if sym in FOREX_SYMBOLS else "kripto"
    prompt = f"""Hari ini {time.strftime('%Y-%m-%d')}. Gunakan pencarian Google untuk menemukan berita 48 jam terakhir tentang {label} dan kondisi pasar {kind} secara umum. Perhatikan juga peristiwa makro terjadwal, regulasi, peretasan exchange, dan aliran dana ETF.
Nilai sentimen berita untuk harga {label} dalam jangka pendek. Hanya berdasarkan hasil pencarian, jangan mengarang. Kalau tidak ada berita relevan, beri NEUTRAL dengan confidence rendah.
{NEWS_JSON_RULES}"""
    errs = []
    for model in GEMINI_MODELS:
        try:
            resp = client.models.generate_content(
                model=model, contents=prompt,
                config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())]),
            )
            return _parse_news(parse_json_text(resp.text), _grounding_sources(resp), "google_search"), None
        except Exception as e:
            errs.append(f"{model}: {_short_error(e)}")
            print(f"Gemini berita (search) {model} gagal: {e}")
    return None, "; ".join(errs)


NEWS_FEEDS = {
    "crypto": [("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
               ("Cointelegraph", "https://cointelegraph.com/rss"),
               ("Decrypt", "https://decrypt.co/feed")],
    "forex": [("FXStreet", "https://www.fxstreet.com/rss/news")],
}


def fetch_headlines(is_forex: bool, per_source: int = 8) -> list:
    out = []
    for name, url in NEWS_FEEDS["forex" if is_forex else "crypto"]:
        try:
            res = HTTP.get(url, timeout=5)
            if res.status_code != 200:
                continue
            n = 0
            for item in ET.fromstring(res.content).iter("item"):
                title = " ".join((item.findtext("title") or "").split())
                if title:
                    out.append({"title": title[:140], "source": name})
                    n += 1
                if n >= per_source:
                    break
        except Exception as e:
            print(f"RSS {name} gagal: {e}")
    return out


def _news_via_rss(sym: str, label: str):
    """Judul berita dari RSS media, dinilai oleh Gemini tanpa alat pencarian (gratis)."""
    if not client:
        return None, "GEMINI_API_KEY belum dipasang"
    heads = fetch_headlines(sym in FOREX_SYMBOLS)
    if not heads:
        return None, "feed berita RSS tidak bisa dijangkau dari server"
    lines = "\n".join(f"{i + 1}. [{h['source']}] {h['title']}" for i, h in enumerate(heads))
    prompt = f"""Hari ini {time.strftime('%Y-%m-%d')}. Berikut judul berita terbaru dari media keuangan:
{lines}

Nilai dampak berita-berita itu terhadap harga {label} dalam jangka pendek. Hanya gunakan daftar di atas dan jangan mengarang. Abaikan judul yang tidak berkaitan dengan {label} atau kondisi pasar secara umum. Kalau tidak ada yang relevan, beri NEUTRAL dengan confidence rendah. Untuk headlines, pilih maksimal 4 judul paling relevan dari daftar.
{NEWS_JSON_RULES}"""
    errs = []
    for model in GEMINI_MODELS:
        try:
            resp = client.models.generate_content(
                model=model, contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            return _parse_news(parse_json_text(resp.text), [], "rss"), None
        except Exception as e:
            errs.append(f"{model}: {_short_error(e)}")
            print(f"Gemini berita (rss) {model} gagal: {e}")
    return None, "; ".join(errs)


def call_gemini_news(sym: str):
    """Berita dan sentimen. Mengembalikan (data, pesan_error)."""
    label = asset_label(sym)
    hit = _news_cache.get(label)
    if hit and time.time() - hit[0] < NEWS_CACHE_SECONDS:
        return hit[1], None
    errors = []
    for method, fn in ((("search", _news_via_search),) if NEWS_SEARCH else ()) + (("rss", _news_via_rss),):
        data, err = fn(sym, label)
        if data:
            _news_cache[label] = (time.time(), data)
            return data, None
        errors.append(f"{method}: {err}")
    return None, " | ".join(errors)[:600]


def combine_signals(tech: dict, news, engine: str, news_err=None) -> dict:
    """Gabungkan teknikal dan berita dengan aturan yang bisa dibaca dan dicek."""
    out = dict(tech)
    notes = []
    d = {"BUY": 1, "SELL": -1}.get(out["action"], 0)
    if d and news:
        agree = d * news["score"] * news["confidence"] / 100
        if agree <= -0.5:
            out.update(action="HOLD", confidence=50, stop_loss=0, take_profit=0)
            notes.append("Berita berlawanan kuat dengan sinyal teknikal, aksi diubah menjadi Tahan.")
        elif agree < -0.2:
            out["confidence"] -= 15
            notes.append("Berita berlawanan dengan sinyal teknikal, keyakinan turun 15.")
        elif agree > 0.3:
            out["confidence"] += 5
            notes.append("Berita searah dengan sinyal teknikal, keyakinan naik 5.")
        if news["risk_event"] and out["action"] != "HOLD":
            out["confidence"] -= 15
            notes.append("Ada peristiwa berisiko tinggi dalam 24 jam, keyakinan turun 15.")
    elif d and not news:
        notes.append("Data berita tidak tersedia, sinyal ini murni teknikal.")
    out["confidence"] = int(max(0, min(95, out["confidence"])))
    out["components"] = {
        "technical": {"engine": engine, "action": tech["action"], "confidence": tech["confidence"], "reasoning": tech["reasoning"]},
        "news": ({"available": True, **news} if news else {"available": False, "reason": news_err or "tidak diketahui"}),
        "adjustments": notes,
    }
    return out


def run_ai(m: dict, atr):
    """Teknikal dan berita dijalankan bersamaan. Mengembalikan (hasil, berhasil)."""
    with ThreadPoolExecutor(max_workers=2) as ex:
        f_tech = ex.submit(technical_signal, m, atr)
        f_news = ex.submit(call_gemini_news, m["symbol"])
        tech, engine = f_tech.result()
        try:
            news, news_err = f_news.result()
        except Exception as e:
            print(f"Berita gagal: {e}")
            news, news_err = None, _short_error(e)
    if tech is None:
        return fallback_ai("Mesin analisis tidak tersedia. Periksa DEEPSEEK_API_KEY atau GEMINI_API_KEY, atau coba lagi sebentar."), False
    return combine_signals(tech, news, engine, news_err), True


# ---------------------------------------------------------------- endpoint
@app.get("/")
def root():
    return {"status": "ONLINE", "system": "Si Paling Trading Engine", "version": "4.1.0", "ai_ready": client is not None or bool(DEEPSEEK_API_KEY),
            "engines": {"technical": "deepseek" if DEEPSEEK_API_KEY else ("gemini" if client else "none"), "news": client is not None}}


STABLECOINS = {"USDC", "FDUSD", "TUSD", "USDP", "DAI", "BUSD", "USDE", "USD1", "XUSD", "PYUSD",
               "USDS", "BFUSD", "RLUSD", "EUR", "EURI", "AEUR", "UST", "USDT"}
_market_cache: dict = {"t": 0.0, "data": []}


def fetch_market_tickers() -> list:
    """Semua pasangan USDT di Binance dengan perubahan 24 jam, diurutkan dari volume terbesar."""
    for host in BINANCE_HOSTS:
        try:
            res = HTTP.get(f"{host}/api/v3/ticker/24hr", timeout=10)
        except requests.RequestException:
            continue
        if res.status_code != 200:
            continue
        out = []
        for t in res.json():
            sym = t.get("symbol", "")
            if not sym.endswith("USDT"):
                continue
            base = sym[:-4]
            try:
                price, change, vol = float(t["lastPrice"]), float(t["priceChangePercent"]), float(t["quoteVolume"])
            except (KeyError, ValueError):
                continue
            if base in STABLECOINS or price <= 0 or vol < 100_000:
                continue
            out.append({"symbol": sym, "base": base, "price": price, "change": round(change, 2), "volume": round(vol)})
        if out:
            return sorted(out, key=lambda x: x["volume"], reverse=True)
    raise SourceDown("Data pasar Binance tidak bisa dihubungi. Coba lagi sebentar.")


@app.get("/market")
def get_market(limit: int = 120):
    if time.time() - _market_cache["t"] > 30 or not _market_cache["data"]:
        try:
            _market_cache["data"] = fetch_market_tickers()
            _market_cache["t"] = time.time()
        except SourceDown as e:
            raise http_error(e)
    return _market_cache["data"][: max(10, min(limit, 300))]


@app.get("/klines")
def get_klines(response: Response, symbol: str = "BTCUSDT", interval: str = "15m", limit: int = DEFAULT_CANDLES):
    check_interval(interval)
    try:
        data, source = get_candles(symbol, interval, max(50, min(limit, 1000)))
    except (UnknownSymbol, SourceDown) as e:
        raise http_error(e)
    response.headers["X-Data-Source"] = source
    return data


@app.get("/analyze")
def analyze_market(response: Response, symbol: str = "BTCUSDT", interval: str = "15m"):
    check_interval(interval)
    sym = normalize_symbol(symbol)
    key = f"{sym}_{interval}"
    now = time.time()

    hit = _analysis_cache.get(key)
    if hit and now - hit[0] < ANALYSIS_CACHE_SECONDS:
        response.headers["X-Data-Source"] = hit[2]
        return hit[1]

    try:
        klines, source = get_candles(sym, interval, ANALYZE_CANDLES)
    except (UnknownSymbol, SourceDown) as e:
        raise http_error(e)
    if len(klines) < 30:
        raise HTTPException(status_code=422, detail="Data candle belum cukup untuk dianalisa (minimal 30).")

    closes = [k["close"] for k in klines]
    price = closes[-1]
    first_open = klines[0]["open"]
    change_pct = (price - first_open) / first_open * 100 if first_open > 0 else 0.0

    ema_50, ema_200 = calc_ema(closes, 50), calc_ema(closes, 200)
    atr = calc_atr(klines)
    bb = calc_bollinger(closes)
    window = klines[-50:]

    if ema_50 is None:
        trend, basis = "SIDEWAYS", "data kurang dari 50 candle"
    elif ema_200 is None:
        trend = "BULLISH" if price >= ema_50 else "BEARISH"
        basis = "harga vs EMA 50 (data kurang dari 200 candle)"
    elif price >= ema_50 >= ema_200:
        trend, basis = "BULLISH", "harga > EMA 50 > EMA 200"
    elif price < ema_50 < ema_200:
        trend, basis = "BEARISH", "harga < EMA 50 < EMA 200"
    else:
        trend, basis = "SIDEWAYS", "EMA 50 dan EMA 200 tidak searah"

    is_idr = "IDR" in sym
    market = {
        "symbol": sym,
        "interval": interval,
        "candles": len(klines),
        "current_price": price,
        "previous_close": first_open,  # harga buka candle pertama pada jendela data
        "price_in_idr": price if is_idr or sym in FOREX_SYMBOLS else price * USD_IDR_RATE,
        "price_change_nominal": sig(price - first_open),
        "price_change_percent": round(change_pct, 2),  # selama jendela data, bukan 24 jam
        "rsi_14": calc_rsi(closes),
        "macd_hist": calc_macd_hist(closes),
        "ema_50": ema_50,
        "ema_200": ema_200,
        "bollinger": bb,
        "atr_14": atr,
        "support": min(k["low"] for k in window),
        "resistance": max(k["high"] for k in window),
        "trend": trend,
        "trend_basis": basis,
    }

    ai, ok = run_ai(market, atr)
    payload = {"market_data": market, "ai_analysis": ai}

    if ok:  # jangan simpan pesan error AI selama 5 menit
        if len(_analysis_cache) > 100:
            _analysis_cache.clear()
        _analysis_cache[key] = (now, payload, source)
    response.headers["X-Data-Source"] = source
    return payload


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
