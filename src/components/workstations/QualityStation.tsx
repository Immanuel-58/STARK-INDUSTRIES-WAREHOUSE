'use client';

import React, { useState, useEffect } from 'react';
import { QualityCheck, QualityCheckStatus, Order, OrderStatus, Product, Customer } from '@/lib/types';
import { DEMO_PRODUCTS, DEMO_CUSTOMERS } from '@/lib/seed-data';
import { jarvisAudio } from '@/components/hud/JarvisAudio';

interface QualityStationProps {
  onRefreshParent: () => void;
  showToast: (text: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export default function QualityStation({ onRefreshParent, showToast }: QualityStationProps) {
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedCheck, setSelectedCheck] = useState<QualityCheck | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inspectionNotes, setInspectionNotes] = useState<string>('Carton intact, seal verified, item quantity matches order manifest.');
  const [qcCriteria, setQcCriteria] = useState({
    sealIntact: true,
    correctItems: true,
    noDamage: true,
    labelReadable: true,
  });

  const fetchQualityData = async () => {
    try {
      setLoading(true);
      const [qcRes, ordersRes] = await Promise.all([
        fetch('/api/quality'),
        fetch('/api/orders'),
      ]);
      const [qcData, ordersData] = await Promise.all([qcRes.json(), ordersRes.json()]);

      if (qcData.success) {
        setChecks(qcData.data || []);
      }
      if (ordersData.success) {
        setOrders(ordersData.data || []);
      }
    } catch (err) {
      console.error('Failed to load QC checks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQualityData();
  }, []);

  const getOrderForCheck = (orderId: string) => orders.find((o) => o.id === orderId);
  const getCustomer = (id?: string) => DEMO_CUSTOMERS.find((c) => c.id === id);

  const handlePerformQC = async (check: QualityCheck, passed: boolean) => {
    try {
      setActionLoading(check.id);
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'perform',
          check_id: check.id,
          order_id: check.order_id,
          passed,
          notes: inspectionNotes || (passed ? 'Automated inspection PASSED' : 'DEFECT DETECTED: Quarantined'),
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (passed) {
          jarvisAudio.playConfirm();
          // Also generate dispatch entry if passed
          await fetch('/api/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order_id: check.order_id,
              carrier: 'FedEx Priority Ground',
              tracking_number: `TRK-QC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            }),
          });

          showToast(`Quality Passed for Order ${getOrderForCheck(check.order_id)?.order_number || check.order_id}! Routed to Dispatch Dock.`, 'success');
        } else {
          jarvisAudio.playAlert();
          showToast(`Defect flagged for Order ${getOrderForCheck(check.order_id)?.order_number || check.order_id}! Order quarantined as EXCEPTION.`, 'error');
        }
        setSelectedCheck(null);
        await fetchQualityData();
        onRefreshParent();
      } else {
        showToast(data.error || 'Failed to record QC decision', 'error');
      }
    } catch (err) {
      showToast('Network error processing QC', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingChecks = checks.filter((c) => c.status === QualityCheckStatus.PENDING);
  const passedChecks = checks.filter((c) => c.status === QualityCheckStatus.PASSED);
  const failedChecks = checks.filter((c) => c.status === QualityCheckStatus.FAILED);

  return (
    <div className="space-y-6 font-mono">
      {/* STATION HEADER & LIVE STATS */}
      <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-bold text-black text-xl shadow-lg shadow-emerald-500/20">
              🔍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold uppercase text-white tracking-wide">
                  Quality Control Station #3 (Optical & Weight QA)
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  DEFECT SHIELD ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Seal integrity, item count verification, anti-tamper validation, and defect exception routing.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Awaiting QA</div>
              <div className="text-sm font-bold text-amber-400">{pendingChecks.length} checks</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Passed (Yield)</div>
              <div className="text-sm font-bold text-emerald-400">{passedChecks.length} approved</div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-right">
              <div className="text-[10px] text-slate-500 uppercase">Defects Caught</div>
              <div className="text-sm font-bold text-rose-400">{failedChecks.length} flagged</div>
            </div>
            <button
              onClick={fetchQualityData}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition"
              title="Refresh Queue"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* MAIN QC CONSOLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLS: QC QUEUE */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Cartons Awaiting Quality Inspection
              </h3>
              <span className="text-xs text-slate-400">
                Anti-Tamper & Manifest Audit
              </span>
            </div>

            <div className="divide-y divide-slate-800/80">
              {checks.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No cartons currently in QC queue. Complete packing tasks to route cartons here.
                </div>
              ) : (
                checks.map((check) => {
                  const ord = getOrderForCheck(check.order_id);
                  const cust = getCustomer(ord?.customer_id);
                  const isSelected = selectedCheck?.id === check.id;

                  return (
                    <div
                      key={check.id}
                      onClick={() => setSelectedCheck(check)}
                      className={`p-4 cursor-pointer transition flex flex-wrap items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-950/20 border-l-4 border-emerald-500 text-white'
                          : 'hover:bg-slate-900/50 text-slate-300'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord?.order_number || check.order_id.slice(0, 8)}</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              check.status === QualityCheckStatus.PASSED
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : check.status === QualityCheckStatus.FAILED
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                            }`}
                          >
                            {check.status}
                          </span>
                          {cust?.tier === 'vip' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              VIP AUDIT
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Customer: <strong className="text-slate-200">{cust?.name || 'Customer'}</strong> • Channel: {ord?.channel}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Check Ref: {check.id.slice(0, 8)} • Value: ${ord?.total_value.toFixed(2) || '0.00'}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {check.status === QualityCheckStatus.PENDING ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePerformQC(check, true);
                              }}
                              disabled={actionLoading === check.id}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                            >
                              <span>✓</span>
                              <span>Pass QC</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePerformQC(check, false);
                              }}
                              disabled={actionLoading === check.id}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded transition flex items-center gap-1"
                            >
                              <span>✕</span>
                              <span>Fail</span>
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`text-xs font-semibold ${
                              check.status === QualityCheckStatus.PASSED ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {check.status === QualityCheckStatus.PASSED ? '✓ Approved & Dispatched' : '✕ Quarantined (Defect)'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: QC INSPECTION & CRITERIA BENCH */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#0c1222] border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Active QC Bench & Optical Scanner
                </h3>
              </div>
              <span className="text-[10px] text-slate-500">
                {selectedCheck ? `QC ID: ${selectedCheck.id.slice(0, 8)}` : 'No carton loaded'}
              </span>
            </div>

            {selectedCheck ? (
              <div className="space-y-4">
                {/* Order Details Header */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Carton Identifier:</span>
                    <span className="font-bold text-white">
                      {getOrderForCheck(selectedCheck.order_id)?.order_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Customer Tier:</span>
                    <span className="font-bold text-purple-300">
                      {getCustomer(getOrderForCheck(selectedCheck.order_id)?.customer_id)?.tier.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Anti-Tamper Tape:</span>
                    <span className="font-mono text-emerald-400 font-bold">VERIFIED SEALED</span>
                  </div>
                </div>

                {/* 4-Point Inspection Checklist */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    4-Point Quality Protocol:
                  </span>
                  <div className="mt-2 space-y-2 text-xs">
                    {[
                      { key: 'sealIntact', label: '1. Carton Structural Integrity (No crushing/tears)' },
                      { key: 'correctItems', label: '2. Physical Items Match Order Manifest Count' },
                      { key: 'noDamage', label: '3. Zero Cosmetic or Functional Hardware Damage' },
                      { key: 'labelReadable', label: '4. Shipping & Barcode Labels 100% Readable' },
                    ].map((item) => {
                      const isChecked = (qcCriteria as any)[item.key];
                      return (
                        <div
                          key={item.key}
                          onClick={() => setQcCriteria({ ...qcCriteria, [item.key]: !isChecked })}
                          className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition ${
                            isChecked
                              ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-200'
                              : 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                          }`}
                        >
                          <span className="text-[11px]">{item.label}</span>
                          <span className={`font-bold text-xs ${isChecked ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isChecked ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Inspection Notes */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    Inspector Notes / Defect Log:
                  </span>
                  <textarea
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    rows={2}
                    className="w-full mt-1.5 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none font-mono"
                    placeholder="Enter inspection audit notes..."
                  />
                </div>

                {/* Action Footer */}
                {selectedCheck.status === QualityCheckStatus.PENDING && (
                  <div className="pt-3 border-t border-slate-800 flex gap-2">
                    <button
                      onClick={() => handlePerformQC(selectedCheck, true)}
                      disabled={actionLoading === selectedCheck.id}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow-md shadow-emerald-900/30"
                    >
                      ✓ Approve & Route to Dispatch Dock
                    </button>
                    <button
                      onClick={() => handlePerformQC(selectedCheck, false)}
                      disabled={actionLoading === selectedCheck.id}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      ✕ Flag Defect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-500 text-xs">
                Select a carton from the queue to run the 4-point optical inspection protocol.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
