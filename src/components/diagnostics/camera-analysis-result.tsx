import { Card, CardContent } from "@/components/ui/card";
import { severityClass } from "@/lib/severity";
import { cameraConfidenceTone, type AiCameraResult } from "@/lib/camera-analysis";

export function CameraAnalysisResult({
  result,
  label = "AI insight",
}: {
  result: AiCameraResult;
  label?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass("info")}`}
            >
              {label}
            </span>
            <p className="mt-2 text-sm">{result.summary}</p>
          </div>
          {result.overall_confidence && (
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cameraConfidenceTone(result.overall_confidence)}`}
            >
              {result.overall_confidence} confidence
            </span>
          )}
        </div>

        {result.image_quality && (
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <QualityCell label="Lighting" value={result.image_quality.lighting ?? "ok"} />
            <QualityCell label="Focus" value={result.image_quality.focus ?? "ok"} />
            <QualityCell label="Framing" value={result.image_quality.framing ?? "ok"} />
          </div>
        )}

        {result.recapture_tip && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs">
            <strong className="text-warning">Recapture tip:</strong>{" "}
            {result.recapture_tip}
          </div>
        )}

        {result.likely_components?.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Likely components
            </h4>
            <ul className="space-y-2">
              {result.likely_components.map((component, index) => (
                <li key={index} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{component.name}</span>
                    <span className="text-[11px] text-muted-foreground">{component.confidence}</span>
                  </div>
                  {component.likely_issue && (
                    <p className="mt-1 text-xs text-foreground">{component.likely_issue}</p>
                  )}
                  {component.what_to_check?.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                      {component.what_to_check.map((item, itemIndex) => (
                        <li key={itemIndex}>{item}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.warnings?.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <h4 className="text-xs font-semibold text-warning">Safety</h4>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {result.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {result.next_action && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Next action
            </h4>
            <p className="mt-1 text-sm">{result.next_action}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QualityCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-2 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xs font-medium text-foreground">{value}</div>
    </div>
  );
}
