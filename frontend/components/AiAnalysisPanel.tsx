"use client";

import { useState } from "react";

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Pt = { time: number; value: number };
export type Vote = { name: string; note: string; v: -1 | 0 | 1 };

const nans = (n: number) => Array<number>(n).fill(NaN);
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export const pts = (c: Candle[], a: number[]): Pt[] =>
  c.flatMap((k, i) => (isFinite(a[i]) ? [{ time: k.time, value: a[i] }] : []));

export const smaArr = (v: number[], n: number) =>
  v.map((_, i) => (i < n - 1 ? NaN : sum(v.slice(i - n + 1, i + 1)) / n));

export const emaArr = (v: number[], n: number) => {
  const k = 2 / (n + 1), o = nans(v.length);
  let e = 0;
  for (let i = n - 1; i < v.length; i++) {
    e = i === n - 1 ? sum(v.slice(0, n)) / n : v[i] * k + e * (1 - k);
    o[i] = e;
  }
  return o;
};

export const rsiArr = (v: number[], n = 14) => {
  const o = nans(v.length);
  if (v.length <= n) return o;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; d >= 0 ? (g += d) : (l -= d); }
  g /= n; l /= n;
  o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
};

export const macdArr = (v: number[]) => {
  const a = emaArr(v, 12), b = emaArr(v, 26);
  const m = v.map((_, i) => a[i] - b[i]);
  const f = m.findIndex((x) => !isNaN(x));
  const s = nans(v.length);
  if (f >= 0) emaArr(m.slice(f), 9).forEach((x, i) => (s[f + i] = x));
  return { m, s, h: m.map((x, i) => x - s[i]) };
};

export const bollArr = (v: number[], n = 20, k = 2) => {
  const mid = smaArr(v, n);
  const sd = v.map((_, i) => (i < n - 1 ? NaN : Math.sqrt(sum(v.slice(i - n + 1, i + 1).map((x) => (x - mid[i]) ** 2)) / n)));
  return { mid, up: mid.map((x, i) => x + k * sd[i]), lo: mid.map((x, i) => x - k * sd[i]) };
};

export const atrArr = (c: Candle[], n = 14) => {
  const o = nans(c.length);
  if (c.length <= n) return o;
  const tr = c.map((k, i) => i === 0 ? k.high - k.low : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close)));
  let a = sum(tr.slice(1, n + 1)) / n;
  o[n] = a;
  for (let i = n + 1; i < c.length; i++) { a = (a * (n - 1) + tr[i]) / n; o[i] = a; }
  return o;
};

export const num = (n?: number | null) =>
  n == null || !isFinite(n) ? "-" : n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 1 ? 6 : 2 });

export const fmt = (n: number | null | undefined, idr = false) => {
  if (n == null || !isFinite(n) || n === 0) return "-";
  if (idr) return "Rp " + Math.round(n).toLocaleString("id-ID");
  const d = Math.abs(n) < 0.001 ? 8 : Math.abs(n) < 1 ? 4 : 2;
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

export function analyze(c: Candle[]) {
  if (c.length < 40) return null;
  const cl = c.map((k) => k.close), n = c.length - 1, last = cl[n];
  const rsi = rsiArr(cl), mc = macdArr(cl), bb = bollArr(cl), atr = atrArr(c);
  const e20 = emaArr(cl, 20), e50 = emaArr(cl, 50), e200 = emaArr(cl, 200);
  const pb = (last - bb.lo[n]) / (bb.up[n] - bb.lo[n]);
  const roc = (last / cl[n - 10] - 1) * 100;
  const hasE50 = !isNaN(e50[n]);
  const emaUp = hasE50 && last > e20[n] && e20[n] > e50[n];
  const emaDn = hasE50 && last < e20[n] && e20[n] < e50[n];

  const votes: Vote[] = [
    { name: "RSI (14)", note: rsi[n].toFixed(1) + (rsi[n] > 65 ? ", jenuh beli" : rsi[n] < 35 ? ", jenuh jual" : ", netral"), v: rsi[n] < 35 ? 1 : rsi[n] > 65 ? -1 : 0 },
    { name: "MACD", note: "histogram " + (mc.h[n] >= 0 ? "positif" : "negatif"), v: mc.h[n] > 0 ? 1 : mc.h[n] < 0 ? -1 : 0 },
    { name: "EMA 20 dan 50", note: !hasE50 ? "data kurang dari 50 candle" : emaUp ? "harga di atas kedua EMA" : emaDn ? "harga di bawah kedua EMA" : "EMA saling silang", v: emaUp ? 1 : emaDn ? -1 : 0 },
    { name: "Bollinger", note: "di " + (pb * 100).toFixed(0) + "% lebar band", v: pb < 0.15 ? 1 : pb > 0.85 ? -1 : 0 },
    { name: "Momentum 10 candle", note: (roc >= 0 ? "+" : "") + roc.toFixed(2) + "%", v: roc > 0.3 ? 1 : roc < -0.3 ? -1 : 0 },
  ];

  const r = cl.slice(-51).map((x, i, a) => (i ? Math.log(x / a[i - 1]) : NaN)).slice(1);
  const mu = sum(r) / r.length;
  const vol = Math.sqrt(sum(r.map((x) => (x - mu) ** 2)) / r.length) * 100;
  let pk = cl[0], dd = 0;
  cl.forEach((x) => { pk = Math.max(pk, x); dd = Math.min(dd, x / pk - 1); });
  const w = c.slice(-50);
  const avgVol = sum(c.slice(-21, -1).map((k) => k.volume)) / 20;

  return {
    last, rsi, mc, bb, atr, e20, e50, e200, votes,
    score: sum(votes.map((v) => v.v)) / votes.length,
    atrNow: atr[n], atrPct: (atr[n] / last) * 100,
    vol, dd: dd * 100,
    sup: Math.min(...w.map((k) => k.low)), res: Math.max(...w.map((k) => k.high)),
    volRatio: avgVol > 0 ? c[n].volume / avgVol : NaN,
    bbWidth: ((bb.up[n] - bb.lo[n]) / bb.mid[n]) * 100,
    e200Now: e200[n],
  };
}
export type Analysis = NonNullable<ReturnType<typeof analyze>>;

const col = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-dim");
const word = (n: number) => (n > 0 ? "Beli" : n < 0 ? "Jual" : "Netral");

export function Confluence({ A, action }: { A: Analysis; action?: string }) {
  const s = A.score;
  const dir = s >= 0.4 ? 1 : s <= -0.4 ? -1 : 0;
  const ai = action === "BUY" ? 1 : action === "SELL" ? -1 : 0;
  return (
    <section className="border-b border-line p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Konfluensi indikator</h3>
        <span className={`text-sm font-medium ${col(dir)}`}>{dir > 0 ? "Condong beli" : dir < 0 ? "Condong jual" : "Netral"}</span>
      </div>
      <div className="relative my-3 h-1.5 bg-raise" role="img" aria-label={`Skor ${s.toFixed(2)} dari -1 sampai 1`}>
        <div className="absolute inset-y-0 left-1/2 w-px bg-dim" />
        <div className={`absolute inset-y-0 ${s >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down"}`} style={{ width: `${Math.abs(s) * 50}%` }} />
      </div>
      <ul>
        {A.votes.map((v) => (
          <li key={v.name} className="grid grid-cols-[1fr_auto_44px] gap-3 border-t border-line py-1.5 text-xs first:border-t-0">
            <span>{v.name}</span>
            <span className="text-dim">{v.note}</span>
            <span className={`text-right font-medium ${col(v.v)}`}>{word(v.v)}</span>
          </li>
        ))}
      </ul>
      {ai !== 0 && dir !== 0 && ai !== dir && (
        <p className="mt-2 text-xs text-hold">Sinyal AI dan indikator berlawanan arah. Periksa ulang sebelum masuk posisi.</p>
      )}
    </section>
  );
}

export function Stats({ A, idr }: { A: Analysis; idr: boolean }) {
  const rows: [string, string][] = [
    ["ATR (14)", `${fmt(A.atrNow, idr)} (${A.atrPct.toFixed(2)}%)`],
    ["Volatilitas per candle", `${A.vol.toFixed(2)}%`],
    ["Penurunan maksimum", `${A.dd.toFixed(1)}%`],
    ["Support 50 candle", fmt(A.sup, idr)],
    ["Resistance 50 candle", fmt(A.res, idr)],
    ["Volume vs rata-rata 20", isFinite(A.volRatio) ? `${A.volRatio.toFixed(2)}x` : "-"],
    ["Lebar Bollinger", `${A.bbWidth.toFixed(2)}%`],
    ["EMA 200", isFinite(A.e200Now) ? fmt(A.e200Now, idr) : "perlu 200 candle"],
  ];
  return (
    <section className="border-b border-line p-4">
      <h3 className="mb-2 text-sm font-medium">Statistik harga</h3>
      <dl className="text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-t border-line py-1.5 first:border-t-0">
            <dt className="text-dim">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function RiskCalc({ price, sl, atr, action, idr }: { price: number; sl: number; atr: number; action?: string; idr: boolean }) {
  const [bal, setBal] = useState("1000");
  const [risk, setRisk] = useState("1");
  const [stop, setStop] = useState("");
  const auto = sl > 0 ? sl : isFinite(atr) ? (action === "SELL" ? price + 1.5 * atr : price - 1.5 * atr) : price * 0.98;
  const sv = +stop || auto;
  const riskAmt = ((+bal || 0) * (+risk || 0)) / 100;
  const dist = Math.abs(price - sv);
  const units = dist > 0 ? riskAmt / dist : 0;
  const unit = idr ? "Rp " : "$";
  const field = "w-full border border-line bg-bg px-2 py-1 text-sm focus:border-focus focus:outline-none";
  const out: [string, string][] = [
    ["Arah posisi", sv < price ? "Long" : "Short"],
    ["Risiko per trade", unit + riskAmt.toLocaleString("en-US", { maximumFractionDigits: 2 })],
    ["Ukuran posisi", units >= 100 ? units.toFixed(0) : units >= 1 ? units.toFixed(2) : units.toFixed(6)],
    ["Nilai posisi", unit + (units * price).toLocaleString("en-US", { maximumFractionDigits: 2 })],
  ];
  return (
    <section className="p-4">
      <h3 className="mb-3 text-sm font-medium">Kalkulator risiko</h3>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <label className="text-dim">Saldo<input className={field} inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} /></label>
        <label className="text-dim">Risiko %<input className={field} inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} /></label>
        <label className="text-dim">Stop loss<input className={field} inputMode="decimal" placeholder={fmt(auto, idr).replace(/[$]|Rp /g, "")} value={stop} onChange={(e) => setStop(e.target.value)} /></label>
      </div>
      <dl className="mt-3 text-xs">
        {out.map(([k, v]) => (
          <div key={k} className="flex justify-between border-t border-line py-1.5">
            <dt className="text-dim">{k}</dt><dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-dim">Stop loss kosong memakai saran AI, atau 1,5 x ATR kalau AI tidak memberi angka.</p>
    </section>
  );
}
