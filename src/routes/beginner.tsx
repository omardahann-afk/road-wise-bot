import { createFileRoute } from "@tanstack/react-router";
import { StubScreen } from "@/components/layout/stub-screen";

export const Route = createFileRoute("/beginner")({
  component: () => (
    <StubScreen
      title="Beginner Mode"
      description="Learn what every part of your car does — at your level."
      bullets={[
        "Guided tour of engine bay, dash, undercarriage",
        "Explanations adapted to your experience level",
        "Glossary of warning lights and symbols",
        "Hands-on first-time tasks (check oil, fluids, tires)",
      ]}
    />
  ),
});
