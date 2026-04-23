import { createFileRoute } from "@tanstack/react-router";
import { StubScreen } from "@/components/layout/stub-screen";

export const Route = createFileRoute("/valuation")({
  component: () => (
    <StubScreen
      title="Value & Negotiate"
      description="Fair market value + AI-driven negotiation advice."
      bullets={[
        "Calculates: base × (1 − mileage factor) × condition factor",
        "Returns low / average / high fair value",
        "BUY · NEGOTIATE · AVOID decision",
        "Specific talking points for the seller",
        "Saved as a Valuation Report in History",
      ]}
    />
  ),
});
