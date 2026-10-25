import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useOpsOverview() {
  return useQuery(orpc.ops.overview.queryOptions({ refetchInterval: 10_000 }));
}

export function useCoherence(eventId?: string) {
  return useQuery(orpc.ops.coherence.queryOptions({ input: { eventId }, refetchInterval: 12_000 }));
}

export function useAgentTasks(status: "open" | "applied" | "dismissed" | "all" = "open") {
  return useQuery(orpc.ops.tasks.queryOptions({ input: { status }, refetchInterval: 10_000 }));
}

export function useRunAgents() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.ops.runAgents.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.ops.key() });
      },
    }),
  );
}

export function useApplyTask() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.ops.applyTask.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.ops.key() });
        queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
        queryClient.invalidateQueries({ queryKey: orpc.events.key() });
      },
    }),
  );
}

export function useDismissTask() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.ops.dismissTask.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.ops.key() }),
    }),
  );
}

export function useAudit(limit = 40) {
  return useQuery(orpc.ops.audit.queryOptions({ input: { limit }, refetchInterval: 12_000 }));
}

export function useOpsRooms() {
  return useQuery(orpc.ops.rooms.queryOptions({ refetchInterval: 12_000 }));
}

export function useFunnel(eventId?: string) {
  return useQuery(orpc.analytics.funnel.queryOptions({ input: { eventId } }));
}

export function useSeedDemo() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.demo.seed.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );
}
