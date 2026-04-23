import { createFileRoute } from "@tanstack/react-router";
import { StubScreen } from "@/components/layout/stub-screen";

export const Route = createFileRoute("/inspection")({
  component: () => (
    <StubScreen
      title="Used Car Inspection"
      description="Guided pre-purchase camera inspection with scoring."
      bullets={[
        "Vehicle info + asking price",
        "Camera-led walkaround (exterior, interior, engine, tires)",
        "Auto-scored: exterior / interior / engine / tires / overall risk",
        "Findings list with severity",
        "Feeds the Valuation engine for negotiation",
      ]}
    />
  ),
});
