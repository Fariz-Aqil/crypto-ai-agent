"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const UP = "60,185,143";
const DOWN = "229,103,90";

type Coin = { symbol: string; base: string; price: number; change: number; volume: number };
type Node = { sym: string; r: number; x: number; y: number; ph: number };

const logo = (base: string) => `https://s3-symbol-logo.tradingview.com/crypto/XTVC${base}.svg`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Radius mengikuti besar perubahan harga, lalu diskalakan agar mengisi sekitar setengah layar
function computeRadii(list: Coin[], w: number, h: number) {
  const m = new Map<string, number>();
  if (!w || !h || !list.length) return m;
  const raw = list.map((c) => Math.max(Math.abs(c.change), 0.5) ** 0.6);
  const area = raw.reduce((s, x) => s + Math.PI * x * x, 0);
  const k = Math.sqrt((0.5 * w * h) / area);
  const maxR = Math.min(w, h) * 0.22;
  list.forEach((c, i) => m.set(c.symbol, clamp(raw[i] * k, 15, maxR)));
  return m;
}

export default function WishlistBubbles({ wishlist, isIdleTriggered, isExiting, onSelectAsset, onClose }: {
  wishlist: string[]; isIdleTriggered: boolean; isExiting: boolean;
  onSelectAsset: (symbol: string) => void; onClose: () => void;
}) {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [mode, setMode] = useState<"all" | "watch">("all");
  const [count, setCount] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 40 : 100));
  const [size, setSize] = useState({ w: 0, h: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLButtonElement>());
  const pos = useRef(new Map<string, { x: number; y: number }>());

  useEffect(() => {
    let live = true;
    const pull = async () => {
      try {
        const r = await fetch(`${API}/market?limit=150`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || "Gagal memuat data pasar");
        const d: Coin[] = await r.json();
        if (live) { setCoins(d); setErr(null); setAt(Date.now()); }
      } catch (e: any) { if (live) setErr(e.message || "Backend tidak terhubung"); }
    };
    pull();
    const id = setInterval(pull, 30000);
    return () => { live = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isIdleTriggered) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isIdleTriggered, onClose]);

  const shown = useMemo(() => {
    const list = mode === "watch" ? coins.filter((c) => wishlist.includes(c.symbol)) : coins;
    return list.slice(0, count);
  }, [coins, mode, count, wishlist]);
  const R = useMemo(() => computeRadii(shown, size.w, size.h), [shown, size]);

  // Simulasi: gravitasi ke tengah, tumbukan antar bubble, dan sedikit gerak mengambang
  useEffect(() => {
    const { w, h } = size;
    if (!w || !h || !shown.length) return;
    const sorted = [...shown].sort((a, b) => (R.get(b.symbol) ?? 0) - (R.get(a.symbol) ?? 0));
    const avg = sorted.reduce((s, c) => s + (R.get(c.symbol) ?? 0), 0) / sorted.length;
    const sx = Math.min(2, w / h);
    const nodes: Node[] = sorted.map((c, i) => {
      const p = pos.current.get(c.symbol);
      const a = i * 2.39996, d = 1.6 * avg * Math.sqrt(i + 0.5);
      return { sym: c.symbol, r: R.get(c.symbol) ?? 15, x: p?.x ?? w / 2 + Math.cos(a) * d * sx, y: p?.y ?? h / 2 + Math.sin(a) * d, ph: i * 1.7 };
    });
    let alpha = pos.current.size ? 0.35 : 1;

    const tick = (t: number) => {
      const cx = w / 2, cy = h / 2, g = 0.03 * alpha;
      for (const n of nodes) {
        n.x += (cx - n.x) * g * (h / w) + Math.sin(t / 1700 + n.ph) * 0.12;
        n.y += (cy - n.y) * g + Math.cos(t / 2100 + n.ph) * 0.12;
      }
      for (let k = 0; k < 2; k++)
        for (let i = 0; i < nodes.length; i++)
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            let dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 0.01, min = a.r + b.r + 2;
            if (d < min) { const f = ((min - d) / d) * 0.5; dx *= f; dy *= f; a.x -= dx; a.y -= dy; b.x += dx; b.y += dy; }
          }
      for (const n of nodes) {
        n.x = clamp(n.x, n.r + 2, w - n.r - 2);
        n.y = clamp(n.y, n.r + 2, h - n.r - 2);
        pos.current.set(n.sym, { x: n.x, y: n.y });
        const el = els.current.get(n.sym);
        if (el) el.style.transform = `translate(${n.x - n.r}px,${n.y - n.r}px)`;
      }
      alpha = Math.max(0.05, alpha * 0.985);
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 250; i++) tick(0);
      return;
    }
    let raf = 0;
    const loop = (t: number) => { tick(t); raf = requestAnimationFrame(loop); };
    tick(0);
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [R, size, shown]);

  const btn = (on: boolean) => `border-b pb-0.5 ${on ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`;
  const empty = !err && shown.length === 0 && coins.length > 0;

  return (
    <div role="dialog" aria-label="Peta pasar kripto" className={`fixed inset-0 z-50 flex flex-col bg-bg/95 ${isExiting ? "animate-fade-out" : "animate-fade-in"}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2 text-sm">
        <h2 className="font-medium">Pasar kripto <span className="font-normal text-dim">perubahan 24 jam</span></h2>
        {!isIdleTriggered && (
          <>
            <div className="flex gap-4" role="group" aria-label="Filter">
              <button onClick={() => setMode("all")} aria-pressed={mode === "all"} className={btn(mode === "all")}>Semua</button>
              <button onClick={() => setMode("watch")} aria-pressed={mode === "watch"} className={btn(mode === "watch")}>Pantauan</button>
            </div>
            <div className="flex gap-4" role="group" aria-label="Jumlah aset">
              {[30, 60, 100, 150].map((n) => <button key={n} onClick={() => setCount(n)} aria-pressed={count === n} className={btn(count === n)}>{n}</button>)}
            </div>
            <span className="text-xs text-dim">{at ? `Diperbarui ${new Date(at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}</span>
            <button onClick={onClose} className="ml-auto text-dim hover:text-ink">Tutup (Esc)</button>
          </>
        )}
      </div>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden">
        {err && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-down">{err}</p>}
        {!err && coins.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-sm text-dim">Memuat data pasar</p>}
        {empty && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-dim">Belum ada kripto di Pantauan. Simpan aset dengan tombol bintang di halaman utama.</p>}
        {shown.map((c) => {
          const r = R.get(c.symbol) ?? 15;
          const rgb = c.change >= 0 ? UP : DOWN;
          const it = Math.min(Math.abs(c.change) / 10, 1);
          return (
            <button
              key={c.symbol}
              ref={(el) => { if (el) els.current.set(c.symbol, el); else els.current.delete(c.symbol); }}
              onClick={() => { onSelectAsset(c.symbol); onClose(); }}
              aria-label={`${c.base}, ${pct(c.change)} dalam 24 jam. Buka grafik.`}
              title={`${c.base}/USDT  ${c.price.toLocaleString("en-US", { maximumFractionDigits: 8 })}  ${pct(c.change)}`}
              className="absolute left-0 top-0 flex flex-col items-center justify-center gap-0.5 rounded-full text-ink hover:z-10 hover:brightness-125"
              style={{
                width: r * 2, height: r * 2,
                background: `rgba(${rgb},${0.1 + 0.28 * it})`,
                border: `1px solid rgba(${rgb},${0.45 + 0.4 * it})`,
                boxShadow: wishlist.includes(c.symbol) ? "0 0 0 2px #d6a64a" : undefined,
              }}
            >
              {r >= 34 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo(c.base)} alt="" width={r * 0.45} height={r * 0.45} className="rounded-full" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
              )}
              <span className="font-semibold leading-none" style={{ fontSize: clamp(r * 0.36, 9, 30) }}>{c.base}</span>
              {r >= 22 && <span className="leading-none text-ink/80" style={{ fontSize: clamp(r * 0.25, 8, 17) }}>{pct(c.change)}</span>}
            </button>
          );
        })}
      </div>

      <p className="border-t border-line px-4 py-1.5 text-xs text-dim">
        {isIdleTriggered
          ? "Gerakkan mouse atau tekan tombol apa saja untuk kembali."
          : "Ukuran bubble mengikuti besar perubahan harga. Hijau naik, merah turun. Cincin kuning: ada di Pantauan. Klik bubble untuk membuka grafiknya."}
      </p>
    </div>
  );
}
