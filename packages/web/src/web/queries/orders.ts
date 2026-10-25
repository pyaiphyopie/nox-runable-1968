import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useOrder(orderId: string | undefined) {
  return useQuery(
    orpc.orders.get.queryOptions({ input: { orderId: orderId ?? "" }, enabled: Boolean(orderId), refetchInterval: 6_000 }),
  );
}

export function useMyOrders() {
  return useQuery(orpc.orders.mine.queryOptions({ refetchInterval: 15_000 }));
}

/**
 * Creating an order is the one place a double tap is expensive: two orders would hold
 * inventory twice. The idempotency key is generated once per checkout attempt, so a
 * retry replays instead of duplicating.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.orders.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        queryClient.invalidateQueries({ queryKey: orpc.events.key() });
      },
    }),
  );
}

export function useAbandonOrder() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.orders.abandon.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        queryClient.invalidateQueries({ queryKey: orpc.events.key() });
      },
    }),
  );
}

export function useVerificationQueue() {
  return useQuery(orpc.orders.verificationQueue.queryOptions({ refetchInterval: 7_000 }));
}
