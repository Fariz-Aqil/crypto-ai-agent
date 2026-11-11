"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import WishlistBubbles from "../components/WishlistBubbles";
import DemoBalance, { Signal } from "../components/DemoBalance";
import { Confluence, Stats, RiskCalc } from "../components/AiAnalysisPanel";
import { analyze, fmt, Candle } from "../components/AiAnalysisPanel";

const CryptoChart = dynamic(() => import("../components/CryptoChart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const POPULAR = [
  { label: "BTC", value: "BTCUSDT" }, { label: "ETH", value: "ETHUSDT" }, { label: "SOL", value: "SOLUSDT" },
  { label: "SUI", value: "SUIUSDT" }, { label: "PEPE", value: "PEPEUSDT" }, { label: "Emas", value: "XAUUSD" },
  { label: "EUR/USD", value: "EURUSD" },
];
const EXCHANGES = [
  { name: "Indodax", url: "https://indodax.com" },
  { name: "Tokocrypto", url: "https://www.tokocrypto.com" },
  { name: "Pintu", url: "https://pintu.co.id" },
];
const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
const FOREX = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"];
const ACTION: Record<string, { t: string; c: string }> = {
  BUY: { t: "Beli", c: "text-up" }, SELL: { t: "Jual", c: "text-down" }, HOLD: { t: "Tahan", c: "text-hold" },
};

const logo = (sym: string) => {
  const c = sym.toUpperCase().replace("USDT", "").replace("IDR", "").replace("/", "");
  if (c === "XAU" || c === "XAUUSD" || c === "GOLD") return "https://s3-symbol-logo.tradingview.com/metal/gold.svg";
  if (c === "EURUSD") return "https://s3-symbol-logo.tradingview.com/country/EU.svg";
  if (c === "GBPUSD") return "https://s3-symbol-logo.tradingview.com/country/GB.svg";
  return `https://s3-symbol-logo.tradingview.com/crypto/XTVC${c}.svg`;
};
const label = (s: string) =>
  s.endsWith("USDT") ? s.replace("USDT", " / USDT") : s.endsWith("IDR") ? s.replace("IDR", " / IDR") : s.length === 6 ? `${s.slice(0, 3)} / ${s.slice(3)}` : s;

const Logo = ({ sym, size = 20 }: { sym: string; size?: number }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src={logo(sym)} alt="" width={size} height={size} className="rounded-full bg-raise" onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")} />
);

export default function Home() {
  const { address, isConnected } = useAccount();
  const [input, setInput] = useState("SUI");
  const [symbol, setSymbol] = useState("SUIUSDT");
  const [tf, setTf] = useState("15m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [cErr, setCErr] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [showBubbles, setShowBubbles] = useState(false);
  const [idle, setIdle] = useState(false);
  const [exiting, setExiting] = useState(false);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const canDismiss = useRef(false);

  const storageKey = address ? `quantum_wishlist_${address.toLowerCase()}` : "quantum_wishlist_guest";

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(storageKey);
    try { setWishlist(saved ? JSON.parse(saved) : ["BTCUSDT", "SUIUSDT", "XAUUSD"]); }
    catch { setWishlist(["BTCUSDT", "SUIUSDT", "XAUUSD"]); }
  }, [storageKey]);

  const closeBubbles = () => {
    setExiting(true);
    setTimeout(() => { setShowBubbles(false); setIdle(false); setExiting(false); }, 300);
  };

  useEffect(() => {
    if (!mounted) return;
    const reset = () => {
      if (idle && canDismiss.current && !exiting) { canDismiss.current = false; closeBubbles(); }
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setIdle(true); setExiting(false); setShowBubbles(true); canDismiss.current = false;
        setTimeout(() => { canDismiss.current = true; }, 1000);
      }, 30000);
    };
    const evts = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, reset));
    reset();
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); evts.forEach((e) => window.removeEventListener(e, reset)); };
  }, [mounted, idle, exiting]);

  const toggleWishlist = (s: string) => {
    const next = wishlist.includes(s) ? wishlist.filter((x) => x !== s) : [...wishlist, s];
    setWishlist(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  // Data harga: satu sumber untuk grafik, indikator, dan statistik
  useEffect(() => {
    if (!mounted) return;
    let live = true;
    setCandles([]); setCErr(null);
    const pull = async () => {
      try {
        const r = await fetch(`${API}/klines?symbol=${symbol}&interval=${tf}&limit=300`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Gagal mengambil data harga");
        const raw: Candle[] = await r.json();
        let t = -1;
        const clean = raw.filter((k) => k.time > t && ((t = k.time), true));
        if (live) { setCandles(clean); setCErr(null); }
      } catch (e: any) { if (live) setCErr(e.message || "Backend tidak terhubung"); }
    };
    pull();
    const id = setInterval(pull, 5000);
    return () => { live = false; clearInterval(id); };
  }, [symbol, tf, mounted]);

  const fetchAnalysis = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/analyze?symbol=${symbol}&interval=${tf}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Aset tidak ditemukan atau backend tidak terhubung");
      setData(await r.json());
    } catch (e: any) { setError(e.message || "Terjadi kesalahan koneksi"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (mounted) fetchAnalysis(); }, [symbol, tf, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    let s = input.trim().toUpperCase().replace("/", "");
    if (!s) return;
    if (s === "USDT") s = "USDTIDR";
    else if (s === "GOLD" || s === "XAU") s = "XAUUSD";
    else if (!FOREX.includes(s) && !s.endsWith("USDT") && !s.endsWith("IDR")) s += "USDT";
    setSymbol(s);
  };
  const pick = (v: string) => { setInput(v.replace("USDT", "").replace("IDR", "")); setSymbol(v); };

  const A = useMemo(() => analyze(candles), [candles]);
  const signal: Signal = useMemo(
    () => !loading && !error && data?.ai_analysis?.action && data?.market_data?.symbol === symbol
      ? { symbol, action: data.ai_analysis.action, confidence: data.ai_analysis.confidence, sl: data.ai_analysis.stop_loss, tp: data.ai_analysis.take_profit }
      : null,
    [data, loading, error, symbol]);
  const ai = data?.ai_analysis;
  const market = data?.market_data;
  const idr = symbol.includes("IDR");
  const price: number | undefined = candles.length ? candles[candles.length - 1].close : market?.current_price;
  const base: number | undefined = candles.length ? candles[0].open : market?.previous_close;
  const delta = price != null && base ? price - base : 0;
  const pct = base ? (delta / base) * 100 : 0;
  const up = delta >= 0;
  const starred = wishlist.includes(symbol);
  const act = ACTION[ai?.action] ?? ACTION.HOLD;
  const rr = ai && price && ai.stop_loss > 0 && ai.take_profit > 0 ? Math.abs(ai.take_profit - price) / Math.abs(price - ai.stop_loss) : null;

  const exportCsv = () => {
    if (!A) return;
    const cell = (x: any) => (typeof x === "number" && isNaN(x) ? "" : x);
    const rows = candles.map((k, i) =>
      [new Date(k.time * 1000).toISOString(), k.open, k.high, k.low, k.close, k.volume, A.rsi[i], A.mc.m[i], A.mc.s[i], A.e20[i], A.e50[i], A.e200[i]].map(cell).join(","));
    const csv = "waktu,open,high,low,close,volume,rsi14,macd,sinyal,ema20,ema50,ema200\n" + rows.join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${symbol}_${tf}.csv`;
    a.click();
  };

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" suppressHydrationWarning>
      {showBubbles && (
        <WishlistBubbles wishlist={wishlist} isIdleTriggered={idle} isExiting={exiting}
          onSelectAsset={(s) => { setSymbol(s); setInput(s.replace("USDT", "").replace("IDR", "")); }} onClose={closeBubbles} />
      )}

      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-panel px-4 py-2">
        <h1 className="text-base font-semibold tracking-tight">Si Paling Trading</h1>
        <nav aria-label="Aset populer" className="flex gap-1 overflow-x-auto">
          {POPULAR.map((a) => (
            <button key={a.value} onClick={() => pick(a.value)} aria-current={symbol === a.value}
              className={`whitespace-nowrap border-b-2 px-2.5 py-1 text-sm ${symbol === a.value ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`}>
              {a.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <form onSubmit={search} className="flex">
            <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Cari aset" placeholder="Cari aset, mis. SOL"
              className="w-40 border border-line bg-bg px-2.5 py-1 text-sm placeholder:text-dim focus:border-focus focus:outline-none" />
            <button className="border border-l-0 border-line bg-raise px-3 py-1 text-sm hover:text-ink">Cari</button>
          </form>
          <details className="relative">
            <summary className="cursor-pointer list-none text-sm text-dim hover:text-ink">Beli kripto</summary>
            <div className="absolute right-0 z-20 mt-2 w-64 border border-line bg-panel p-3 text-xs shadow-none">
              <p className="mb-2 text-dim">Pembelian dilakukan di exchange berizin, bukan di web ini. Cek metode deposit (misalnya QRIS) langsung di aplikasinya.</p>
              <ul>
                {EXCHANGES.map((x) => (
                  <li key={x.name} className="border-t border-line">
                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="flex justify-between py-1.5 hover:text-focus">
                      {x.name}<span className="text-dim">buka situs</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-dim">Tidak berafiliasi. Pastikan exchange terdaftar di OJK sebelum menyetor dana.</p>
            </div>
          </details>
          <button onClick={() => { setIdle(false); setExiting(false); setShowBubbles(true); }} className="text-sm text-dim hover:text-ink">Bubbles</button>
          <ConnectButton chainStatus="icon" showBalance={false} />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
        <aside className="border-b border-line lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h2 className="text-sm font-medium">Pantauan</h2>
            <span className="text-xs text-dim">{isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Tamu"}</span>
          </div>
          {wishlist.length === 0 ? (
            <p className="px-4 pb-4 text-xs text-dim">Belum ada aset. Tekan bintang di samping nama aset untuk menyimpannya.</p>
          ) : (
            <ul>
              {wishlist.map((s) => (
                <li key={s} className={`flex items-center border-t border-line ${symbol === s ? "bg-raise" : ""}`}>
                  <button onClick={() => pick(s)} className="flex flex-1 items-center gap-2.5 px-4 py-2 text-left text-sm">
                    <Logo sym={s} size={18} />{label(s)}
                  </button>
                  <button onClick={() => toggleWishlist(s)} aria-label={`Hapus ${label(s)} dari pantauan`} className="px-3 py-2 text-dim hover:text-down">×</button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex min-h-0 flex-col lg:overflow-y-auto">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-line px-4 py-3">
            <div className="flex items-center gap-3">
              <Logo sym={symbol} size={32} />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{label(symbol)}</h2>
                  <button onClick={() => toggleWishlist(symbol)} aria-pressed={starred} aria-label={starred ? "Hapus dari pantauan" : "Simpan ke pantauan"}
                    className={starred ? "text-hold" : "text-dim hover:text-ink"}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-dim">{candles.length ? `${candles.length} candle, diperbarui tiap 5 detik` : "Memuat data"}</p>
              </div>
            </div>
            <div>
              <p className="text-3xl font-medium">{fmt(price, idr)}</p>
              {price != null && (
                <p className={`text-sm ${up ? "text-up" : "text-down"}`}>
                  {up ? "+" : "−"}{fmt(Math.abs(delta), idr)} ({up ? "+" : "−"}{Math.abs(pct).toFixed(2)}%)
                  <span className="text-dim"> selama {candles.length || "-"} candle</span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div role="group" aria-label="Timeframe" className="flex">
                {TIMEFRAMES.map((t) => (
                  <button key={t} onClick={() => setTf(t)} aria-pressed={tf === t}
                    className={`border-b-2 px-2.5 py-1 text-sm ${tf === t ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`}>
                    {t === "1h" || t === "4h" || t === "1d" ? t.toUpperCase() : t}
                  </button>
                ))}
              </div>
              <button onClick={exportCsv} disabled={!A} className="text-sm text-dim hover:text-ink disabled:opacity-40">Unduh CSV</button>
            </div>
          </div>

          <div className="relative min-h-[380px] flex-1">
            <CryptoChart key={`${symbol}-${tf}`} candles={candles} A={A} interval={tf} />
            {!candles.length && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg/90 px-6 text-center text-sm">
                {cErr ? (<div><p className="text-down">{cErr}</p><p className="mt-1 text-dim">Pastikan backend FastAPI berjalan di {API}.</p></div>) : <p className="text-dim">Memuat grafik {label(symbol)}</p>}
              </div>
            )}
          </div>
          <DemoBalance symbol={symbol} price={price} signal={signal} score={A?.score} onRefreshAnalysis={fetchAnalysis} />
        </main>

        <aside className="border-t border-line lg:overflow-y-auto lg:border-l lg:border-t-0">
          <section className="border-b border-line p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Sinyal AI</h2>
              <button onClick={fetchAnalysis} disabled={loading} className="text-xs text-dim hover:text-ink disabled:opacity-50">
                {loading ? "Menganalisis" : "Analisis ulang"}
              </button>
            </div>
            {error ? (
              <p className="mt-3 text-sm text-down">{error}</p>
            ) : ai ? (
              <>
                <div className="mt-3 flex items-end justify-between">
                  <span className={`text-3xl font-semibold ${act.c}`}>{act.t}</span>
                  <span className="text-sm text-dim">Keyakinan {ai.confidence}%</span>
                </div>
                <div className="mt-2 h-1 bg-raise"><div className="h-full bg-ink" style={{ width: `${Math.min(100, ai.confidence)}%` }} /></div>
                <p className="mt-3 text-sm leading-relaxed text-dim">{ai.reasoning}</p>
                {ai.components && (
                  <div className="mt-3 border-t border-line pt-3 text-xs">
                    <p className="flex justify-between">
                      <span className="text-dim">Teknikal ({ai.components.technical.engine})</span>
                      <span className={(ACTION[ai.components.technical.action] ?? ACTION.HOLD).c}>
                        {(ACTION[ai.components.technical.action] ?? ACTION.HOLD).t} {ai.components.technical.confidence}%
                      </span>
                    </p>
                    <p className="mt-1 flex justify-between">
                      <span className="text-dim">Berita dan sentimen{ai.components.news.method === "rss" ? " (RSS)" : ""}</span>
                      {ai.components.news.available ? (
                        <span className={ai.components.news.sentiment === "BULLISH" ? "text-up" : ai.components.news.sentiment === "BEARISH" ? "text-down" : "text-dim"}>
                          {ai.components.news.sentiment === "BULLISH" ? "Positif" : ai.components.news.sentiment === "BEARISH" ? "Negatif" : "Netral"} ({Math.round(ai.components.news.confidence)}%)
                        </span>
                      ) : <span className="text-dim">tidak tersedia</span>}
                    </p>
                    {!ai.components.news.available && ai.components.news.reason && (
                      <p className="mt-1 break-words text-dim">Penyebab: {ai.components.news.reason}</p>
                    )}
                    {ai.components.news.available && ai.components.news.summary && <p className="mt-2 leading-relaxed text-dim">{ai.components.news.summary}</p>}
                    {ai.components.adjustments?.map((n: string) => <p key={n} className="mt-1 text-hold">{n}</p>)}
                    {ai.components.news.available && ai.components.news.sources?.length > 0 && (
                      <p className="mt-2 text-dim">Sumber:{" "}
                        {ai.components.news.sources.slice(0, 3).map((x: { title: string; uri: string }, i: number) => (
                          <a key={x.uri} href={x.uri} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">{i ? ", " : ""}{x.title}</a>
                        ))}
                      </p>
                    )}
                  </div>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-dim">Stop loss</dt><dd className="text-down">{fmt(ai.stop_loss, idr)}</dd></div>
                  <div><dt className="text-dim">Take profit</dt><dd className="text-up">{fmt(ai.take_profit, idr)}</dd></div>
                  <div><dt className="text-dim">Risk:reward</dt><dd>{rr ? `1 : ${rr.toFixed(2)}` : "-"}</dd></div>
                </dl>
              </>
            ) : (
              <p className="mt-3 text-sm text-dim">{loading ? "Menganalisis pasar" : "Belum ada analisis."}</p>
            )}
          </section>

          {A && <Confluence A={A} action={ai?.action} />}
          {A && <Stats A={A} idr={idr} />}
          {A && price != null && <RiskCalc price={price} sl={ai?.stop_loss ?? 0} atr={A.atrNow} action={ai?.action} idr={idr} />}
          {!A && candles.length > 0 && <p className="p-4 text-xs text-dim">Indikator butuh minimal 40 candle. Saat ini baru {candles.length}.</p>}
        </aside>
      </div>
    </div>
  );
}
