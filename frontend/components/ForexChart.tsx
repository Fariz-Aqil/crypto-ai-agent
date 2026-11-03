"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
} from "lightweight-charts";

interface ChartProps {
  symbol?: string;
  interval?: string;
}

export default function ForexChart({
  symbol = "XAUUSD",
  interval = "15m",
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  // State Toggle Indikator
  const [showMA, setShowMA] = useState(true);
  const [showEMA, setShowEMA] = useState(true);
  const [showVol, setShowVol] = useState(true);

  // Ref Series MA
  const ma10SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma30SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ma100SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  // Ref Series EMA
  const ema10SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema30SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema100SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 1. Kalkulasi Moving Average (SMA/MA)
  const calculateMA = (data: any[], period: number) => {
    if (data.length < period) return [];
    const maData = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) continue;
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      maData.push({
        time: data[i].time,
        value: sum / period,
      });
    }
    return maData;
  };

  // 2. Kalkulasi Exponential Moving Average (EMA)
  const calculateEMA = (data: any[], period: number) => {
    if (data.length < period) return [];
    const emaData = [];
    const k = 2 / (period + 1);

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i].close;
    }
    let prevEMA = sum / period;

    emaData.push({
      time: data[period - 1].time,
      value: prevEMA,
    });

    for (let i = period; i < data.length; i++) {
      prevEMA = data[i].close * k + prevEMA * (1 - k);
      emaData.push({
        time: data[i].time,
        value: prevEMA,
      });
    }
    return emaData;
  };

  useEffect(() => {
    if (!isMounted || !containerRef.current) return;

    let isSubscribed = true;
    containerRef.current.innerHTML = "";

    const chartDiv = document.createElement("div");
    chartDiv.style.width = "100%";
    chartDiv.style.height = "100%";
    containerRef.current.appendChild(chartDiv);

    const cleanSymbol = symbol.trim().toUpperCase().replace("/", "");

    let chart: IChartApi | null = createChart(chartDiv, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b0f19" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: containerRef.current.clientWidth,
      height: 420,
      localization: {
        locale: "id-ID",
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const dayMonth = date.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
          });
          const hoursMin = date.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          return `${dayMonth} ${hoursMin}`;
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const hours = date.getHours().toString().padStart(2, "0");
          const minutes = date.getMinutes().toString().padStart(2, "0");
          const day = date.getDate().toString().padStart(2, "0");
          const month = (date.getMonth() + 1).toString().padStart(2, "0");

          return `${hours}:${minutes} (${day}/${month})`;
        },
      },
    });

    // Main Candlestick Series dengan Presisi 4 Desimal untuk Forex/Gold
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });

    // MA Garis Overlay
    const ma10Series = chart.addSeries(LineSeries, {
      color: "#3b82f6",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma30Series = chart.addSeries(LineSeries, {
      color: "#eab308",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma100Series = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    ma10SeriesRef.current = ma10Series;
    ma30SeriesRef.current = ma30Series;
    ma100SeriesRef.current = ma100Series;

    // EMA Garis Overlay
    const ema10Series = chart.addSeries(LineSeries, {
      color: "#06b6d4",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema30Series = chart.addSeries(LineSeries, {
      color: "#f97316",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ema100Series = chart.addSeries(LineSeries, {
      color: "#ec4899",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    ema10SeriesRef.current = ema10Series;
    ema30SeriesRef.current = ema30Series;
    ema100SeriesRef.current = ema100Series;

    // Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    volumeSeriesRef.current = volumeSeries;

    const fetchForexData = async (isFirstLoad = false) => {
      try {
        if (isFirstLoad) setLoading(true);

        const klineRes = await fetch(
          `http://127.0.0.1:8000/klines?symbol=${cleanSymbol}&interval=${interval}`
        );

        if (!klineRes.ok) {
          const errDetail = await klineRes.json().catch(() => ({}));
          throw new Error(errDetail.detail || "Gagal mengambil data forex");
        }

        const rawData = await klineRes.json();

        if (isSubscribed && Array.isArray(rawData) && rawData.length > 0 && chart) {
          const cleanCandles: any[] = [];
          const volumeData: any[] = [];
          let lastTime = -1;

          for (const item of rawData) {
            if (item.time > lastTime) {
              cleanCandles.push({
                time: item.time,
                open: item.open,
                high: item.high,
                low: item.low,
                close: item.close,
              });

              const isGreen = item.close >= item.open;
              volumeData.push({
                time: item.time,
                value: item.volume || Math.random() * 500,
                color: isGreen ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)",
              });

              lastTime = item.time;
            }
          }

          if (cleanCandles.length > 0) {
            candlestickSeries.setData(cleanCandles);

            // Set Data MA
            ma10Series.setData(calculateMA(cleanCandles, 10));
            ma30Series.setData(calculateMA(cleanCandles, 30));
            ma100Series.setData(calculateMA(cleanCandles, 100));

            // Set Data EMA
            ema10Series.setData(calculateEMA(cleanCandles, 10));
            ema30Series.setData(calculateEMA(cleanCandles, 30));
            ema100Series.setData(calculateEMA(cleanCandles, 100));

            // Set Data Volume
            volumeSeries.setData(volumeData);

            if (isFirstLoad) {
              chart.timeScale().fitContent();
            }
          }
        }
      } catch (err) {
        console.error("Error Forex Chart:", err);
      } finally {
        if (isSubscribed && isFirstLoad) setLoading(false);
      }
    };

    fetchForexData(true);
    const intervalId = setInterval(() => fetchForexData(false), 10000);

    const handleResize = () => {
      if (containerRef.current && chart) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
      window.removeEventListener("resize", handleResize);
      if (chart) {
        try {
          chart.remove();
        } catch (e) {}
        chart = null;
      }
    };
  }, [isMounted, symbol, interval]);

  // Toggle Visibility MA
  useEffect(() => {
    if (ma10SeriesRef.current && ma30SeriesRef.current && ma100SeriesRef.current) {
      ma10SeriesRef.current.applyOptions({ visible: showMA });
      ma30SeriesRef.current.applyOptions({ visible: showMA });
      ma100SeriesRef.current.applyOptions({ visible: showMA });
    }
  }, [showMA]);

  // Toggle Visibility EMA
  useEffect(() => {
    if (ema10SeriesRef.current && ema30SeriesRef.current && ema100SeriesRef.current) {
      ema10SeriesRef.current.applyOptions({ visible: showEMA });
      ema30SeriesRef.current.applyOptions({ visible: showEMA });
      ema100SeriesRef.current.applyOptions({ visible: showEMA });
    }
  }, [showEMA]);

  // Toggle Visibility Volume
  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: showVol });
    }
  }, [showVol]);

  if (!isMounted) return <div className="w-full h-[420px] bg-slate-900 rounded-xl" />;

  return (
    <div className="relative w-full h-full min-h-[420px] flex flex-col justify-between">
      {/* Legend Indicator Overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-3 text-[10px] font-mono pointer-events-none bg-slate-950/70 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-800/60 flex-wrap">
        {showMA && (
          <>
            <span className="text-blue-400 font-bold">MA(10)</span>
            <span className="text-yellow-400 font-bold">MA(30)</span>
            <span className="text-purple-400 font-bold">MA(100)</span>
          </>
        )}
        {showEMA && (
          <>
            <span className="text-cyan-400 font-bold">EMA(10)</span>
            <span className="text-orange-400 font-bold">EMA(30)</span>
            <span className="text-pink-400 font-bold">EMA(100)</span>
          </>
        )}
      </div>

      {loading && (
        <div className="absolute inset-0 z-20 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center text-cyan-400 font-mono text-xs">
          ⚡ Memuat Chart Forex/Gold {symbol} ({interval})...
        </div>
      )}

      {/* Container Chart */}
      <div ref={containerRef} className="w-full flex-1 rounded-lg overflow-hidden" />

      {/* Bar Navigasi Indikator Interaktif */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/90 border-t border-slate-800/80 font-mono text-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setShowMA(!showMA)}
            className={`px-3 py-1 rounded-lg border text-[11px] font-bold transition-all ${
              showMA
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                : "bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300"
            }`}
          >
            MA
          </button>

          <button
            onClick={() => setShowEMA(!showEMA)}
            className={`px-3 py-1 rounded-lg border text-[11px] font-bold transition-all ${
              showEMA
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                : "bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300"
            }`}
          >
            EMA
          </button>

          <button
            onClick={() => setShowVol(!showVol)}
            className={`px-3 py-1 rounded-lg border text-[11px] font-bold transition-all ${
              showVol
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_8px_rgba(6,182,212,0.3)]"
                : "bg-slate-900/60 text-slate-500 border-slate-800 hover:text-slate-300"
            }`}
          >
            VOL
          </button>

          <span className="text-slate-700 px-1">|</span>

          <span className="text-[10px] text-slate-500 uppercase">
            BOLL • RSI • MACD (ON DASHBOARD)
          </span>
        </div>
      </div>
    </div>
  );
}