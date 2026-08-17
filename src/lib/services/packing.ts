import { PackingTask, PackingStatus } from '@/lib/types';

let packingStore: PackingTask[] = [];

export function createPackingTask(order_id: string, picking_task_id: string): PackingTask {
  const task: PackingTask = {
    id: crypto.randomUUID(),
    order_id,
    picking_task_id,
    status: PackingStatus.PENDING
  };
  packingStore.push(task);
  return task;
}

export function updatePackingStatus(task_id: string, status: PackingStatus): { success: boolean, error?: string } {
  const task = packingStore.find(t => t.id === task_id);
  if (!task) return { success: false, error: 'Packing task not found' };
  
  task.status = status;
  if (status === PackingStatus.PACKING && !task.started_at) {
    task.started_at = new Date().toISOString();
  } else if (status === PackingStatus.PACKED) {
    task.completed_at = new Date().toISOString();
  }
  return { success: true };
}

export function getPackingTasks(filters?: { order_id?: string; status?: PackingStatus }): PackingTask[] {
  let result = packingStore;
  if (filters) {
    if (filters.order_id) result = result.filter(t => t.order_id === filters.order_id);
    if (filters.status) result = result.filter(t => t.status === filters.status);
  }
  return result;
}

export function getPackingBacklog(): PackingTask[] {
  return packingStore.filter(t => t.status === PackingStatus.PENDING);
}

export function resetPacking(): void {
  packingStore = [];
}
