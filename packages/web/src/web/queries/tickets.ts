import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useMyTickets() {
  return useQuery(orpc.tickets.mine.queryOptions({ refetchInterval: 12_000 }));
}

export function useTicket(ticketId: string | undefined) {
  return useQuery(
    orpc.tickets.get.queryOptions({ input: { ticketId: ticketId ?? "" }, enabled: Boolean(ticketId) }),
  );
}

export function useOrderTickets(orderId: string | undefined) {
  return useQuery(
    orpc.tickets.forOrder.queryOptions({ input: { orderId: orderId ?? "" }, enabled: Boolean(orderId), refetchInterval: 10_000 }),
  );
}

export function useInspectToken(token: string | undefined) {
  return useQuery(
    orpc.tickets.inspect.queryOptions({ input: { token: token ?? "" }, enabled: Boolean(token && token.length > 8) }),
  );
}
