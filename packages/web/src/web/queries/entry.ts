import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useRoomsForDoor() {
  return useQuery(orpc.entry.rooms.queryOptions({ staleTime: 60_000 }));
}

export function useScan() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.entry.scan.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.entry.key() });
        queryClient.invalidateQueries({ queryKey: orpc.events.key() });
        queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
      },
    }),
  );
}

export function useRecentScans(eventId: string | undefined) {
  return useQuery(
    orpc.entry.recent.queryOptions({ input: { eventId, limit: 12 }, refetchInterval: 5_000 }),
  );
}

export function useScanStats(eventId: string | undefined) {
  return useQuery(
    orpc.entry.stats.queryOptions({ input: { eventId }, refetchInterval: 8_000 }),
  );
}
