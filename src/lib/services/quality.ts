import { QualityCheck, QualityCheckStatus } from '@/lib/types';

let qualityStore: QualityCheck[] = [];

export function createQualityCheck(order_id: string, packing_task_id: string): QualityCheck {
  const check: QualityCheck = {
    id: crypto.randomUUID(),
    order_id,
    packing_task_id,
    status: QualityCheckStatus.PENDING,
    check_items: {}
  };
  qualityStore.push(check);
  return check;
}

export function performQualityCheck(check_id: string, passed: boolean, notes?: string): { success: boolean, error?: string } {
  const check = qualityStore.find(c => c.id === check_id);
  if (!check) return { success: false, error: 'Quality check not found' };
  
  check.status = passed ? QualityCheckStatus.PASSED : QualityCheckStatus.FAILED;
  if (notes) check.notes = notes;
  check.checked_at = new Date().toISOString();
  return { success: true };
}

export function getQualityChecks(filters?: { order_id?: string; status?: QualityCheckStatus }): QualityCheck[] {
  let result = qualityStore;
  if (filters) {
    if (filters.order_id) result = result.filter(c => c.order_id === filters.order_id);
    if (filters.status) result = result.filter(c => c.status === filters.status);
  }
  return result;
}

export function resetQuality(): void {
  qualityStore = [];
}
