import { createFileRoute } from "@tanstack/react-router";
import { StubScreen } from "@/components/layout/stub-screen";

export const Route = createFileRoute("/repair")({
  component: () => (
    <StubScreen
      title="Repair Mode"
      description="Step-by-step DIY repair guides — wrap, paint, dent, rust and more."
      bullets={[
        "Vinyl wrap removal (heat + angle)",
        "Touch-up paint for chips and scratches",
        "Paintless dent repair",
        "Surface rust treatment",
        "AI-generated steps for any issue logged in History",
      ]}
    />
  ),
});
