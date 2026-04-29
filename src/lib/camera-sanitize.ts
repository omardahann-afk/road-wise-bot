// ============================================================================
// Camera label sanitization.
//
// Detectors (COCO, generic vision models) often return useless top-level
// labels like "car", "vehicle", "object". Surfacing those as a final
// diagnosis makes the app feel broken ("likely cause: car").
//
// This module centralizes the rules for:
//   - detecting generic / non-actionable labels
//   - rewriting them into honest, user-facing copy
//   - preferring concrete damage labels when available
// ============================================================================

const GENERIC_LABEL_RE = /^(car|vehicle|object|unknown|item|thing|automobile|auto)s?$/i;

export function isGenericLabel(label: string | null | undefined): boolean {
  if (!label) return true;
  return GENERIC_LABEL_RE.test(label.trim());
}

/** Friendly fallback when the detector only returned a generic class. */
export const UNIDENTIFIED_AREA_LABEL = "Unidentified exterior area";

/**
 * Returns a sanitized label suitable for showing to the user as a likely
 * cause / detected part. Generic labels collapse to a friendly fallback.
 */
export function sanitizeLabel(label: string | null | undefined): string {
  if (!label || !label.trim()) return UNIDENTIFIED_AREA_LABEL;
  if (isGenericLabel(label)) return UNIDENTIFIED_AREA_LABEL;
  return label;
}
