import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "../lib/api";

export function useSubmitProof() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.payments.submitProof.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        queryClient.invalidateQueries({ queryKey: orpc.payments.key() });
      },
    }),
  );
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.payments.verify.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        queryClient.invalidateQueries({ queryKey: orpc.ops.key() });
        queryClient.invalidateQueries({ queryKey: orpc.tickets.key() });
      },
    }),
  );
}

export function useRejectPayment() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.payments.reject.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.orders.key() });
        queryClient.invalidateQueries({ queryKey: orpc.ops.key() });
      },
    }),
  );
}

export function useAdapters() {
  return useQuery(orpc.payments.adapters.queryOptions({ staleTime: 300_000 }));
}

export function useVolume() {
  return useQuery(orpc.payments.volume.queryOptions({ refetchInterval: 20_000 }));
}

/** Client → Tigris directly. The API only signs the URL. */
export async function uploadReceipt(file: File, orderRef: string): Promise<string> {
  const { url, key } = await client.upload.presign({
    filename: file.name,
    contentType: file.type || "image/jpeg",
    orderRef,
  });
  const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
  if (!res.ok) throw new Error(`Receipt upload failed (${res.status})`);
  return key;
}

export async function receiptUrl(key: string): Promise<string> {
  const { url } = await client.upload.viewUrl({ key });
  return url;
}
