"use client";

import { useEffect, useState } from "react";

interface AiAnalysisResponse {
  status: string;
  market_data: {
    symbol: string;
    trend: string;
    current_price: number;
    rsi_14: number;
    ema_50: number;
    ema_200: number;
  };
  ai_analysis: {
    symbol: string;
    action: "BUY" | "SELL" | "HOLD";
    confidence: number;
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    reasoning: string;
  };
}

export default function AiAnalysisPanel({ symbol = "BTCUSDT" }: { symbol?: string }) {
  const [data, setData] = useState<AiAnalysisResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`http://127.0.0.1:8000/analyze?symbol=${symbol}&interval=15m`);
      if (!res.ok) throw new Error("Gagal mengambil data dari AI Backend");
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [symbol]);

  if (loading) {
    return (
      <div className="p-4 bg-gray-900 text-white rounded-xl shadow-lg border border-gray-800 animate-pulse">
        <p className="text-gray-400">🤖 Gemini AI sedang menganalisis pasar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500 text-red-400 rounded-xl">
        <p>⚠️ Error: {error}</p>
        <button 
          onClick={fetchAnalysis}
          className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const ai = data?.ai_analysis;
  const market = data?.market_data;

  // Warna badge berdasarkan sinyal
  const actionColor =
    ai?.action === "BUY"
      ? "bg-green-500/20 text-green-400 border-green-500"
      : ai?.action === "SELL"
      ? "bg-red-500/20 text-red-400 border-red-500"
      : "bg-yellow-500/20 text-yellow-400 border-yellow-500";

  return (
    <div className="p-5 bg-gray-900 text-white rounded-xl shadow-xl border border-gray-800 space-y-4">
      {/* Header Panel */}
      <div className="flex justify-between items-center border-b border-gray-800 pb-3">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2">
            🤖 Gemini Trading Signal
          </h2>
          <p className="text-xs text-gray-400">Timeframe: 15m | Pair: {market?.symbol}</p>
        </div>
        <button
          onClick={fetchAnalysis}
          className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700 transition"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Sinyal Utam & Confidence */}
      <div className="flex items-center justify-between bg-gray-950 p-4 rounded-lg border border-gray-800">
        <div>
          <span className="text-xs text-gray-400 block mb-1">REKOMENDASI AI</span>
          <span className={`px-4 py-1.5 rounded-full font-bold text-lg border ${actionColor}`}>
            {ai?.action}
          </span>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 block mb-1">CONFIDENCE</span>
          <span className="text-xl font-extrabold text-blue-400">{ai?.confidence}%</span>
        </div>
      </div>

      {/* Detail Trade Setup */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
          <span className="text-gray-400 block">Entry Price</span>
          <span className="font-medium text-white">${ai?.entry_price.toLocaleString()}</span>
        </div>
        <div className="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
          <span className="text-gray-400 block">Stop Loss</span>
          <span className="font-medium text-red-400">${ai?.stop_loss.toLocaleString()}</span>
        </div>
        <div className="bg-gray-950 p-2.5 rounded-lg border border-gray-800">
          <span className="text-gray-400 block">Take Profit</span>
          <span className="font-medium text-green-400">${ai?.take_profit.toLocaleString()}</span>
        </div>
      </div>

      {/* AI Reasoning */}
      <div className="bg-gray-950 p-3.5 rounded-lg border border-gray-800 text-xs leading-relaxed">
        <span className="font-semibold text-gray-300 block mb-1">💡 Analisis AI:</span>
        <p className="text-gray-400">{ai?.reasoning}</p>
      </div>
    </div>
  );
}