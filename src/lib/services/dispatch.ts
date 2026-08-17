import { Dispatch, DispatchStatus } from '@/lib/types';

let dispatchStore: Dispatch[] = [];

export function createDispatch(order_id: string, carrier: string): Dispatch {
  const dispatch: Dispatch = {
    id: crypto.randomUUID(),
    order_id,
    tracking_number: '',
    carrier,
    status: DispatchStatus.PENDING
  };
  dispatchStore.push(dispatch);
  return dispatch;
}

export function updateDispatchStatus(dispatch_id: string, status: DispatchStatus, tracking_number?: string): { success: boolean, error?: string } {
  const dispatch = dispatchStore.find(d => d.id === dispatch_id);
  if (!dispatch) return { success: false, error: 'Dispatch not found' };
  
  dispatch.status = status;
  if (tracking_number) dispatch.tracking_number = tracking_number;
  
  if (status === DispatchStatus.IN_TRANSIT && !dispatch.dispatched_at) {
    dispatch.dispatched_at = new Date().toISOString();
  } else if (status === DispatchStatus.DELIVERED && !dispatch.delivered_at) {
    dispatch.delivered_at = new Date().toISOString();
  }
  return { success: true };
}

export function getDispatches(filters?: { status?: DispatchStatus }): Dispatch[] {
  let result = dispatchStore;
  if (filters && filters.status) {
    result = result.filter(d => d.status === filters.status);
  }
  return result;
}

export function resetDispatch(): void {
  dispatchStore = [];
}
