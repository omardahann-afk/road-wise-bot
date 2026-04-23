// Severity color tokens
export function severityClass(s?: string | null) {
  switch (s) {
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "high":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "medium":
      return "bg-warning/15 text-warning border-warning/30";
    case "low":
      return "bg-success/15 text-success border-success/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
