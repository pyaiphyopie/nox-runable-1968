import { z } from "zod";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { base } from "../__core/app";
import { s3 } from "../lib/s3";
import { newId } from "../lib/ids";

/**
 * Receipt photos. The verifier has to be able to look at the same image the payer sent,
 * so the object key is stored on the payment row and read back through a short-lived GET.
 */
export const upload = {
  presign: base
    .input(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(3),
        orderRef: z.string().default("misc"),
      }),
    )
    .handler(async ({ input }) => {
      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      const key = `receipts/${input.orderRef}/${newId("rcpt")}-${safe}`;
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          ContentType: input.contentType,
        }),
        { expiresIn: 600 },
      );
      return { url, key };
    }),

  viewUrl: base.input(z.object({ key: z.string() })).handler(async ({ input }) => {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: input.key }),
      { expiresIn: 3600 },
    );
    return { url };
  }),
};
