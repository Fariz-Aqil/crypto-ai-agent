"use client";

import { useEffect, useState } from "react";

interface BubbleItem {
  symbol: string;
  price: number;
  change24h: number;
}

interface WishlistBubblesProps {
  wishlist: string[];
  onSelectAsset: (symbol: string) => void;
  onClose: () => void;
  isIdleTriggered?: boolean;
  isExiting?: boolean;
}

export default function WishlistBubbles({
  wishlist,
  onSelectAsset,
  onClose,
  isIdleTriggered = false,
  isExiting = false,
}: WishlistBubblesProps) {
  const [bubbleData, setBubbleData] = useState<BubbleItem[]>([]);
  const [loading, setLoading] = useState(true);

  const getAssetLogo = (sym: string) => {
    const clean = sym
      .toUpperCase()
      .replace("USDT", "")
      .replace("IDR", "")
      .replace("/", "");

    if (clean === "XAU" || clean === "XAUUSD" || clean === "GOLD") {
      return "https://s3-symbol-logo.tradingview.com/metal/gold.svg";
    }
    if (clean === "EURUSD") return "https://s3-symbol-logo.tradingview.com/country/EU.svg";
    if (clean === "GBPUSD") return "https://s3-symbol-logo.tradingview.com/country/GB.svg";

    return `https://s3-symbol-logo.tradingview.com/crypto/XTVC${clean}.svg`;
  };

  useEffect(() => {
    let isSubscribed = true;

    const fetchWishlistPerformance = async () => {
      setLoading(true);

      const promises = wishlist.map(async (sym) => {
        try {
          // 1. Ambil data dari Backend FastAPI (Interval 1d untuk 24h)
          const res = await fetch(`http://127.0.0.1:8000/analyze?symbol=${sym}&interval=1d`);
          if (res.ok) {
            const data = await res.json();
            const currPrice = data?.market_data?.current_price || 0;
            const change = data?.market_data?.price_change_percent ?? 0;

            return {
              symbol: sym,
              price: currPrice,
              change24h: roundToTwo(change),
            };
          }

          // 2. Fallback ke Binance jika backend offline
          if (sym.endsWith("USDT")) {
            const binanceRes = await fetch(`https://api.binance.com/api/3/ticker/24hr?symbol=${sym}`);
            if (binanceRes.ok) {
              const ticker = await binanceRes.json();
              return {
                symbol: sym,
                price: parseFloat(ticker.lastPrice || 0),
                change24h: roundToTwo(parseFloat(ticker.priceChangePercent || 0)),
              };
            }
          }
        } catch (e) {
          console.error("Gagal mengambil data bubble:", sym, e);
        }

        return {
          symbol: sym,
          price: 0,
          change24h: 0,
        };
      });

      const results = await Promise.all(promises);

      if (isSubscribed) {
        setBubbleData(results);
        setLoading(false);
      }
    };

    if (wishlist && wishlist.length > 0) {
      fetchWishlistPerformance();
    } else {
      setLoading(false);
    }

    return () => {
      isSubscribed = false;
    };
  }, [wishlist]);

  const roundToTwo = (num: number) => Math.round(num * 100) / 100;

  // Ukuran bubble proporsional: Minimal 110px, Maksimal 190px berdasarkan nilai mutlak persentase
  const getBubbleSize = (change: number) => {
    const absChange = Math.abs(change);
    const minSize = 110;
    const maxSize = 190;
    const calculated = minSize + absChange * 10;
    return Math.min(Math.max(calculated, minSize), maxSize);
  };

  const formatSymbolDisplay = (sym: string) => {
    if (!sym) return "";
    return sym.replace("USDT", "").replace("IDR", "").replace("/", "");
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#05070c]/90 backdrop-blur-2xl flex flex-col justify-between p-6 transition-all duration-300 overflow-hidden ${
        isExiting ? "animate-fade-out" : "animate-fade-in"
      }`}
    >
      {/* Ambient Glow background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none" />

      {/* Header Modal */}
      <div className="flex justify-between items-center z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🫧</span>
            <h2 className="text-lg font-black tracking-widest bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent uppercase font-mono">
              QUANTUM WISHLIST BUBBLES
            </h2>
          </div>
          <p className="text-[11px] text-slate-400 font-mono tracking-wider mt-0.5">
            {isIdleTriggered
              ? "⚡ Idle Screensaver Mode - GERAKKAN MOUSE / TOUCH LAYAR UNTUK KEMBALI"
              : "Klik gelembung untuk langsung membuka chart"}
          </p>
        </div>

        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-900/80 hover:bg-slate-800 border border-cyan-500/30 text-cyan-400 font-mono text-xs rounded-xl transition shadow-[0_0_15px_rgba(6,182,212,0.2)]"
        >
          ✕ TUTUP [ESC]
        </button>
      </div>

      {/* Area Gelembung Melayang */}
      <div className="flex-1 flex items-center justify-center p-8 z-10 overflow-y-auto">
        {loading ? (
          <div className="text-center font-mono text-cyan-400 text-sm animate-pulse space-y-3">
            <span className="text-4xl block animate-bounce">🫧</span>
            <p>Mengkalkulasi Perubahan 24 Jam Wishlist...</p>
          </div>
        ) : wishlist.length === 0 ? (
          <div className="text-center font-mono text-slate-500 text-sm space-y-2">
            <p>Belum ada aset di Watchlist.</p>
            <p className="text-xs text-slate-600">
              Tambahkan bintang ★ pada koin favoritmu terlebih dahulu.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-8 max-w-5xl">
            {bubbleData.map((item, idx) => {
              const isPositive = item.change24h >= 0;
              const size = getBubbleSize(item.change24h);
              const animDelay = `${(idx % 4) * 0.7}s`;

              return (
                <div
                  key={item.symbol || idx}
                  onClick={() => {
                    if (item.symbol) {
                      onSelectAsset(item.symbol);
                      onClose();
                    }
                  }}
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    animationDelay: animDelay,
                  }}
                  className={`animate-float rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:scale-125 hover:z-20 active:scale-90 shadow-2xl relative group p-2 text-center border ${
                    isPositive
                      ? "bg-gradient-to-b from-emerald-950/80 to-emerald-900/40 border-emerald-500/60 shadow-[0_0_35px_rgba(16,185,129,0.35)] text-emerald-300 hover:shadow-[0_0_50px_rgba(16,185,129,0.7)]"
                      : "bg-gradient-to-b from-red-950/80 to-red-900/40 border-red-500/60 shadow-[0_0_35px_rgba(239,68,68,0.35)] text-red-300 hover:shadow-[0_0_50px_rgba(239,68,68,0.7)]"
                  }`}
                >
                  <img
                    src={getAssetLogo(item.symbol)}
                    alt={item.symbol}
                    className="w-7 h-7 rounded-full object-cover mb-1 shadow-md transition-transform group-hover:scale-110"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs font-black font-mono tracking-wider">
                    {formatSymbolDisplay(item.symbol)}
                  </span>
                  <span className="text-[11px] font-mono font-bold mt-0.5">
                    {isPositive ? `+${item.change24h}%` : `${item.change24h}%`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="text-center text-[10px] font-mono text-slate-500 z-10">
        POWERED BY QUANTUM NEURAL BUBBLE ENGINE • AUTO-HYDRA SYNC
      </div>
    </div>
  );
}