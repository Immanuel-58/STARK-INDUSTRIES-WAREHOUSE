'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { jarvisAudio } from './JarvisAudio';

// ─── Types ────────────────────────────────────────────────────────────────
export interface CinematicMetrics {
  fulfillmentRate: number;   // 0..1
  slaStatus: string;         // e.g. "ON TRACK" | "3 AT RISK"
  inventoryImpact: string;   // e.g. "12 units reserved"
  efficiency: string;        // e.g. "94.2%"
  ordersProcessed: number;
  allocationsResolved: number;
  decisionsLogged: number;
}

interface JarvisCinematicOverlayProps {
  active: boolean;
  metrics: CinematicMetrics | null;
  onComplete: () => void;
}

// ─── Animation Phases ─────────────────────────────────────────────────────
type Phase =
  | 'scan'           // Brief system-scan visual
  | 'verified'       // "OPERATION COMPLETE / WAREHOUSE SYSTEMS VERIFIED"
  | 'hud'            // Full HUD with telemetry + metrics
  | 'nominal'        // "J.A.R.V.I.S — ALL SYSTEMS NOMINAL"
  | 'fadeout';       // Exit

const PHASE_DURATIONS: Record<Phase, number> = {
  scan: 1800,
  verified: 2200,
  hud: 3400,
  nominal: 1800,
  fadeout: 700,
};

// ─── Component ────────────────────────────────────────────────────────────
export default function JarvisCinematicOverlay({
  active,
  metrics,
  onComplete,
}: JarvisCinematicOverlayProps) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [hudMetricReveal, setHudMetricReveal] = useState(0);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cleanup helper
  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // Phase sequencer
  useEffect(() => {
    if (!active) {
      setPhase(null);
      setOverlayOpacity(0);
      setScanProgress(0);
      setHudMetricReveal(0);
      clearTimers();
      return;
    }

    // Kick off phase chain
    setOverlayOpacity(1);
    setPhase('scan');
    jarvisAudio.playBoot();

    return () => clearTimers();
  }, [active, clearTimers]);

  // Animate scan progress bar
  useEffect(() => {
    if (phase !== 'scan') return;
    const start = performance.now();
    const duration = PHASE_DURATIONS.scan;

    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setScanProgress(progress);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  // Phase transitions
  useEffect(() => {
    if (!phase || !active) return;

    const duration = PHASE_DURATIONS[phase];
    timerRef.current = setTimeout(() => {
      const phases: Phase[] = ['scan', 'verified', 'hud', 'nominal', 'fadeout'];
      const idx = phases.indexOf(phase);

      if (phase === 'verified') jarvisAudio.playConfirm();
      if (phase === 'hud') jarvisAudio.playArcReactor();

      if (idx < phases.length - 1) {
        setPhase(phases[idx + 1]);
        if (phases[idx + 1] === 'fadeout') setOverlayOpacity(0);
      } else {
        // Sequence complete
        onComplete();
      }
    }, duration);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, active, onComplete]);

  // Staggered metric reveal during HUD phase
  useEffect(() => {
    if (phase !== 'hud') { setHudMetricReveal(0); return; }
    const intervals = [0, 400, 800, 1200, 1600, 2000, 2400];
    const timers = intervals.map((delay, i) =>
      setTimeout(() => setHudMetricReveal(i + 1), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  if (!active && !phase) return null;

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div
      className="jarvis-cinematic-root"
      style={{ opacity: overlayOpacity, transition: 'opacity 0.7s ease' }}
      aria-live="polite"
      role="status"
    >
      {/* Background: dark graphite + subtle grid + vignette */}
      <div className="jarvis-cin-bg" />

      {/* Radial reticle rings (always visible during cinematic) */}
      <div className="jarvis-cin-reticle">
        <svg viewBox="0 0 400 400" className="jarvis-cin-reticle-svg">
          {/* Outer ring */}
          <circle cx="200" cy="200" r="180" className="jarvis-ring jarvis-ring-outer" />
          {/* Middle ring */}
          <circle cx="200" cy="200" r="130" className="jarvis-ring jarvis-ring-mid" />
          {/* Inner ring */}
          <circle cx="200" cy="200" r="80" className="jarvis-ring jarvis-ring-inner" />
          {/* Tick marks around outer ring */}
          {Array.from({ length: 72 }).map((_, i) => {
            const angle = (i * 5 * Math.PI) / 180;
            const len = i % 9 === 0 ? 14 : 6;
            const r1 = 180 - len;
            const r2 = 180;
            return (
              <line
                key={i}
                x1={200 + r1 * Math.cos(angle)}
                y1={200 + r1 * Math.sin(angle)}
                x2={200 + r2 * Math.cos(angle)}
                y2={200 + r2 * Math.sin(angle)}
                className="jarvis-tick"
              />
            );
          })}
          {/* Scanning arc (animated via CSS) */}
          <circle cx="200" cy="200" r="155" className="jarvis-scan-arc" />
          {/* Cross-hair lines */}
          <line x1="200" y1="10" x2="200" y2="60" className="jarvis-crosshair" />
          <line x1="200" y1="340" x2="200" y2="390" className="jarvis-crosshair" />
          <line x1="10" y1="200" x2="60" y2="200" className="jarvis-crosshair" />
          <line x1="340" y1="200" x2="390" y2="200" className="jarvis-crosshair" />
        </svg>
      </div>

      {/* Horizontal scan line */}
      {(phase === 'scan' || phase === 'verified') && (
        <div className="jarvis-cin-scanline" />
      )}

      {/* PHASE: SCAN */}
      {phase === 'scan' && (
        <div className="jarvis-cin-center">
          <div className="jarvis-cin-label jarvis-cin-fadein" style={{ animationDelay: '0.1s' }}>
            <span className="jarvis-cin-mono jarvis-cin-sm jarvis-cin-cyan">J.A.R.V.I.S WAREHOUSE INTELLIGENCE</span>
          </div>
          <div className="jarvis-cin-label jarvis-cin-fadein" style={{ animationDelay: '0.3s' }}>
            <span className="jarvis-cin-mono jarvis-cin-md jarvis-cin-white">SYSTEM SCAN IN PROGRESS</span>
          </div>
          {/* Progress bar */}
          <div className="jarvis-cin-progress-track">
            <div
              className="jarvis-cin-progress-fill"
              style={{ width: `${scanProgress * 100}%` }}
            />
          </div>
          <div className="jarvis-cin-label jarvis-cin-fadein" style={{ animationDelay: '0.5s' }}>
            <span className="jarvis-cin-mono jarvis-cin-xs jarvis-cin-dim">
              VERIFYING WAREHOUSE SUBSYSTEMS... {Math.round(scanProgress * 100)}%
            </span>
          </div>
          {/* Telemetry data streams along edges */}
          <div className="jarvis-cin-datastream jarvis-cin-datastream-left">
            {['INVENTORY_POOL', 'ALLOCATION_ENGINE', 'SLA_MONITOR', 'PICKING_SYS', 'PACK_VERIFY'].map((s, i) => (
              <div key={s} className="jarvis-cin-fadein jarvis-cin-mono jarvis-cin-xxs jarvis-cin-dim" style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
                ▸ {s} <span className="jarvis-cin-cyan">OK</span>
              </div>
            ))}
          </div>
          <div className="jarvis-cin-datastream jarvis-cin-datastream-right">
            {['DISPATCH_CTRL', 'QC_PROTOCOL', 'DECISION_LOG', 'TELEMETRY_BUS', 'ARC_REACTOR'].map((s, i) => (
              <div key={s} className="jarvis-cin-fadein jarvis-cin-mono jarvis-cin-xxs jarvis-cin-dim" style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
                {s} <span className="jarvis-cin-cyan">✓</span> ◂
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PHASE: VERIFIED */}
      {phase === 'verified' && (
        <div className="jarvis-cin-center">
          <div className="jarvis-cin-label jarvis-cin-scalein">
            <span className="jarvis-cin-mono jarvis-cin-lg jarvis-cin-white jarvis-cin-glow">
              OPERATION COMPLETE
            </span>
          </div>
          <div className="jarvis-cin-divider jarvis-cin-fadein" style={{ animationDelay: '0.3s' }} />
          <div className="jarvis-cin-label jarvis-cin-fadein" style={{ animationDelay: '0.5s' }}>
            <span className="jarvis-cin-mono jarvis-cin-sm jarvis-cin-dim">
              WAREHOUSE SYSTEMS VERIFIED
            </span>
          </div>
          <div className="jarvis-cin-label jarvis-cin-fadein" style={{ animationDelay: '0.8s' }}>
            <span className="jarvis-cin-mono jarvis-cin-xxs jarvis-cin-cyan">
              ALL SUBSYSTEMS REPORTING NOMINAL STATUS
            </span>
          </div>
        </div>
      )}

      {/* PHASE: HUD — Metrics + Telemetry */}
      {phase === 'hud' && metrics && (
        <div className="jarvis-cin-center jarvis-cin-hud-layout">
          <div className="jarvis-cin-label jarvis-cin-fadein">
            <span className="jarvis-cin-mono jarvis-cin-xs jarvis-cin-cyan" style={{ letterSpacing: '0.25em' }}>
              J.A.R.V.I.S INTELLIGENCE HUD
            </span>
          </div>

          {/* Metrics Grid */}
          <div className="jarvis-cin-metrics-grid">
            {[
              { label: 'FULFILLMENT RATE', value: `${Math.round(metrics.fulfillmentRate * 100)}%`, accent: metrics.fulfillmentRate >= 0.9 },
              { label: 'SLA STATUS', value: metrics.slaStatus, accent: !metrics.slaStatus.includes('RISK') },
              { label: 'INVENTORY IMPACT', value: metrics.inventoryImpact, accent: true },
              { label: 'EFFICIENCY', value: metrics.efficiency, accent: true },
              { label: 'ORDERS PROCESSED', value: String(metrics.ordersProcessed), accent: true },
              { label: 'ALLOCATIONS RESOLVED', value: String(metrics.allocationsResolved), accent: true },
              { label: 'DECISIONS LOGGED', value: String(metrics.decisionsLogged), accent: true },
            ].map((m, i) => (
              <div
                key={m.label}
                className={`jarvis-cin-metric-card ${hudMetricReveal > i ? 'jarvis-cin-metric-visible' : ''}`}
              >
                <div className="jarvis-cin-metric-label">{m.label}</div>
                <div className={`jarvis-cin-metric-value ${m.accent ? 'jarvis-cin-cyan' : 'jarvis-cin-red'}`}>
                  {m.value}
                </div>
                {/* Tiny telemetry bar */}
                <div className="jarvis-cin-micro-bar">
                  <div className="jarvis-cin-micro-bar-fill" style={{ width: `${60 + Math.random() * 40}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Mini telemetry graph (simple bars) */}
          <div className="jarvis-cin-telemetry-row jarvis-cin-fadein" style={{ animationDelay: '1.8s' }}>
            {Array.from({ length: 24 }).map((_, i) => {
              const h = 8 + Math.random() * 28;
              return (
                <div key={i} className="jarvis-cin-tel-bar" style={{ height: `${h}px` }} />
              );
            })}
          </div>
        </div>
      )}

      {/* PHASE: NOMINAL */}
      {phase === 'nominal' && (
        <div className="jarvis-cin-center">
          <div className="jarvis-cin-label jarvis-cin-scalein">
            <span className="jarvis-cin-mono jarvis-cin-md jarvis-cin-white jarvis-cin-glow">
              J.A.R.V.I.S
            </span>
          </div>
          <div className="jarvis-cin-divider jarvis-cin-fadein" style={{ animationDelay: '0.2s' }} />
          <div className="jarvis-cin-label jarvis-cin-fadein" style={{ animationDelay: '0.4s' }}>
            <span className="jarvis-cin-mono jarvis-cin-sm jarvis-cin-cyan">
              ALL SYSTEMS NOMINAL
            </span>
          </div>
          {/* Stark red accent dot */}
          <div className="jarvis-cin-nominal-dot jarvis-cin-fadein" style={{ animationDelay: '0.6s' }} />
        </div>
      )}

      {/* Corner HUD brackets (always visible) */}
      <div className="jarvis-cin-corner jarvis-cin-corner-tl" />
      <div className="jarvis-cin-corner jarvis-cin-corner-tr" />
      <div className="jarvis-cin-corner jarvis-cin-corner-bl" />
      <div className="jarvis-cin-corner jarvis-cin-corner-br" />

      {/* Edge telemetry text */}
      <div className="jarvis-cin-edge-text jarvis-cin-edge-bottom">
        <span className="jarvis-cin-mono jarvis-cin-xxs jarvis-cin-dim">
          STARK INDUSTRIES // WAREHOUSE MANAGEMENT SYSTEM v4.7.19 // SECTOR 7-G
        </span>
      </div>
    </div>
  );
}
