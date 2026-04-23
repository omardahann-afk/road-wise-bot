import { createFileRoute } from "@tanstack/react-router";
import { StubScreen } from "@/components/layout/stub-screen";

export const Route = createFileRoute("/cleaning")({
  component: () => (
    <StubScreen
      title="Cleaning & Maintenance"
      description="Detailing, LED installs, and routine maintenance walkthroughs."
      bullets={[
        "Interior deep clean checklist",
        "Exterior detailing flow",
        "LED strip / bulb upgrades",
        "Oil, tire pressure, fluids",
        "Recommended product list per task",
      ]}
    />
  ),
});
