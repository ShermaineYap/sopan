export interface Step { tool: string; detail?: string; state: "pending" | "running" | "done" | "error"; ms?: number; units?: number }

export function Trace({ steps }: { steps: Step[] }) {
  return (
    <ol className="trace" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i} className={s.state === "done" || s.state === "error" ? "" : s.state}>
          <span className="tool">{s.tool}</span>
          {s.state === "running" && <span className="meta"> · working…</span>}
          {s.detail && <div className={s.state === "error" ? "alert bad small" : ""}>{s.detail}</div>}
          {(s.ms != null || s.units) && s.state === "done" && (
            <div className="meta">{s.ms != null ? `${(s.ms / 1000).toFixed(1)} s` : ""}{s.units ? ` · ${s.units} YouCam units` : " · 0 units"}</div>
          )}
        </li>
      ))}
    </ol>
  );
}
