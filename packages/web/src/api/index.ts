import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { ping } from "./routes/ping";
import { eventsRoutes } from "./routes/events";
import { ordersRoutes } from "./routes/orders";
import { paymentsRoutes } from "./routes/payments";
import { ticketsRoutes } from "./routes/tickets";
import { entry } from "./routes/entry";
import { ops } from "./routes/ops";
import { analytics } from "./routes/analytics";
import { demo } from "./routes/demo";
import { upload } from "./routes/upload";

// Domain modules, mirroring the NOX blueprint's service layer: events, orders,
// payments, tickets, entry, ops (agents + audit), analytics. Each owns its tables.
export const router = {
  ping,
  events: eventsRoutes,
  orders: ordersRoutes,
  payments: paymentsRoutes,
  tickets: ticketsRoutes,
  entry,
  ops,
  analytics,
  upload,
  demo,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
// Rare plain-HTTP endpoints (webhooks, streaming, the Better Auth handler)
// register here with full paths, e.g. app.post("/api/webhooks/example", ...)

export default app;
