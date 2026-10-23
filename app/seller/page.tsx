"use client";
import { Fragment, useState } from "react";
import { LISTINGS, MODELS, demoResult } from "@/lib/demo";
import { encodeListing, runTryOn, useStatus } from "@/lib/client";
import { fileToCanvas, integrityCheck, maskReferenceHead, type Integrity } from "@/lib/vision";
import type { CoverageVerdict, ListingAttrs } from "@/lib/coverage";
import { Trace, type Step } from "@/components/Trace";
import { Seal } from "@/components/Seal";

interface Parsed { attrs: ListingAttrs; coverage: CoverageVerdict; plan: { category: string; why: string }; reader: string; trace: { tool: string; detail: string; ms: number; units: number }[] }
const PANEL = ["aisyah", "sara", "amara"];
const VERDICT_LABEL: Record<string, string> = { pass: "Meets standard coverage", pass_with_layer: "Needs a layer", fail: "Doesn't meet standard coverage", unknown: "Coverage unclear" };

export default function SellerPage() {
  const status = useStatus();
  const live = Boolean(status?.live);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [demoId, setDemoId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [garmentUrl, setGarmentUrl] = useState<string | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [masked, setMasked] = useState<{ url: string; canvas: HTMLCanvasElement; ok: boolean } | null>(null);
  const [renders, setRenders] = useState<{ model: string; url: string; integrity?: Integrity; error?: string }[]>([]);
  const [refId, setRefId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function pickDemo(id: string) {
    const l = LISTINGS.find((x) => x.id === id)!;
    setDemoId(id); setFile(null); setTitle(l.title); setDesc(l.description); setPrice(l.price); setGarmentUrl(l.garment);
    reset();
  }
  function onFile(f: File | null) {
    setFile(f); setDemoId(null); setGarmentUrl(f ? URL.createObjectURL(f) : null); reset();
  }
  function reset() { setParsed(null); setMasked(null); setRenders([]); setRefId(null); setSteps([]); setErr(null); }

  async function readAndPrepare() {
    setBusy(true); setErr(null); setRenders([]);
    try {
      const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description: desc }) });
      const p: Parsed = await r.json();
      if (!r.ok) throw new Error((p as any).error);
      setParsed(p);
      const s: Step[] = p.trace.map((t) => ({ tool: t.tool, detail: t.detail, state: "done", ms: t.ms }));
      if (garmentUrl) {
        const t0 = performance.now();
        const g = await fileToCanvas(file ?? garmentUrl);
        const m = await maskReferenceHead(g);
        setMasked({ url: m.canvas.toDataURL("image/jpeg", 0.85), canvas: m.canvas, ok: m.masked });
        s.push({ tool: "Prepare reference: hide the model's head (on device)", detail: m.masked ? "Head masked so her tudung won't be copied onto shoppers" : "No face found; reference used as is", state: "done", ms: performance.now() - t0 });
      }
      setSteps(s);
    } catch (e: any) { setErr(e.message ?? "Couldn't read the listing"); }
    setBusy(false);
  }

  async function renderPanel() {
    if (!parsed || !masked) return;
    setBusy(true); setErr(null);
    const useLive = !demoId;
    const out: typeof renders = [];
    let ref = refId;
    for (const id of PANEL) {
      const m = MODELS.find((x) => x.id === id)!;
      setSteps((p) => [...p, { tool: `Render on ${m.name} ${useLive ? `(YouCam cloth-v4, ${parsed.plan.category})` : "(stored YouCam render)"}`, state: "running" }]);
      const t0 = performance.now();
      try {
        const src = await fileToCanvas(m.photo);
        let url: string, units = 0;
        if (useLive) {
          const r = await runTryOn(src, ref ? { refFileId: ref, category: parsed.plan.category } : { garment: masked.canvas, category: parsed.plan.category });
          url = r.url; units = r.units; ref = r.refFileId ?? ref; setRefId(ref);
        } else url = demoResult(demoId!, id);
        const integrity = await integrityCheck(src, await fileToCanvas(url));
        out.push({ model: id, url, integrity });
        setSteps((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, state: "done", ms: performance.now() - t0, units, detail: `Tudung check: ${integrity.verdict.replace("_", " ")}` } : x)));
      } catch (e: any) {
        out.push({ model: id, url: "", error: e.message });
        setSteps((p) => p.map((x, i) => (i === p.length - 1 ? { ...x, state: "error", detail: e.message } : x)));
        if (e.code) break;
      }
      setRenders([...out]);
    }
    setBusy(false);
  }

  async function copyShare() {
    let g: string | undefined = demoId ? LISTINGS.find((l) => l.id === demoId)!.garment : undefined;
    if (!g && masked) {
      const c = document.createElement("canvas"); const s = 160 / Math.max(masked.canvas.width, masked.canvas.height);
      c.width = Math.round(masked.canvas.width * s); c.height = Math.round(masked.canvas.height * s);
      c.getContext("2d")!.drawImage(file ? await fileToCanvas(file) : masked.canvas, 0, 0, c.width, c.height);
      g = c.toDataURL("image/jpeg", 0.6);
    }
    const link = demoId
      ? `${location.origin}/try?listing=${demoId}`
      : `${location.origin}/try?l=${encodeListing({ t: title, d: desc, p: price || undefined, r: refId ?? undefined, g })}`;
    await navigator.clipboard.writeText(link);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  }

  const verified = renders.filter((r) => r.integrity?.verdict === "verified").length;

  return (
    <div className="stack" style={{ paddingBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)" }}>Show your piece on hijab-wearing models</h1>
        <p className="muted">Paste your listing and one photo of the outfit being worn. Sopan reads the listing, checks coverage, renders it on three models with YouCam, and checks every tudung before you post.</p>
      </div>
      <div className="two">
        <section className="panel stack">
          <div className="row small"><span className="muted">Start from an example:</span>
            {LISTINGS.map((l) => <button key={l.id} className="btn small secondary" onClick={() => pickDemo(l.id)}>{l.title.split("—")[0].split("(")[0].trim()}</button>)}
          </div>
          <div><label className="field" htmlFor="t">Listing title</label><input id="t" type="text" value={title} onChange={(e) => { setTitle(e.target.value); setDemoId(null); }} placeholder="e.g. Baju Kurung Moden Satin, lengan panjang" /></div>
          <div><label className="field" htmlFor="d">Description</label><textarea id="d" value={desc} onChange={(e) => { setDesc(e.target.value); setDemoId(null); }} placeholder="Paste the description from Shopee, TikTok Shop or Instagram (English or BM)" /></div>
          <div><label className="field" htmlFor="p">Price (optional)</label><input id="p" type="text" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="RM 89" /></div>
          <label className="upload">
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {garmentUrl ? <img src={garmentUrl} alt="Outfit photo" style={{ width: 48, height: 64, objectFit: "cover", borderRadius: 6 }} /> : <span aria-hidden style={{ fontSize: 22 }}>＋</span>}
            <span className="small">{file ? file.name : demoId ? "Example photo loaded — or upload yours" : "Photo of the outfit worn by a model (one garment per photo)"}</span>
          </label>
          {!demoId && file && !live && <div className="alert info small">Live rendering is off right now. Your listing can still be read and checked; use an example to see renders.</div>}
          <button className="btn" onClick={readAndPrepare} disabled={busy || !title || !garmentUrl}>Read listing and prepare photo</button>
        </section>

        <section className="stack">
          {err && <div className="alert bad">{err}</div>}
          {parsed && (
            <div className="panel stack">
              <div className="row"><h3 style={{ margin: 0 }}>What the listing says</h3><span className={`chip ${parsed.coverage.verdict}`}>{VERDICT_LABEL[parsed.coverage.verdict]}</span></div>
              <dl className="attrs">
                {(["category", "sleeve", "hem", "neckline", "opacity", "fabric"] as const).map((k) => (
                  <Fragment key={k}><dt>{k[0].toUpperCase() + k.slice(1)}</dt><dd>{String(parsed.attrs[k] ?? "—").replace("_", " ")} {parsed.attrs.evidence[k] && <span className="ev">· from &ldquo;{parsed.attrs.evidence[k]}&rdquo;</span>}</dd></Fragment>
                ))}
              </dl>
              {parsed.coverage.suggestions.length > 0 && <p className="small" style={{ margin: 0 }}>Tell shoppers: {parsed.coverage.suggestions.join("; ")}.</p>}
            </div>
          )}
          {masked && (
            <div className="panel stack">
              <h3>Reference photo, prepared</h3>
              <div className="pair" style={{ maxWidth: 420 }}>
                <figure><img src={garmentUrl!} alt="Original outfit photo" /><figcaption>As uploaded</figcaption></figure>
                <figure><img src={masked.url} alt="Outfit photo with the model's head hidden" /><figcaption>Sent to YouCam</figcaption></figure>
              </div>
              <p className="small muted" style={{ margin: 0 }}>Hiding the model&rsquo;s head stops the engine copying her tudung onto shoppers: 16 of 16 tudung kept in our study, versus 6 of 16 without.</p>
              <button className="btn" onClick={renderPanel} disabled={busy}>{busy ? "Rendering…" : demoId ? "Render on 3 models" : `Render on 3 models (${PANEL.length * 2} YouCam units)`}</button>
            </div>
          )}
          {steps.length > 0 && <div className="panel"><h3>What Sopan did</h3><Trace steps={steps} /></div>}
          {renders.length > 0 && (
            <div className="panel stack">
              <h3>Listing pack · {verified} of {renders.length} passed the tudung check</h3>
              <div className="result-grid">
                {renders.map((r) => {
                  const m = MODELS.find((x) => x.id === r.model)!;
                  return (
                    <figure key={r.model} className="result" style={{ margin: 0 }}>
                      {r.url ? (
                        <div className={`seal-wrap ${r.integrity?.verdict === "hair_exposed" ? "blocked" : ""}`}>
                          <img src={r.url} alt={`${m.name} wearing the piece`} />
                          {r.integrity?.verdict === "hair_exposed" && <div className="why">Not for posting: hair showing</div>}
                          {r.integrity && <Seal verdict={r.integrity.verdict} />}
                        </div>
                      ) : <div className="alert bad small">{r.error}</div>}
                      <figcaption className="small" style={{ marginTop: 6 }}>{m.name}
                        {r.url && r.integrity?.verdict !== "hair_exposed" && <> · <a href={r.url} download={`sopan-${r.model}.jpg`}>Download</a></>}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              <div className="row">
                <button className="btn" onClick={copyShare}>{copied ? "Link copied" : "Copy “try it on me” link"}</button>
                <span className="small muted">Put the link in your listing or live-stream caption. Shoppers try the piece on their own photo, tudung and all.</span>
              </div>
              <p className="label-honest">Model photos are AI try-on previews made with YouCam. Label them as previews in your listing; they don&rsquo;t show fit, size or sheerness.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
