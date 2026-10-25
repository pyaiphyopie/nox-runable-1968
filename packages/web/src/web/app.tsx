import { Route, Switch } from "wouter";
import { Provider } from "./components/provider";
import { Shell } from "./components/shell";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";

import TonightPage from "./pages/discover";
import RoomPage from "./pages/room";
import CheckoutPage from "./pages/checkout";
import CredentialsPage from "./pages/tickets";
import DoorPage from "./pages/door";
import OpsPage from "./pages/ops";
import OrganizerPage from "./pages/organizer";

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">404 · no such room</p>
      <h1 className="mt-3 font-display text-[44px] leading-none text-bone">Dark on this floor.</h1>
      <a href="/" className="mt-4 inline-block font-mono text-[12px] uppercase tracking-[0.12em] text-amber">
        ← back to tonight
      </a>
    </div>
  );
}

function App() {
  return (
    <Provider>
      <Shell>
        <Switch>
          <Route path="/" component={TonightPage} />
          <Route path="/room/:id" component={RoomPage} />
          <Route path="/checkout/:orderId" component={CheckoutPage} />
          <Route path="/tickets" component={CredentialsPage} />
          <Route path="/door" component={DoorPage} />
          <Route path="/ops" component={OpsPage} />
          <Route path="/organizer" component={OrganizerPage} />
          <Route component={NotFound} />
        </Switch>
      </Shell>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
      {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
      {<RunableBadge />}
    </Provider>
  );
}

export default App;
