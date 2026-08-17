'use client';

import React, { useState } from 'react';
import { jarvisAudio } from './JarvisAudio';

interface LiveDemoPresenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tabId: string) => void;
  onRunSeed: (scenarioId: string) => Promise<void>;
  onRunAllocation: () => Promise<void>;
  onAdvancePipeline: () => Promise<void>;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

interface DemoStep {
  actNumber: number;
  title: string;
  subtitle: string;
  badge: string;
  scenarioId: string;
  targetNav: string;
  description: string;
  presenterScript: string;
  judgeTakeaways: string[];
  actionLabel: string;
  autoActionType: 'seed_and_allocate' | 'seed_and_damage' | 'seed_pipeline' | 'open_graph' | 'open_simulator';
}

const DEMO_STEPS: DemoStep[] = [
  {
    actNumber: 1,
    title: 'ACT 1: Scarcity & VIP Conflict Resolution',
    subtitle: 'Deterministic Multi-Factor Priority Engine vs Random Stock Assignment',
    badge: 'Core Engine',
    scenarioId: 'scenario-3',
    targetNav: 'control-tower',
    description:
      'Apex Technologies (VIP Wholesale) and Jane Smith (Standard Web) both order SmartPhone X12. With only 7 units in inventory vs 15 demanded, J.A.R.V.I.S computes priority scores (VIP 94 vs Standard 42) based on customer tier, order value, and SLA deadline, safely partial-allocating stock and logging shortages.',
    presenterScript:
      '"Notice how the engine resolves the allocation conflict with zero guesswork. The VIP order receives the available stock while the standard order gets a deterministic shortage flag with an explainable audit trail."',
    judgeTakeaways: [
      'Multi-factor weighted priority score (SLA 40%, Tier 30%, Value 20%, Channel 10%)',
      'Deterministic partial allocation without double-booking',
      'Explainable AI reasoning logged for every item unit',
    ],
    actionLabel: '⚡ Run Scarcity Conflict Act',
    autoActionType: 'seed_and_allocate',
  },
  {
    actNumber: 2,
    title: 'ACT 2: In-Transit Defect & Quarantine',
    subtitle: 'Hardware Damage Isolation & Automated Reorder Triggering',
    badge: 'Quality & Inventory',
    scenarioId: 'scenario-2',
    targetNav: 'inventory',
    description:
      'Stock arrives with physical transit defects. The warehouse supervisor flags damaged units into quarantine. J.A.R.V.I.S instantly adjusts available unreserved stock, verifies whether safety stock falls below Reorder Point (ROP), and issues an immediate shortage warning.',
    presenterScript:
      '"When damage is flagged, available inventory immediately decouples from physical stock. The system recalculates order feasibility in real-time and logs the anomaly in the audit stream."',
    judgeTakeaways: [
      'Strict separation of Available, Reserved, and Damaged stock pools',
      'Real-time reorder point threshold surveillance',
      'Instant exception logging preventing damaged shipments to customers',
    ],
    actionLabel: '⚠️ Trigger Damage Quarantine Act',
    autoActionType: 'seed_and_damage',
  },
  {
    actNumber: 3,
    title: 'ACT 3: End-to-End Workstation Flow',
    subtitle: 'Robotic Pick → Barcode Pack → Suit QC Diagnostic → Launch Sequence',
    badge: 'Physical Operations',
    scenarioId: 'scenario-4',
    targetNav: 'picking',
    description:
      'Orders seamlessly progress through 4 dedicated workstations: optimized warehouse bin picking paths, carton verification scanning at packing, suit/hardware sensor diagnostic at quality inspection, and carrier manifest generation at dispatch.',
    presenterScript:
      '"Every physical workstation is modeled as an active operational queue with individual verification checks, barcode simulations, and automated stage handoffs."',
    judgeTakeaways: [
      '4 dedicated workstation dashboards (Picking, Packing, Quality, Dispatch)',
      'Barcode validation and sensor diagnostics simulation',
      'Zero-latency stage advancement with full SLA timer tracking',
    ],
    actionLabel: '🚜 Launch Multi-Station Pipeline Act',
    autoActionType: 'seed_pipeline',
  },
  {
    actNumber: 4,
    title: 'ACT 4: Explainable Decision Graph Explorer',
    subtitle: 'Interactive Visual DAG of Rules, Weights, and Execution Paths',
    badge: 'Graph Intelligence',
    scenarioId: 'scenario-1',
    targetNav: 'decision-graph',
    description:
      'Explore the live Decision Graph! Inspect individual evaluation nodes (Tier Weight, SLA Threshold, Inventory Feasibility, Allocation Path), toggle layout modes, view node metadata, and audit execution dependencies.',
    presenterScript:
      '"Rather than a black-box model, J.A.R.V.I.S exposes an interactive Directed Acyclic Graph (DAG) of the entire decision chain for complete enterprise compliance and auditable transparency."',
    judgeTakeaways: [
      'Visual interactive DAG with node status badges and edge dependency flow',
      'Node inspector showing input telemetry, weights, and evaluated rules',
      'Interactive zoom, pan, and search filtering across the decision tree',
    ],
    actionLabel: '🌳 Explore Decision Graph DAG',
    autoActionType: 'open_graph',
  },
  {
    actNumber: 5,
    title: 'ACT 5: J.A.R.V.I.S God Mode Simulator',
    subtitle: 'What-If Supply Shock & Live Conflict Sandbox',
    badge: 'What-If Simulation',
    scenarioId: 'scenario-3',
    targetNav: 'simulator',
    description:
      'Test extreme operational scenarios! Inject sudden stock collapses, rush enterprise orders, or modify rule threshold weights on the fly to see how the system recalculates fulfillment strategies without modifying production data.',
    presenterScript:
      '"In God Mode, operators can run what-if simulation experiments with customized order parameters and shock conditions to forecast warehouse resilience."',
    judgeTakeaways: [
      'Isolated sandbox simulation without database mutation',
      'Customizable product quantities, customer tiers, and SLA deadlines',
      'Instant side-by-side comparison of allocation outcomes',
    ],
    actionLabel: '🎮 Open What-If Simulator Sandbox',
    autoActionType: 'open_simulator',
  },
];

export default function LiveDemoPresenter({
  isOpen,
  onClose,
  onNavigateTab,
  onRunSeed,
  onRunAllocation,
  onAdvancePipeline,
  showToast,
}: LiveDemoPresenterProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [minimized, setMinimized] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentStep = DEMO_STEPS[currentStepIndex];

  const handleExecuteAct = async () => {
    try {
      setIsExecuting(true);
      jarvisAudio.playArcReactor();
      showToast(`Executing ${currentStep.title}...`, 'info');

      if (currentStep.autoActionType === 'seed_and_allocate') {
        await onRunSeed(currentStep.scenarioId);
        await new Promise((r) => setTimeout(r, 600));
        await onRunAllocation();
        onNavigateTab('control-tower');
        jarvisAudio.playConfirm();
      } else if (currentStep.autoActionType === 'seed_and_damage') {
        await onRunSeed(currentStep.scenarioId);
        onNavigateTab('inventory');
        jarvisAudio.playAlert();
      } else if (currentStep.autoActionType === 'seed_pipeline') {
        await onRunSeed(currentStep.scenarioId);
        await new Promise((r) => setTimeout(r, 600));
        await onRunAllocation();
        onNavigateTab('picking');
        jarvisAudio.playConfirm();
      } else if (currentStep.autoActionType === 'open_graph') {
        onNavigateTab('decision-graph');
        jarvisAudio.playBlip(700, 0.1);
      } else if (currentStep.autoActionType === 'open_simulator') {
        onNavigateTab('simulator');
        jarvisAudio.playBlip(800, 0.1);
      }

      showToast(`${currentStep.title} ready for demonstration!`, 'success');
    } catch (err) {
      showToast('Error during demonstration act execution', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleNext = () => {
    if (currentStepIndex < DEMO_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      jarvisAudio.playBlip(900, 0.05);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      jarvisAudio.playBlip(600, 0.05);
    }
  };

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ${
        minimized
          ? 'bottom-6 right-6 w-80'
          : 'bottom-6 right-6 w-[540px] max-w-[calc(100vw-2rem)]'
      }`}
    >
      <div className="bg-[#0b1120]/95 backdrop-blur-md border-2 border-cyan-500/50 rounded-2xl shadow-2xl overflow-hidden font-mono text-slate-100 flex flex-col">
        {/* Presenter HUD Header */}
        <div className="bg-gradient-to-r from-cyan-950/80 via-slate-900 to-indigo-950/80 px-4 py-3 border-b border-cyan-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  J.A.R.V.I.S Keynote Demo Controller
                </h4>
                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  Act {currentStep.actNumber} of 5
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Live Hackathon Judging Playbook
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMinimized(!minimized)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              title={minimized ? 'Expand Demo HUD' : 'Minimize Demo HUD'}
            >
              {minimized ? '🗖' : '🗕'}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 text-xs transition"
              title="Close Demo HUD"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Minimized Quick Bar */}
        {minimized ? (
          <div className="p-3 flex items-center justify-between text-xs">
            <span className="truncate font-semibold text-cyan-300 text-[11px]">
              {currentStep.title}
            </span>
            <button
              onClick={handleExecuteAct}
              disabled={isExecuting}
              className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-[11px] shrink-0"
            >
              {isExecuting ? '...' : '⚡ Run'}
            </button>
          </div>
        ) : (
          /* Expanded Full HUD Content */
          <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Act Title & Badge */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {currentStep.badge}
                </span>
                <span className="text-[10px] text-slate-400">
                  Tab: <strong className="text-cyan-300">{currentStep.targetNav}</strong>
                </span>
              </div>
              <h3 className="text-sm font-bold text-white mt-1">
                {currentStep.title}
              </h3>
              <p className="text-xs text-cyan-400 font-semibold mt-0.5">
                {currentStep.subtitle}
              </p>
            </div>

            {/* Scenario Description */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-xs text-slate-300 leading-relaxed">
              <span className="text-slate-500 text-[10px] font-bold uppercase block mb-1">
                Scenario Setup & Flow:
              </span>
              {currentStep.description}
            </div>

            {/* Presenter Narration Script */}
            <div className="bg-cyan-950/30 border border-cyan-500/30 p-3 rounded-xl text-xs text-cyan-200">
              <span className="text-cyan-400 text-[10px] font-bold uppercase flex items-center gap-1 mb-1">
                <span>🎙️</span>
                <span>Recommended Presenter Narration:</span>
              </span>
              <p className="italic">{currentStep.presenterScript}</p>
            </div>

            {/* Judge Key Takeaways */}
            <div className="space-y-1.5">
              <span className="text-slate-400 text-[10px] font-bold uppercase block">
                ⭐ Architectural Innovations for Judges:
              </span>
              <ul className="space-y-1 text-[11px] text-slate-300">
                {currentStep.judgeTakeaways.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-cyan-400 font-bold mt-0.5">✓</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Action Bar */}
            <div className="pt-2 border-t border-slate-800/80 space-y-3">
              {/* Primary 1-Click Run Button */}
              <button
                onClick={handleExecuteAct}
                disabled={isExecuting}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 text-black font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition"
              >
                {isExecuting ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Executing Scenario & Allocating...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>{currentStep.actionLabel}</span>
                  </>
                )}
              </button>

              {/* Step Navigation Controls */}
              <div className="flex items-center justify-between text-xs">
                <button
                  onClick={handlePrev}
                  disabled={currentStepIndex === 0 || isExecuting}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 transition"
                >
                  ← Prev Act
                </button>

                {/* Step Dots */}
                <div className="flex items-center gap-1.5">
                  {DEMO_STEPS.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCurrentStepIndex(idx);
                        jarvisAudio.playBlip(700 + idx * 50, 0.05);
                      }}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        currentStepIndex === idx
                          ? 'bg-cyan-400 ring-2 ring-cyan-400/50 scale-125'
                          : 'bg-slate-700 hover:bg-slate-500'
                      }`}
                      title={s.title}
                    />
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  disabled={currentStepIndex === DEMO_STEPS.length - 1 || isExecuting}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-700 transition"
                >
                  Next Act →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
