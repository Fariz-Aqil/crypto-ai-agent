"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import WishlistBubbles from "../components/WishlistBubbles";

// WEB3 INTEGRATION
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

const CryptoChart = dynamic(() => import("../components/CryptoChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] bg-slate-900/40 backdrop-blur-md rounded-2xl flex items-center justify-center text-cyan-400/60 text-xs font-mono border border-cyan-500/10 animate-pulse">
      ⚡ Initializing Cyber Chart Engine...
    </div>
  ),
});

const ForexChart = dynamic(() => import("../components/ForexChart"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] bg-slate-900/40 backdrop-blur-md rounded-2xl flex items-center justify-center text-cyan-400/60 text-xs font-mono border border-cyan-500/10 animate-pulse">
      ⚡ Initializing Cyber Chart Engine...
    </div>
  ),
});

const POPULAR_ASSETS = [
  { label: "BTC", value: "BTCUSDT" },
  { label: "ETH", value: "ETHUSDT" },
  { label: "SOL", value: "SOLUSDT" },
  { label: "SUI", value: "SUIUSDT" },
  { label: "PEPE", value: "PEPEUSDT" },
  { label: "GOLD", value: "XAUUSD" },
  { label: "EUR/USD", value: "EURUSD" },
];

const TIMEFRAMES = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
];

const FOREX_AND_COMMODITIES = [
  "XAUUSD",
  "XAGUSD",
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
];

export default function Home() {
  const [inputSymbol, setInputSymbol] = useState("SUI");
  const [selectedSymbol, setSelectedSymbol] = useState("SUIUSDT");
  const [selectedTimeframe, setSelectedTimeframe] = useState("15m");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [wishlist, setWishlist] = useState<string[]>([]);

  // HOOK WEB3 WAGMI
  const { address, isConnected } = useAccount();

  // State untuk Modal Crypto Bubbles Mode & Smooth Fade Out Transition
  const [showBubbles, setShowBubbles] = useState<boolean>(false);
  const [isIdleTriggered, setIsIdleTriggered] = useState<boolean>(false);
  const [isExitingBubbles, setIsExitingBubbles] = useState<boolean>(false);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const canDismissRef = useRef<boolean>(false);

  // --- EFFECT UNTUK LOAD WATCHLIST BERDASARKAN WALLET ADDRESS ---
  useEffect(() => {
    setIsMounted(true);
    
    // Gunakan key terpisah berdasarkan address wallet atau guest
    const storageKey = address
      ? `quantum_wishlist_${address.toLowerCase()}`
      : "quantum_wishlist_guest";
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        setWishlist(JSON.parse(saved));
      } catch (e) {
        setWishlist(["BTCUSDT", "SUIUSDT", "XAUUSD"]);
      }
    } else {
      setWishlist(["BTCUSDT", "SUIUSDT", "XAUUSD"]);
    }
  }, [address]);

  // Fungsi pembantu untuk menutup modal dengan animasi Fade Out
  const handleCloseBubbles = () => {
    setIsExitingBubbles(true);
    setTimeout(() => {
      setShowBubbles(false);
      setIsIdleTriggered(false);
      setIsExitingBubbles(false);
    }, 300);
  };

  // --- DETEKTOR KURSOR IDLE (DENGAN ANIMASI FADE-OUT) ---
  useEffect(() => {
    if (!isMounted) return;

    const resetIdleTimer = () => {
      if (isIdleTriggered && canDismissRef.current && !isExitingBubbles) {
        canDismissRef.current = false;
        handleCloseBubbles();
      }

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      idleTimerRef.current = setTimeout(() => {
        setIsIdleTriggered(true);
        setIsExitingBubbles(false);
        setShowBubbles(true);
        canDismissRef.current = false;

        setTimeout(() => {
          canDismissRef.current = true;
        }, 1000);
      }, 30000);
    };

    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, resetIdleTimer)
    );

    resetIdleTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      activityEvents.forEach((evt) =>
        window.removeEventListener(evt, resetIdleTimer)
      );
    };
  }, [isMounted, isIdleTriggered, isExitingBubbles]);

  // --- TOGGLE WATCHLIST (SIMPAN SPESIFIK KE WALLET ADDRESS) ---
  const toggleWishlist = (symbol: string) => {
    let updated: string[];
    if (wishlist.includes(symbol)) {
      updated = wishlist.filter((item) => item !== symbol);
    } else {
      updated = [...wishlist, symbol];
    }
    setWishlist(updated);

    const storageKey = address
      ? `quantum_wishlist_${address.toLowerCase()}`
      : "quantum_wishlist_guest";
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const getAssetLogo = (sym: string) => {
    const clean = sym
      .toUpperCase()
      .replace("USDT", "")
      .replace("BIDR", "")
      .replace("IDR", "")
      .replace("/", "");

    if (clean === "XAU" || clean === "XAUUSD" || clean === "GOLD") {
      return "https://s3-symbol-logo.tradingview.com/metal/gold.svg";
    }
    if (clean === "EURUSD")
      return "https://s3-symbol-logo.tradingview.com/country/EU.svg";
    if (clean === "GBPUSD")
      return "https://s3-symbol-logo.tradingview.com/country/GB.svg";

    return `https://s3-symbol-logo.tradingview.com/crypto/XTVC${clean}.svg`;
  };

  const fetchAnalysis = async (
    symbolToFetch = selectedSymbol,
    tfToFetch = selectedTimeframe
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/analyze?symbol=${symbolToFetch}&interval=${tfToFetch}`
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(
          errJson.detail || "Aset tidak ditemukan / Gagal terhubung ke backend"
        );
      }
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isMounted) {
      fetchAnalysis(selectedSymbol, selectedTimeframe);
    }
  }, [selectedSymbol, selectedTimeframe, isMounted]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSymbol.trim()) return;

    let cleanSymbol = inputSymbol.trim().toUpperCase().replace("/", "");

    if (cleanSymbol === "USDT") {
      cleanSymbol = "USDTIDR";
    } else if (cleanSymbol === "GOLD" || cleanSymbol === "XAU") {
      cleanSymbol = "XAUUSD";
    } else if (
      !FOREX_AND_COMMODITIES.includes(cleanSymbol) &&
      !cleanSymbol.endsWith("USDT") &&
      !cleanSymbol.endsWith("IDR")
    ) {
      cleanSymbol += "USDT";
    }

    setSelectedSymbol(cleanSymbol);
  };

  const handleQuickSelect = (val: string) => {
    setInputSymbol(val.replace("USDT", "").replace("IDR", ""));
    setSelectedSymbol(val);
  };

  const ai = data?.ai_analysis;
  const market = data?.market_data;
  const isIdr = selectedSymbol.includes("IDR");
  const isForexOrGold = FOREX_AND_COMMODITIES.includes(selectedSymbol);
  const isWishlisted = wishlist.includes(selectedSymbol);
  const isPositive = (market?.price_change_percent ?? 0) >= 0;

  const formatSymbolDisplay = (sym: string) => {
    if (sym.endsWith("USDT")) return sym.replace("USDT", " / USDT");
    if (sym.endsWith("IDR")) return sym.replace("IDR", " / IDR");
    if (sym.length === 6 && !sym.endsWith("USDT"))
      return `${sym.slice(0, 3)} / ${sym.slice(3)}`;
    return sym;
  };

  return (
    <div
      className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans relative overflow-x-hidden"
      suppressHydrationWarning
    >
      {/* Overlay Modal Crypto Bubbles Mode */}
      {showBubbles && (
        <WishlistBubbles
          wishlist={wishlist}
          isIdleTriggered={isIdleTriggered}
          isExiting={isExitingBubbles}
          onSelectAsset={(sym) => {
            setSelectedSymbol(sym);
            setInputSymbol(sym.replace("USDT", "").replace("IDR", ""));
          }}
          onClose={handleCloseBubbles}
        />
      )}

      {/* Background Ambient Glow */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Header Utama Glassmorphism */}
      <header className="sticky top-0 z-40 px-6 py-3.5 bg-[#090d16]/70 backdrop-blur-xl border-b border-cyan-500/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex justify-between items-center flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-950/80 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            <span className="text-cyan-400 text-lg">⚡</span>
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-wider bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent uppercase font-mono">
              SI PALING TRADING
            </h1>
            <p className="text-[10px] text-slate-400 tracking-widest uppercase font-mono flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Real-time AI Analysis Engine
            </p>
          </div>
        </div>

        {/* WEB3 CONNECT WALLET, BUBBLES BUTTON & SEARCH BAR */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Tombol Web3 RainbowKit */}
          <ConnectButton chainStatus="icon" showBalance={false} />

          <button
            onClick={() => {
              setIsIdleTriggered(false);
              setIsExitingBubbles(false);
              setShowBubbles(true);
            }}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-mono bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 transition shadow-[0_0_10px_rgba(6,182,212,0.2)] active:scale-95"
            title="Buka Tampilan Crypto Bubbles Wishlist"
          >
            <span>🫧</span>
            <span className="font-bold">BUBBLES</span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
            {POPULAR_ASSETS.map((asset) => (
              <button
                key={asset.value}
                onClick={() => handleQuickSelect(asset.value)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-mono transition-all duration-300 ${
                  selectedSymbol === asset.value
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)] font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <img
                  src={getAssetLogo(asset.value)}
                  alt={asset.label}
                  className="w-3.5 h-3.5 rounded-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
                {asset.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="CARI ASET (SUI, XAUUSD)..."
              value={inputSymbol}
              onChange={(e) => setInputSymbol(e.target.value)}
              className="bg-slate-950/90 border border-cyan-500/30 text-xs text-cyan-200 placeholder-slate-600 px-3.5 py-2 rounded-xl focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_15px_rgba(6,182,212,0.3)] uppercase font-mono w-52 transition-all"
            />
            <button
              type="submit"
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl transition shadow-[0_0_15px_rgba(6,182,212,0.4)] active:scale-95"
            >
              Cari
            </button>
          </form>
        </div>
      </header>

      {/* Konten Utama Grid */}
      <main className="flex-1 p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 z-10">
        <section className="lg:col-span-3 bg-[#0c101c]/60 backdrop-blur-xl rounded-2xl p-5 border border-cyan-500/20 shadow-2xl flex flex-col justify-between gap-4 relative">
          <div className="flex justify-between items-center flex-wrap gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-900 border border-cyan-500/30 p-1 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.3)] overflow-hidden">
                <img
                  src={getAssetLogo(selectedSymbol)}
                  alt={selectedSymbol}
                  className="w-full h-full object-cover rounded-full"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "https://s3-symbol-logo.tradingview.com/crypto/XTVCBTC.svg";
                  }}
                />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-100 uppercase tracking-widest font-mono">
                    {formatSymbolDisplay(selectedSymbol)}
                  </h2>

                  <button
                    onClick={() => toggleWishlist(selectedSymbol)}
                    title={
                      isWishlisted
                        ? "Hapus dari Watchlist"
                        : "Tambah ke Watchlist Seriuss"
                    }
                    className={`text-lg transition-transform active:scale-125 ${
                      isWishlisted
                        ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                        : "text-slate-600 hover:text-slate-300"
                    }`}
                  >
                    ★
                  </button>

                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-mono">
                    {selectedTimeframe.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setSelectedTimeframe(tf.value)}
                  className={`text-xs px-3 py-1 rounded-lg font-mono transition-all ${
                    selectedTimeframe === tf.value
                      ? "bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* LIVE PRICE HEADER RESMI */}
            <div className="text-right font-mono">
              <span className="text-[10px] uppercase text-slate-500 font-semibold tracking-wider block">
                LIVE PRICE
              </span>

              {/* Live Price Utama */}
              <span
                className="text-2xl font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.4)] block leading-tight"
                suppressHydrationWarning
              >
                {isMounted && market?.current_price
                  ? isIdr
                    ? `Rp ${market.current_price.toLocaleString("id-ID")}`
                    : `$${
                        market.current_price < 0.001
                          ? market.current_price.toFixed(8)
                          : market.current_price < 1
                          ? market.current_price.toFixed(4)
                          : market.current_price.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                      }`
                  : "..."}
              </span>

              {/* Konversi IDR (Hanya tampil jika aset BUKAN berpasangan IDR) */}
              {isMounted && market?.price_in_idr && !isIdr && (
                <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                  ≈ Rp{" "}
                  {market.price_in_idr.toLocaleString("id-ID", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}

              {/* Selisih Nominal & Persentase 24H */}
              {isMounted && market && (
                <div
                  className={`flex items-center justify-end gap-1 text-[11px] font-bold mt-0.5 ${
                    isPositive ? "text-emerald-400" : "text-rose-500"
                  }`}
                >
                  <span>{isPositive ? "▲" : "▼"}</span>
                  <span>
                    {isIdr
                      ? `Rp ${Math.abs(market.price_change_nominal || 0).toLocaleString("id-ID")}`
                      : `$${Math.abs(market.price_change_nominal || 0).toFixed(4)}`}
                  </span>
                  <span>
                    (
                    {isPositive
                      ? `+${market.price_change_percent}%`
                      : `${market.price_change_percent}%`}
                    )
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="w-full flex-1 min-h-[420px] rounded-xl overflow-hidden border border-slate-800/80 relative bg-slate-950/50">
            {isForexOrGold ? (
              <ForexChart
                key={`${selectedSymbol}-${selectedTimeframe}`}
                symbol={selectedSymbol}
                interval={selectedTimeframe}
              />
            ) : (
              <CryptoChart
                key={`${selectedSymbol}-${selectedTimeframe}`}
                symbol={selectedSymbol}
                interval={selectedTimeframe}
              />
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                RSI (14)
              </span>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-sm font-mono font-bold text-slate-200">
                  {market?.rsi_14 ?? "50.0"}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold ${
                    (market?.rsi_14 ?? 50) > 65
                      ? "text-red-400"
                      : (market?.rsi_14 ?? 50) < 35
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {(market?.rsi_14 ?? 50) > 65
                    ? "OVERBOUGHT"
                    : (market?.rsi_14 ?? 50) < 35
                    ? "OVERSOLD"
                    : "NEUTRAL"}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                EMA 50
              </span>
              <span className="text-sm font-mono font-bold text-slate-200 mt-1 truncate">
                {market?.ema_50
                  ? isIdr
                    ? `Rp ${market.ema_50.toLocaleString("id-ID")}`
                    : `$${
                        market.ema_50 < 0.01
                          ? market.ema_50.toFixed(6)
                          : market.ema_50.toLocaleString("en-US")
                      }`
                  : "..."}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                EMA 200
              </span>
              <span className="text-sm font-mono font-bold text-slate-200 mt-1 truncate">
                {market?.ema_200
                  ? isIdr
                    ? `Rp ${market.ema_200.toLocaleString("id-ID")}`
                    : `$${
                        market.ema_200 < 0.01
                          ? market.ema_200.toFixed(6)
                          : market.ema_200.toLocaleString("en-US")
                      }`
                  : "..."}
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                Market Trend
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    market?.trend === "BULLISH"
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                      : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]"
                  }`}
                />
                <span
                  className={`text-sm font-mono font-extrabold tracking-wider ${
                    market?.trend === "BULLISH"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {market?.trend ?? "SCANNING..."}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className="bg-[#0c101c]/60 backdrop-blur-xl rounded-2xl p-5 border border-cyan-500/20 shadow-2xl flex flex-col justify-between gap-4">
            <div>
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 text-sm">🤖</span>
                  <h2 className="text-xs font-bold text-cyan-300 uppercase tracking-wider font-mono">
                    QUANTUM AI SIGNAL
                  </h2>
                </div>
                <span className="text-[10px] font-mono bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
                  GEMINI 3.6
                </span>
              </div>

              {loading ? (
                <div className="bg-slate-950/80 border border-cyan-500/20 p-6 rounded-xl space-y-3 animate-pulse text-center">
                  <div className="relative inline-block">
                    <span className="text-2xl block">🌐</span>
                    <div className="absolute inset-0 rounded-full border border-cyan-400 animate-ping opacity-75" />
                  </div>
                  <p className="text-[11px] font-mono text-cyan-400/80 tracking-wider">
                    Analyzing neural data...
                  </p>
                </div>
              ) : error ? (
                <div className="bg-red-950/20 border border-red-500/40 p-4 rounded-xl text-center space-y-2">
                  <p className="text-xs text-red-400 font-mono">⚠️ {error}</p>
                  <button
                    onClick={() => fetchAnalysis()}
                    className="text-xs bg-red-600/80 hover:bg-red-500 text-white font-mono px-4 py-1.5 rounded-lg transition shadow-md"
                  >
                    RETRY SCAN
                  </button>
                </div>
              ) : (
                <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-4 relative overflow-hidden">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">
                        RECOMMENDATION
                      </span>
                      <span
                        className={`text-2xl font-black font-mono tracking-wider ${
                          ai?.action === "BUY"
                            ? "text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.5)]"
                            : ai?.action === "SELL"
                            ? "text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.5)]"
                            : "text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]"
                        }`}
                      >
                        {ai?.action}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 font-mono uppercase block">
                        CONFIDENCE
                      </span>
                      <span className="text-xs font-mono font-bold bg-cyan-500/10 text-cyan-300 px-3 py-1 rounded-full border border-cyan-500/30">
                        {ai?.confidence}%
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-800">
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {ai?.reasoning}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 font-mono">
                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-red-500/20">
                      <span className="text-slate-500 block text-[10px] uppercase">
                        STOP LOSS
                      </span>
                      <span
                        className="text-xs text-red-400 font-bold block mt-0.5 truncate"
                        suppressHydrationWarning
                      >
                        {isMounted && ai?.stop_loss
                          ? isIdr
                            ? `Rp ${Math.round(ai.stop_loss).toLocaleString("id-ID")}`
                            : `$${
                                ai.stop_loss < 0.01
                                  ? ai.stop_loss.toFixed(8)
                                  : ai.stop_loss.toLocaleString("en-US")
                              }`
                          : "..."}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-emerald-500/20">
                      <span className="text-slate-500 block text-[10px] uppercase">
                        TAKE PROFIT
                      </span>
                      <span
                        className="text-xs text-emerald-400 font-bold block mt-0.5 truncate"
                        suppressHydrationWarning
                      >
                        {isMounted && ai?.take_profit
                          ? isIdr
                            ? `Rp ${Math.round(ai.take_profit).toLocaleString("id-ID")}`
                            : `$${
                                ai.take_profit < 0.01
                                  ? ai.take_profit.toFixed(8)
                                  : ai.take_profit.toLocaleString("en-US")
                              }`
                          : "..."}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => fetchAnalysis()}
                disabled={loading}
                className="w-full mt-3 py-3 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-black font-mono rounded-xl text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.4)] active:scale-[0.98]"
              >
                {loading ? "SCANNING MARKET..." : "RUN NEURAL SCAN"}
              </button>
            </div>
          </div>

          <div className="bg-[#0c101c]/60 backdrop-blur-xl rounded-2xl p-4 border border-cyan-500/20 shadow-2xl flex flex-col gap-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-xs">★</span>
                <h3 className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                  SERIOUS WATCHLIST
                </h3>
              </div>

              {/* STATS WATCHLIST + INDIKATOR WALLET ADDRESS */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                  {isConnected && address
                    ? `${address.slice(0, 4)}...${address.slice(-4)}`
                    : "GUEST MODE"}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {wishlist.length} ASET
                </span>
              </div>
            </div>

            {wishlist.length === 0 ? (
              <p className="text-[11px] text-slate-500 font-mono text-center py-4">
                Belum ada aset di-bookmark. Klik bintang ★ pada chart untuk
                menambahkan.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {wishlist.map((item) => (
                  <div
                    key={item}
                    onClick={() => handleQuickSelect(item)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all border ${
                      selectedSymbol === item
                        ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300"
                        : "bg-slate-950/40 border-slate-800/80 text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={getAssetLogo(item)}
                        alt={item}
                        className="w-4 h-4 rounded-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                        }}
                      />
                      <span className="text-xs font-mono font-bold uppercase">
                        {formatSymbolDisplay(item)}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWishlist(item);
                      }}
                      className="text-amber-400 hover:text-red-400 text-sm px-1.5"
                      title="Hapus dari Wishlist"
                    >
                      ★
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}