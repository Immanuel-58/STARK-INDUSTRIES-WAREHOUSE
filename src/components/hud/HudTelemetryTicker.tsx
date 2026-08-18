'use client';

import React, { useState, useEffect } from 'react';

interface HudTelemetryTickerProps {
  ordersCount: number;
  slaRiskCount: number;
  allocationRate: number;
  decisionsCount: number;
  damagedCount: number;
  soundEnabled: boolean;
  isPresentationMode?: boolean;
  onToggleSound: () => void;
  onOpenShortcuts: () => void;
}

export default function HudTelemetryTicker({
  ordersCount,
  slaRiskCount,
  allocationRate,
  decisionsCount,
  damagedCount,
  soundEnabled,
  isPresentationMode = false,
  onToggleSound,
  onOpenShortcuts,
}: HudTelemetryTickerProps) {
  const [mounted, setMounted] = useState(false);
  const [clock, setClock] = useState<string>('');
  const [arcPower, setArcPower] = useState<number>(99.7);
  const [engineLatency, setEngineLatency] = useState<number>(3.8);

  useEffect(() => {
    setMounted(true);
    const updateTime = () => {
      const d = new Date();
      setClock(d.toTimeString().split(' ')[0] + '.' + String(Math.floor(d.getMilliseconds() / 100)));
    };
    updateTime();
    const interval = setInterval(updateTime, 200);

    // Subtle realistic fluctuations for sci-fi HUD telemetry
    const jitter = setInterval(() => {
      setArcPower(+(99.4 + Math.random() * 0.5).toFixed(1));
      setEngineLatency(+(3.2 + Math.random() * 1.2).toFixed(1));
    }, 4000);

    return () => {
      clearInterval(interval);
      clearInterval(jitter);
    };
  }, []);

  return (
    <div className="bg-[#070b14] border-b border-cyan-950/80 px-4 py-1.5 flex items-center justify-between text-[11px] font-mono select-none overflow-x-auto gap-4">
      {/* Left: Core J.A.R.V.I.S Status */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5 text-cyan-400">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-bold tracking-widest text-[10px] uppercase">
            {isPresentationMode ? 'STARK CORE // J.A.R.V.I.S' : 'WAREHOUSE CORE // TELEMETRY'}
          </span>
        </div>
        <span className="text-slate-700">|</span>
        <div className="flex items-center gap-1.5 text-slate-300">
          <span className="text-slate-500">ARC REACTOR:</span>
          <span className="text-cyan-300 font-semibold">{arcPower}%</span>
        </div>
        <span className="text-slate-700 hidden sm:inline">|</span>
        <div className="hidden sm:flex items-center gap-1.5 text-slate-300">
          <span className="text-slate-500">ENGINE LATENCY:</span>
          <span className="text-emerald-400 font-semibold">{engineLatency}ms</span>
        </div>
        <span className="text-slate-700 hidden md:inline">|</span>
        <div className="hidden md:flex items-center gap-1.5 text-slate-300">
          <span className="text-slate-500">ALLOCATION ENGINE:</span>
          <span className="text-purple-300 font-semibold">14 RULES DETERMINISTIC</span>
        </div>
      </div>

      {/* Center: Live Telemetry Metrics */}
      <div className="hidden xl:flex items-center gap-4 text-slate-400 text-[10px] shrink-0">
        <div>
          ORDERS: <span className="text-white font-bold">{ordersCount}</span>
        </div>
        <div>
          SLA THREAT: <span className={slaRiskCount > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>{slaRiskCount}</span>
        </div>
        <div>
          ALLOCATION: <span className="text-cyan-300 font-bold">{Math.round(allocationRate * 100)}%</span>
        </div>
        <div>
          DECISION AUDIT: <span className="text-indigo-300 font-bold">{decisionsCount} EVENTS</span>
        </div>
        {damagedCount > 0 && (
          <div className="text-rose-400 flex items-center gap-1">
            <span className="animate-pulse">⚠️</span>
            <span>QUARANTINE: {damagedCount} UNITS</span>
          </div>
        )}
      </div>

      {/* Right: Sound Control, Hotkeys & Live Mission Clock */}
      <div className="flex items-center gap-2.5 shrink-0 ml-auto">
        {/* Audio FX Toggle */}
        <button
          onClick={onToggleSound}
          className={`px-2 py-0.5 rounded text-[10px] font-mono border transition flex items-center gap-1.5 ${
            soundEnabled
              ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60'
              : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Sci-Fi HUD Sound Effects (Web Audio API) [Hotkey: M]"
        >
          <span>{soundEnabled ? '🔊 AUDIO ON' : '🔇 MUTED'}</span>
        </button>

        {/* Shortcuts Button */}
        <button
          onClick={onOpenShortcuts}
          className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition flex items-center gap-1"
          title="Keyboard Shortcuts [Hotkey: ?]"
        >
          <span>⌨️</span>
          <span className="hidden sm:inline">KEYS</span>
          <kbd className="px-1 py-0.2 bg-slate-800 text-slate-400 rounded text-[9px]">?</kbd>
        </button>

        {/* Real-time Clock */}
        <div className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800 text-[10px] text-cyan-400 font-mono flex items-center gap-1">
          <span className="text-slate-500">ZULU:</span>
          <span>{mounted ? clock : '00:00:00.0'}</span>
        </div>
      </div>
    </div>
  );
}
