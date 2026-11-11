"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle } from "./AiAnalysisPanel";
import { num } from "./AiAnalysisPanel";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const KEY = "quantum_demo_account_v2";
const START = 10000;
const FEE = 0.001; // biaya 0,1% per sisi, seperti spot Binance
const MIN_HOLD = 30 * 60; // detik: sinyal balik tidak boleh menutup posisi AI lebih cepat dari ini
const REVERSE_CONF = 70; // keyakinan minimal AI untuk membalik arah
const MAX_AI_POS = 2; // maksimal posisi AI yang terbuka bersamaan
const MIN_CASH_FRAC = 0.2; // tidak buka posisi baru kalau saldo tunai di bawah 20% ekuitas

type Side = "LONG" | "SHORT";
type Src = "AI" | "Manual";
type Pos = { id: string; symbol: string; side: Side; qty: number; entry: number; sl: number; tp: number; openedAt: number; source: Src; last?: number };
type Trade = { id: string; symbol: string; side: Side; qty: number; entry: number; exit: number; pnl: number; reason: string; source: Src; openedAt: number; closedAt: number };
type Acct = {
  cash: number; pos: Pos[]; trades: Trade[]; curve: { t: number; e: number }[];
  auto: boolean; riskPct: number; minConf: number; seen: Record<string, string>;
};
export type Signal = { symbol: string; action: "BUY" | "SELL" | "HOLD"; confidence: number; sl: number; tp: number } | null;

const fresh = (): Acct => ({ cash: START, pos: [], trades: [], curve: [], auto: false, riskPct: 1, minConf: 60, seen: {} });
const uid = () => Math.random().toString(36).slice(2, 9);
const margin = (p: Pos) => p.qty * p.entry;
const pnlOf = (p: Pos, px: number) => (p.side === "LONG" ? px - p.entry : p.entry - px) * p.qty;
const usd = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cls = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-dim");
const when = (t: number) => new Date(t * 1000).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const equityOf = (a: Acct) => a.cash + a.pos.reduce((s, p) => s + margin(p) + pnlOf(p, p.last ?? p.entry), 0);
const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);

function open(a: Acct, p: Omit<Pos, "id" | "openedAt">): Acct {
  const m = p.qty * p.entry;
  if (!(p.qty > 0) || m > a.cash || a.pos.some((x) => x.symbol === p.symbol)) return a;
  return { ...a, cash: a.cash - m, pos: [...a.pos, { ...p, id: uid(), openedAt: Math.floor(Date.now() / 1000), last: p.entry }] };
}

function close(a: Acct, id: string, exit: number, reason: string): Acct {
  const p = a.pos.find((x) => x.id === id);
  if (!p) return a;
  const pnl = pnlOf(p, exit) - FEE * p.qty * (p.entry + exit);
  const t: Trade = { id: p.id, symbol: p.symbol, side: p.side, qty: p.qty, entry: p.entry, exit, pnl, reason, source: p.source, openedAt: p.openedAt, closedAt: Math.floor(Date.now() / 1000) };
  return { ...a, cash: a.cash + margin(p) + pnl, pos: a.pos.filter((x) => x.id !== id), trades: [t, ...a.trades].slice(0, 500) };
}

// Ukuran posisi: risiko % dari ekuitas, dibatasi 50% ekuitas dan saldo tunai
function sizeFor(a: Acct, px: number, sl: number) {
  const eq = equityOf(a);
  const byRisk = (eq * a.riskPct) / 100 / Math.abs(px - sl);
  return Math.max(0, Math.min(byRisk, (eq * 0.4) / px, (a.cash * 0.98) / px));
}

// Cek candle sejak posisi dibuka. Kalau SL dan TP kena di candle yang sama, SL dianggap lebih dulu.
function hit(p: Pos, cs: { low: number; high: number }[]) {
  for (const k of cs) {
    const slHit = p.sl > 0 && (p.side === "LONG" ? k.low <= p.sl : k.high >= p.sl);
    const tpHit = p.tp > 0 && (p.side === "LONG" ? k.high >= p.tp : k.low <= p.tp);
    if (slHit) return { px: p.sl, reason: "Stop loss" };
    if (tpHit) return { px: p.tp, reason: "Take profit" };
  }
  return null;
}

const pick = (age: number): [string, number] =>
  age < 4 * 3600 ? ["1m", 60] : age < 20 * 3600 ? ["5m", 300] : age < 70 * 3600 ? ["15m", 900] : age < 11 * 86400 ? ["1h", 3600] : ["1d", 86400];

function stats(ts: Trade[]) {
  const w = ts.filter((t) => t.pnl > 0), l = ts.filter((t) => t.pnl <= 0);
  const gp = sum(w.map((t) => t.pnl)), gl = -sum(l.map((t) => t.pnl)), net = gp - gl;
  return { n: ts.length, win: ts.length ? (w.length / ts.length) * 100 : 0, net, pf: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
    avgW: w.length ? gp / w.length : 0, avgL: l.length ? -gl / l.length : 0, exp: ts.length ? net / ts.length : 0 };
}

const maxDrawdown = (c: { e: number }[]) => {
  let pk = -Infinity, d = 0;
  for (const p of c) { pk = Math.max(pk, p.e); d = Math.min(d, ((p.e - pk) / pk) * 100); }
  return d;
};

function Curve({ data }: { data: { e: number }[] }) {
  if (data.length < 2) return <p className="py-6 text-xs text-dim">Kurva saldo muncul setelah beberapa menit.</p>;
  const lo = Math.min(...data.map((d) => d.e), START), hi = Math.max(...data.map((d) => d.e), START), span = hi - lo || 1;
  const y = (v: number) => 76 - ((v - lo) / span) * 72;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * 300},${y(d.e)}`).join(" ");
  const up = data[data.length - 1].e >= START;
  return (
    <svg viewBox="0 0 300 80" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Kurva ekuitas akun demo">
      <line x1="0" x2="300" y1={y(START)} y2={y(START)} stroke="#2a313c" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" stroke={up ? "#3cb98f" : "#e5675a"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function DemoBalance({ symbol, price, signal, score, onRefreshAnalysis }: {
  symbol: string; price?: number; signal: Signal; score?: number; onRefreshAnalysis: () => void;
}) {
  const [a, setA] = useState<Acct>(fresh);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"pos" | "hist" | "perf">("pos");
  const [who, setWho] = useState<"all" | Src>("AI");
  const [slPct, setSlPct] = useState("1.5");
  const [tpPct, setTpPct] = useState("3");
  const ref = useRef(a); ref.current = a;
  const priceRef = useRef(price); priceRef.current = price;
  const scoreRef = useRef(score); scoreRef.current = score;
  const refreshRef = useRef(onRefreshAnalysis); refreshRef.current = onRefreshAnalysis;
  const idr = symbol.includes("IDR");

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setA({ ...fresh(), ...JSON.parse(s) }); } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) localStorage.setItem(KEY, JSON.stringify(a)); }, [a, loaded]);

  // Pantau semua posisi terbuka, cek SL dan TP, dan catat kurva ekuitas
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    const tick = async () => {
      const cur = ref.current;
      const found: Record<string, { last: number; cs: Candle[] }> = {};
      await Promise.all([...new Set(cur.pos.map((p) => p.symbol))].map(async (s) => {
        try {
          const oldest = Math.min(...cur.pos.filter((p) => p.symbol === s).map((p) => p.openedAt));
          const [iv] = pick(Date.now() / 1000 - oldest);
          const r = await fetch(`${API}/klines?symbol=${s}&interval=${iv}&limit=300`);
          if (!r.ok) return;
          const cs: Candle[] = await r.json();
          if (cs.length) found[s] = { last: cs[cs.length - 1].close, cs };
        } catch {}
      }));
      if (!live) return;
      setA((prev) => {
        let n: Acct = { ...prev, pos: prev.pos.map((p) => (found[p.symbol] ? { ...p, last: found[p.symbol].last } : p)) };
        for (const p of [...n.pos]) {
          const f = found[p.symbol];
          if (!f) continue;
          const h = hit(p, [...f.cs.filter((k) => k.time >= p.openedAt), { low: f.last, high: f.last }]);
          if (h) n = close(n, p.id, h.px, h.reason);
        }
        const now = Math.floor(Date.now() / 1000), lastPt = n.curve[n.curve.length - 1];
        if (!lastPt || now - lastPt.t >= 60) n = { ...n, curve: [...n.curve, { t: now, e: equityOf(n) }].slice(-1500) };
        return n;
      });
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { live = false; clearInterval(id); };
  }, [loaded]);

  // AI otomatis: bereaksi pada sinyal baru untuk aset yang sedang dibuka
  useEffect(() => {
    if (!loaded || !a.auto || !signal || idr) return;
    const px = priceRef.current;
    if (!px) return;
    const score = scoreRef.current ?? 0; // skor konfluensi indikator, -1 sampai 1
    setA((prev) => {
      if (!prev.auto || signal.action === "HOLD") return prev;
      const want: Side = signal.action === "BUY" ? "LONG" : "SHORT";
      const dir = want === "LONG" ? 1 : -1;
      const key = `${signal.action}|${signal.sl}|${signal.tp}`;
      let n = prev;
      const cur = prev.pos.find((p) => p.symbol === signal.symbol);
      if (cur) {
        if (cur.source !== "AI" || cur.side === want) return prev;
        // Membalik arah hanya kalau AI yakin, indikator setuju, dan posisi sudah cukup lama
        const held = Date.now() / 1000 - cur.openedAt;
        if (held < MIN_HOLD || signal.confidence < REVERSE_CONF || dir * score < 0.4) return prev;
        n = close(n, cur.id, px, "Sinyal balik");
      }
      if (prev.seen[signal.symbol] === key || signal.confidence < prev.minConf) return n;
      if (dir * score < 0) return n; // indikator berlawanan dengan AI
      if (n.pos.filter((p) => p.source === "AI").length >= MAX_AI_POS) return n;
      if (n.cash < MIN_CASH_FRAC * equityOf(n)) return n;
      const valid = signal.sl > 0 && signal.tp > 0 && (want === "LONG" ? signal.sl < px && px < signal.tp : signal.tp < px && px < signal.sl);
      if (!valid) return n;
      const opened = open(n, { symbol: signal.symbol, side: want, qty: sizeFor(n, px, signal.sl), entry: px, sl: signal.sl, tp: signal.tp, source: "AI" });
      return opened === n ? n : { ...opened, seen: { ...opened.seen, [signal.symbol]: key } };
    });
  }, [signal, loaded, a.auto, idr]);

  // Saat mode otomatis aktif, minta analisis baru tiap 5 menit
  useEffect(() => {
    if (!a.auto) return;
    const id = setInterval(() => refreshRef.current(), 310000);
    return () => clearInterval(id);
  }, [a.auto]);

  const order = (side: Side) => {
    if (!price || idr) return;
    const sp = +slPct > 0 ? +slPct : 0, tp = +tpPct > 0 ? +tpPct : 0;
    const k = side === "LONG" ? 1 : -1;
    const sl = sp ? price * (1 - (k * sp) / 100) : 0;
    setA((prev) => open(prev, {
      symbol, side, entry: price, sl, tp: tp ? price * (1 + (k * tp) / 100) : 0, source: "Manual",
      qty: sl ? sizeFor(prev, price, sl) : (prev.cash * 0.1) / price,
    }));
  };
  const reset = () => {
    if (window.confirm("Reset saldo demo ke $10.000 dan hapus semua riwayat?"))
      setA((p) => ({ ...fresh(), riskPct: p.riskPct, minConf: p.minConf }));
  };

  if (!loaded) return null;

  const px = (p: Pos) => (p.symbol === symbol && price ? price : p.last ?? p.entry);
  const equity = a.cash + a.pos.reduce((s, p) => s + margin(p) + pnlOf(p, px(p)), 0);
  const total = equity - START, totalPct = (total / START) * 100;
  const list = a.trades.filter((t) => who === "all" || t.source === who);
  const st = stats(list);
  const hasPos = a.pos.some((p) => p.symbol === symbol);
  const orderOff = !price || idr || hasPos;
  const field = "w-14 border border-line bg-bg px-1.5 py-0.5 text-right focus:border-focus focus:outline-none";
  const Stat = ({ k, v, c = "" }: { k: string; v: string; c?: string }) => (
    <div><p className="text-xs text-dim">{k}</p><p className={`text-lg font-medium ${c}`}>{v}</p></div>
  );
  const th = "py-1.5 pr-4 text-left font-normal text-dim";
  const td = "py-1.5 pr-4 whitespace-nowrap";

  return (
    <section className="border-t border-line" aria-label="Demo trading">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-4 py-3">
        <Stat k="Saldo tunai" v={usd(a.cash)} />
        <Stat k="Ekuitas" v={usd(equity)} />
        <Stat k="Laba rugi total" v={`${usd(total)} (${total >= 0 ? "+" : "−"}${Math.abs(totalPct).toFixed(2)}%)`} c={cls(total)} />
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <label className="flex items-center gap-2">
            <button role="switch" aria-checked={a.auto} onClick={() => setA((p) => ({ ...p, auto: !p.auto }))}
              className={`relative h-5 w-9 border ${a.auto ? "border-up bg-up/20" : "border-line bg-raise"}`}>
              <span className={`absolute top-0.5 h-3.5 w-3.5 ${a.auto ? "left-[18px] bg-up" : "left-0.5 bg-dim"}`} />
            </button>
            <span className={a.auto ? "text-ink" : "text-dim"}>AI trading otomatis</span>
          </label>
          <label className="flex items-center gap-1.5 text-dim">Risiko %
            <input key={`r${a.riskPct}`} defaultValue={a.riskPct} inputMode="decimal" className={field}
              onBlur={(e) => setA((p) => ({ ...p, riskPct: Math.min(10, Math.max(0.1, +e.target.value || p.riskPct)) }))} /></label>
          <label className="flex items-center gap-1.5 text-dim">Keyakinan min. %
            <input key={`c${a.minConf}`} defaultValue={a.minConf} inputMode="numeric" className={field}
              onBlur={(e) => setA((p) => ({ ...p, minConf: Math.min(100, Math.max(0, +e.target.value || p.minConf)) }))} /></label>
          <button onClick={reset} className="text-dim hover:text-down">Reset</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2 text-xs">
        <span className="text-dim">Order manual {symbol}</span>
        <label className="flex items-center gap-1.5 text-dim">SL %<input value={slPct} onChange={(e) => setSlPct(e.target.value)} inputMode="decimal" className={field} /></label>
        <label className="flex items-center gap-1.5 text-dim">TP %<input value={tpPct} onChange={(e) => setTpPct(e.target.value)} inputMode="decimal" className={field} /></label>
        <button onClick={() => order("LONG")} disabled={orderOff} className="border border-up px-3 py-1 text-up hover:bg-up/10 disabled:opacity-40">Beli (long)</button>
        <button onClick={() => order("SHORT")} disabled={orderOff} className="border border-down px-3 py-1 text-down hover:bg-down/10 disabled:opacity-40">Jual (short)</button>
        {idr && <span className="text-dim">Demo belum mendukung pasangan IDR.</span>}
        {hasPos && <span className="text-dim">Sudah ada posisi di aset ini.</span>}
      </div>

      <div role="group" aria-label="Tab demo" className="flex gap-4 border-t border-line px-4 pt-2 text-sm">
        {([["pos", `Posisi (${a.pos.length})`], ["hist", `Riwayat (${a.trades.length})`], ["perf", "Performa"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`border-b-2 pb-1.5 ${tab === k ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`}>{l}</button>
        ))}
      </div>

      <div className="max-h-64 overflow-auto px-4 pb-4 text-xs">
        {tab === "pos" && (a.pos.length === 0 ? (
          <p className="py-4 text-dim">Tidak ada posisi terbuka. Nyalakan AI otomatis atau buka order manual. SL dan TP dipantau terus selama halaman terbuka.</p>
        ) : (
          <table className="w-full"><thead><tr>{["Aset", "Arah", "Jumlah", "Masuk", "Sekarang", "SL", "TP", "Laba rugi", "Sumber", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{a.pos.map((p) => { const v = pnlOf(p, px(p)); return (
              <tr key={p.id} className="border-t border-line">
                <td className={td}>{p.symbol}</td>
                <td className={`${td} ${p.side === "LONG" ? "text-up" : "text-down"}`}>{p.side === "LONG" ? "Long" : "Short"}</td>
                <td className={td}>{num(p.qty)}</td><td className={td}>{num(p.entry)}</td><td className={td}>{num(px(p))}</td>
                <td className={td}>{p.sl ? num(p.sl) : "-"}</td><td className={td}>{p.tp ? num(p.tp) : "-"}</td>
                <td className={`${td} ${cls(v)}`}>{usd(v)}</td><td className={td}>{p.source}</td>
                <td className={td}><button onClick={() => setA((prev) => close(prev, p.id, px(p), "Ditutup manual"))} className="text-dim underline hover:text-ink">Tutup</button></td>
              </tr>); })}</tbody></table>
        ))}

        {tab === "hist" && (a.trades.length === 0 ? <p className="py-4 text-dim">Belum ada transaksi selesai.</p> : (
          <table className="w-full"><thead><tr>{["Ditutup", "Aset", "Alasan", "Arah", "Masuk", "Keluar", "Laba rugi", "Sumber"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>{a.trades.map((t) => (
              <tr key={t.id} className="border-t border-line">
                <td className={td}>{when(t.closedAt)}</td><td className={td}>{t.symbol}</td><td className={td}>{t.reason}</td>
                <td className={`${td} ${t.side === "LONG" ? "text-up" : "text-down"}`}>{t.side === "LONG" ? "Long" : "Short"}</td>
                <td className={td}>{num(t.entry)}</td><td className={td}>{num(t.exit)}</td>
                <td className={`${td} ${cls(t.pnl)}`}>{usd(t.pnl)}</td><td className={td}>{t.source}</td>
              </tr>))}</tbody></table>
        ))}

        {tab === "perf" && (
          <div className="py-3">
            <div className="mb-3 flex gap-4">
              {(["AI", "Manual", "all"] as const).map((k) => (
                <button key={k} onClick={() => setWho(k)} aria-pressed={who === k}
                  className={`border-b pb-0.5 ${who === k ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`}>{k === "all" ? "Semua" : k}</button>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-x-8 sm:grid-cols-4">
              {([
                ["Transaksi", String(st.n), ""], ["Win rate", st.n ? `${st.win.toFixed(1)}%` : "-", ""],
                ["Laba rugi bersih", usd(st.net), cls(st.net)], ["Profit factor", st.n ? (isFinite(st.pf) ? st.pf.toFixed(2) : "∞") : "-", ""],
                ["Rata-rata untung", usd(st.avgW), "text-up"], ["Rata-rata rugi", usd(-st.avgL), "text-down"],
                ["Ekspektasi per trade", usd(st.exp), cls(st.exp)], ["Penurunan maks. akun", `${maxDrawdown(a.curve).toFixed(1)}%`, ""],
              ] as const).map(([k, v, c]) => (
                <div key={k} className="border-t border-line py-1.5"><dt className="text-dim">{k}</dt><dd className={`text-sm ${c}`}>{v}</dd></div>
              ))}
            </dl>
            {st.n < 30 && <p className="mt-2 text-hold">Baru {st.n} transaksi. Angka di atas belum bisa dipakai untuk menilai akurasi, tunggu minimal 30 transaksi.</p>}
            <p className="mb-1 mt-3 text-dim">Kurva ekuitas akun (garis putus-putus = modal awal)</p>
            <Curve data={a.curve} />
            <p className="mt-2 text-dim">Simulasi memakai harga pasar asli dengan biaya 0,1% per sisi. Tanpa slippage, jadi hasil nyata biasanya lebih buruk.</p>
          </div>
        )}
      </div>
    </section>
  );
}
