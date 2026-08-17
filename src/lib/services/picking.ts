import { PickingTask, PickingStatus, Order } from '@/lib/types';

let pickingStore: PickingTask[] = [];

export function createPickingTask(order: Order, location_sequence: string[]): PickingTask {
  const task: PickingTask = {
    id: crypto.randomUUID(),
    order_id: order.id,
    warehouse_id: order.warehouse_id,
    status: PickingStatus.PENDING,
    priority: order.priority_score,
    location_sequence
  };
  pickingStore.push(task);
  return task;
}

export function getPickingTasks(filters?: { status?: PickingStatus, warehouse_id?: string }): PickingTask[] {
  let result = pickingStore;
  if (filters) {
    if (filters.status) result = result.filter(t => t.status === filters.status);
    if (filters.warehouse_id) result = result.filter(t => t.warehouse_id === filters.warehouse_id);
  }
  return result;
}

export function updatePickingStatus(task_id: string, status: PickingStatus): { success: boolean, error?: string } {
  const task = pickingStore.find(t => t.id === task_id);
  if (!task) return { success: false, error: 'Picking task not found' };
  
  task.status = status;
  if (status === PickingStatus.PICKING && !task.started_at) {
    task.started_at = new Date().toISOString();
  } else if (status === PickingStatus.PICKED) {
    task.completed_at = new Date().toISOString();
  }
  return { success: true };
}

export function getPickingBacklog(): PickingTask[] {
  return pickingStore
    .filter(t => t.status === PickingStatus.PENDING)
    .sort((a, b) => b.priority - a.priority);
}

export function resetPicking(): void {
  pickingStore = [];
}
