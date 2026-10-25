import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";

/** Tonight's rooms — live, so availability moves under the user. */
export function useRooms() {
  return useQuery(orpc.events.list.queryOptions({ refetchInterval: 8_000 }));
}

export function useRoom(id: string | undefined) {
  return useQuery(
    orpc.events.get.queryOptions({ input: { id: id ?? "" }, enabled: Boolean(id), refetchInterval: 10_000 }),
  );
}

export function useRoomState(id: string | undefined) {
  return useQuery(
    orpc.events.state.queryOptions({ input: { id: id ?? "" }, enabled: Boolean(id), refetchInterval: 8_000 }),
  );
}

export function usePerformance(eventId: string | undefined) {
  return useQuery(
    orpc.events.performance.queryOptions({ input: { eventId: eventId ?? "" }, enabled: Boolean(eventId) }),
  );
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.events.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.events.key() }),
    }),
  );
}

export function useAddTier() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.events.addTier.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.events.key() }),
    }),
  );
}

export function useSetEventStatus() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.events.setStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.events.key() }),
    }),
  );
}
