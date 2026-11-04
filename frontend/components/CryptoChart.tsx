"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
} from "lightweight-charts";
import { Candle, Analysis, pts, num } from "./AiAnalysisPanel";

const UP = "#3cb98f", DOWN = "#e5675a", AMBER = "#d6a64a", BLUE = "#7fa7e0", VIOLET = "#b58fd6", GRID = "#2a313c";

export default function PriceChart({ candles, A, interval }: { candles: Candle[]; A: Analysis | null; interval: string }) {
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<any>(null);
  const fitted = useRef(false);
  const [on, setOn] = useState({ ema: true, bb: false, vol: true });
  const [hover, setHover] = useState<any>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#11151b" },
        textColor: "#8b94a5", fontSize: 11,
        fontFamily: "IBM Plex Sans, system-ui, sans-serif",
        panes: { separatorColor: GRID },
      },
      grid: { vertLines: { color: "#1a2029" }, horzLines: { color: "#1a2029" } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: GRID },
      timeScale: {
        borderColor: GRID, timeVisible: true, secondsVisible: false,
        tickMarkFormatter: (t: any) => {
          const d = new Date(t * 1000);
          return interval === "1d"
            ? d.toLocaleDateString("id-ID", { day: "numeric", month: "short" })
            : d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
        },
      },
      localization: {
        timeFormatter: (t: any) =>
          new Date(t * 1000).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }),
      },
    });

    const line = (color: string, pane = 0, dashed = false) =>
      chart.addSeries(LineSeries, {
        color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
      }, pane);

    const s = {
      cs: chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN }),
      e20: line(AMBER), e50: line(BLUE), e200: line(VIOLET),
      bu: line("#6b7a90", 0, true), bm: line("#6b7a90"), bl: line("#6b7a90", 0, true),
      vol: chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false }),
      rsi: chart.addSeries(LineSeries, { color: "#c9d1de", lineWidth: 1, priceLineVisible: false, lastValueVisible: true }, 1),
      mh: chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2),
      mm: line(BLUE, 2), ms: line(AMBER, 2),
    };
    s.vol.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    s.rsi.createPriceLine({ price: 70, color: DOWN, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    s.rsi.createPriceLine({ price: 30, color: UP, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    chart.panes()[1]?.setHeight(100);
    chart.panes()[2]?.setHeight(100);

    chart.subscribeCrosshairMove((p) => {
      const d: any = p.seriesData.get(s.cs);
      if (!p.time || !d) return setHover(null);
      const g = (x: any) => (p.seriesData.get(x) as any)?.value;
      setHover({ o: d.open, h: d.high, l: d.low, c: d.close, rsi: g(s.rsi), m: g(s.mm), sg: g(s.ms) });
    });

    api.current = { chart, s };
    fitted.current = false;
    return () => { chart.remove(); api.current = null; };
  }, [interval]);

  useEffect(() => {
    const a = api.current;
    if (!a || !candles.length) return;
    const { chart, s } = a;
    const last = candles[candles.length - 1].close;
    const pr = last < 0.001 ? 8 : last < 1 ? 5 : last < 100 ? 3 : 2;
    s.cs.applyOptions({ priceFormat: { type: "price", precision: pr, minMove: 10 ** -pr } });
    s.cs.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    s.vol.setData(candles.map((k) => ({ time: k.time, value: k.volume, color: k.close >= k.open ? "#3cb98f55" : "#e5675a55" })));
    if (A) {
      s.e20.setData(pts(candles, A.e20)); s.e50.setData(pts(candles, A.e50)); s.e200.setData(pts(candles, A.e200));
      s.bu.setData(pts(candles, A.bb.up)); s.bm.setData(pts(candles, A.bb.mid)); s.bl.setData(pts(candles, A.bb.lo));
      s.rsi.setData(pts(candles, A.rsi));
      s.mm.setData(pts(candles, A.mc.m)); s.ms.setData(pts(candles, A.mc.s));
      s.mh.setData(candles.flatMap((k, i) => isFinite(A.mc.h[i]) ? [{ time: k.time, value: A.mc.h[i], color: A.mc.h[i] >= 0 ? "#3cb98f88" : "#e5675a88" }] : []));
    }
    if (!fitted.current) {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 4 });
      fitted.current = true;
    }
  }, [candles, A]);

  useEffect(() => {
    const s = api.current?.s;
    if (!s) return;
    [s.e20, s.e50, s.e200].forEach((x: any) => x.applyOptions({ visible: on.ema }));
    [s.bu, s.bm, s.bl].forEach((x: any) => x.applyOptions({ visible: on.bb }));
    s.vol.applyOptions({ visible: on.vol });
  }, [on, interval]);

  const i = candles.length - 1;
  const k = hover ?? (i >= 0 ? { o: candles[i].open, h: candles[i].high, l: candles[i].low, c: candles[i].close, rsi: A?.rsi[i], m: A?.mc.m[i], sg: A?.mc.s[i] } : null);

  return (
    <div className="flex h-full min-h-[380px] flex-col">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-4 py-2 text-xs">
        {(["ema", "bb", "vol"] as const).map((key) => (
          <button key={key} aria-pressed={on[key]} onClick={() => setOn({ ...on, [key]: !on[key] })}
            className={`border-b pb-0.5 ${on[key] ? "border-ink text-ink" : "border-transparent text-dim hover:text-ink"}`}>
            {key === "ema" && (<>EMA <span style={{ color: AMBER }}>20</span>/<span style={{ color: BLUE }}>50</span>/<span style={{ color: VIOLET }}>200</span></>)}
            {key === "bb" && "Bollinger 20, 2"}
            {key === "vol" && "Volume"}
          </button>
        ))}
        {k && (
          <p className="ml-auto flex flex-wrap gap-x-3 text-dim">
            <span className={k.c >= k.o ? "text-up" : "text-down"}>O {num(k.o)}  H {num(k.h)}  L {num(k.l)}  C {num(k.c)}</span>
            <span>RSI {k.rsi != null && isFinite(k.rsi) ? k.rsi.toFixed(1) : "-"}</span>
            <span>MACD {num(k.m)} / sinyal {num(k.sg)}</span>
          </p>
        )}
      </div>
      <div ref={box} className="min-h-0 flex-1" />
    </div>
  );
}
