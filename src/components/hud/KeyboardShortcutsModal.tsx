'use client';

import React from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: 'D', description: 'Toggle Live Keynote / Demo Presenter HUD', category: 'Presentation' },
  { key: 'A', description: 'Trigger AI Allocation Conflict Resolution', category: 'Core Engine' },
  { key: 'P', description: 'Advance Fulfillment Pipeline Step', category: 'Core Engine' },
  { key: 'R', description: 'Refresh Warehouse Telemetry Live Data', category: 'Data' },
  { key: 'M', description: 'Toggle J.A.R.V.I.S Audio FX (Web Audio API)', category: 'Audio' },
  { key: '1', description: 'Jump to Mission Control Overview', category: 'Navigation' },
  { key: '2', description: 'Jump to Orders Queue', category: 'Navigation' },
  { key: '3', description: 'Jump to Inventory Stock Pools', category: 'Navigation' },
  { key: '4', description: 'Jump to Picking Workstation', category: 'Workstations' },
  { key: '5', description: 'Jump to Packing Workstation', category: 'Workstations' },
  { key: '6', description: 'Jump to Suit Inspection (QC)', category: 'Workstations' },
  { key: '7', description: 'Jump to Launch Sequence (Dispatch)', category: 'Workstations' },
  { key: '8', description: 'Jump to J.A.R.V.I.S Decision Log', category: 'Audit' },
  { key: '9', description: 'Jump to Stark Intel Analytics & Trend Charts', category: 'Analytics' },
  { key: '0', description: 'Jump to Interactive Decision Graph Explorer', category: 'Graph' },
  { key: 'S', description: 'Jump to J.A.R.V.I.S What-If Simulator', category: 'Simulation' },
  { key: '?', description: 'Open / Close this Keyboard Shortcuts HUD', category: 'Help' },
  { key: 'Esc', description: 'Close modals and drawers', category: 'General' },
];

export default function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0c1222] border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 font-mono text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-bold">
              ⌨️
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wider text-white">
                STARK HUD KEYBOARD COMMAND CENTER
              </h3>
              <p className="text-xs text-slate-400">
                Rapid hotkeys for high-speed live hackathon demonstrations
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition"
          >
            ✕ [ESC]
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {SHORTCUTS.map((sc, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between hover:border-cyan-500/40 transition"
            >
              <span className="text-xs text-slate-300 pr-2">{sc.description}</span>
              <kbd className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-cyan-400 font-bold text-xs shadow-inner shrink-0">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Active HUD Hotkey Listener Loaded</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-lg text-xs transition"
          >
            Got it, Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
