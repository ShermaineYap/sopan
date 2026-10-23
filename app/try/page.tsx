"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LISTINGS, MODELS, demoResult, hasUnmasked } from "@/lib/demo";
import { decodeListing, measureSkin, runTryOn, useStatus } from "@/lib/client";
import { fileToCanvas, integrityCheck, maskReferenceHead, recolor, tudungMask, estimateSkinHex, type Integrity } from "@/lib/vision";
import { rankTudungShades, type ShadeScore } from "@/lib/color";
import type { CoverageVerdict, ListingAttrs } from "@/lib/coverage";
import { Trace, type Step } from "@/components/Trace";
import { Seal, verdictText } from "@/components/Seal";

interface Parsed { attrs: ListingAttrs; coverage: CoverageVerdict; plan: { category: string; why: string }; reader: string }

const VERDICT_LABEL: Record<string, string> = { pass: "Meets your coverage", pass_with_layer: "Needs a layer", fail: "Doesn't meet your coverage", unknown: "Coverage unclear" };

export default function TryPage() {
  return <Suspense fallback={<p>Loading…</p>}><TryOn /></Suspense>;
}

function TryOn() {
  const sp = useSearchParams();
  const status = useStatus();
  const shared = useMemo(() => (sp.get("l") ? decodeListing(sp.get("l")!) : null), [sp]);
  const demoId = sp.get("listing") ?? (shared ? null : "abaya-sulam");
  const demo = LISTINGS.find((l) => l.id === demoId) ?? null;
  const listing = shared
    ? { id: null as string | null, title: shared.t, description: shared.d, price: shared.p ?? "", garment: shared.g ?? null, shop: "Shared by seller", refFileId: shared.r }
    : { ...demo!, refFileId: undefined as string | undefined };

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [modelId, setModelId] = useState<string | null>("aisyah");
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; integrity: Integrity; seconds?: number; units: number; mode: "live" | "demo" } | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showUnmasked, setShowUnmasked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shades, setShades] = useState<{ skin: string; source: string; ranked: ShadeScore[] } | null>(null);
  const [shadePreview, setShadePreview] = useState<{ name: string; url: string } | null>(null);
  const resultCanvas = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: listing.title, description: listing.description }) })
      .then((r) => r.json()).then(setParsed).catch(() => setError("Couldn't read the listing"));
    setResult(null); setShades(null); setShadePreview(null); setSteps([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.title]);

  const live = Boolean(status?.live);
  const model = MODELS.find((m) => m.id === modelId) ?? null;
  const canDemo = Boolean(listing.id && model && !upload);
  const canLive = live && Boolean(listing.garment || listing.refFileId) && Boolean(model || upload);

  function onUpload(f: File | null) {
    setUpload(f); setModelId(null); setResult(null); setShades(null); setShadePreview(null);
    setUploadUrl(f ? URL.createObjectURL(f) : null);
  }

  const update = (i: number, s: Partial<Step>) => setSteps((prev) => prev.map((p, k) => (k === i ? { ...p, ...s } : p)));

  async function run() {
    if (!parsed) return;
    setBusy(true); setError(null); setResult(null); setShades(null); setShadePreview(null); setShowOverlay(false); setShowUnmasked(false);
    // sample model + demo listing = stored real render (saves units); own photo or shared listing = live
    const useLive = !canDemo && canLive;
    const base: Step[] = [
      { tool: `Read listing (${parsed.reader === "gemini" ? "Gemini" : "EN/BM rules"})`, detail: `${parsed.attrs.category.replace("_", " ")}, sleeve ${parsed.attrs.sleeve}, hem ${parsed.attrs.hem}`, state: "done", ms: 0 },
      { tool: "Check coverage against your profile", detail: `${VERDICT_LABEL[parsed.coverage.verdict]} — ${parsed.coverage.reasons.join("; ")}`, state: "done", ms: 0 },
      { tool: "Hide the seller model's head in the reference (on device)", state: "pending" },
      { tool: useLive ? `Render with YouCam Clothes VTO (cloth-v4, ${parsed.plan.category})` : "Load YouCam render from the demo set", state: "pending" },
      { tool: "Check your tudung and coverage in the result (on device)", state: "pending" },
    ];
    setSteps(base);
    try {
      const src = upload ? await fileToCanvas(upload) : await fileToCanvas(model!.photo);
      // step 3
      update(2, { state: "running" });
      let t = performance.now();
      let garmentCanvas: HTMLCanvasElement | undefined;
      if (listing.refFileId) {
        update(2, { state: "done", detail: "Seller already prepared a head-masked reference", ms: 0 });
      } else {
        const g = await fileToCanvas(listing.garment!);
        const m = await maskReferenceHead(g);
        garmentCanvas = m.canvas;
        update(2, { state: "done", detail: m.masked ? "Masked the model's head so her tudung isn't copied onto you" : "No face in the reference, used as is", ms: performance.now() - t });
      }
      // step 4
      update(3, { state: "running" });
      t = performance.now();
      let url: string, seconds: number | undefined, units = 0;
      if (useLive) {
        const r = await runTryOn(src, { garment: garmentCanvas, refFileId: listing.refFileId, category: parsed.plan.category });
        url = r.url; seconds = r.seconds; units = r.units;
        update(3, { state: "done", detail: parsed.plan.why, ms: performance.now() - t, units });
      } else {
        url = demoResult(listing.id!, model!.id);
        update(3, { state: "done", detail: "Real cloth-v4 render from the Day-1 study (no units spent)", ms: performance.now() - t });
      }
      // step 5
      update(4, { state: "running" });
      t = performance.now();
      const outCanvas = await fileToCanvas(url);
      resultCanvas.current = outCanvas;
      const integrity = await integrityCheck(src, outCanvas);
      update(4, {
        state: "done", ms: performance.now() - t,
        detail: `${integrity.verdict.replace("_", " ")} · covering overlap ${integrity.coverIoU} · colour shift ΔE ${integrity.coverDeltaE} · extra skin ${(integrity.skinIncrease * 100).toFixed(0)}%`,
      });
      setResult({ url, integrity, seconds, units, mode: useLive ? "live" : "demo" });
      // tudung shades: local skin estimate first
      const skin = await estimateSkinHex(src);
      if (skin) setShades({ skin, source: "estimated on your device", ranked: rankTudungShades(skin) });
      const tm = await tudungMask(outCanvas);
      maskRef.current = tm?.region ?? null;
    } catch (e: any) {
      setError(e.code === "demo" || e.code === "reserve" || e.code === "limit" ? `${e.message}. Pick a sample model to see a demo render.` : e.message ?? "Something went wrong");
      setSteps((prev) => prev.map((p) => (p.state === "running" ? { ...p, state: "error", detail: e.message } : p)));
    } finally {
      setBusy(false);
    }
  }

  async function measure() {
    const src = upload ? await fileToCanvas(upload) : await fileToCanvas(model!.photo);
    const r = await measureSkin(src);
    if (r) setShades({ skin: r.skin, source: `measured by YouCam Facial Color Tones (${r.units} units)`, ranked: rankTudungShades(r.skin) });
  }

  function previewShade(s: ShadeScore) {
    if (!resultCanvas.current || !maskRef.current) return;
    setShadePreview({ name: s.name, url: recolor(resultCanvas.current, maskRef.current, s.hex) });
  }

  const blocked = result?.integrity.verdict === "hair_exposed";
  const shownUrl = showUnmasked && listing.id ? demoResult(listing.id, model!.id, true) : showOverlay ? result?.integrity.overlayUrl : shadePreview?.url ?? result?.url;

  return (
    <div className="two" style={{ paddingBottom: 24 }}>
      <section className="stack">
        <div className="panel stack">
          <div className="listing">
            {listing.garment ? <img src={listing.garment} alt="" /> : <div style={{ width: 96, height: 128, background: "#e9e3ec", borderRadius: 8 }} />}
            <div>
              <div className="small muted">{listing.shop}</div>
              <h2 style={{ fontSize: "1.15rem" }}>{listing.title}</h2>
              {listing.price && <div className="price">{listing.price}</div>}
            </div>
          </div>
          {parsed ? (
            <div className="stack">
              <div><span className={`chip ${parsed.coverage.verdict}`}>{VERDICT_LABEL[parsed.coverage.verdict]}</span></div>
              <p className="small" style={{ margin: 0 }}>{parsed.coverage.reasons.join(". ")}.</p>
              {parsed.coverage.suggestions.length > 0 && <p className="small muted" style={{ margin: 0 }}>Suggestion: {parsed.coverage.suggestions.join("; ")}.</p>}
            </div>
          ) : <p className="small muted">Reading the listing…</p>}
          {!shared && (
            <div className="row small">
              <span className="muted">Other listings:</span>
              {LISTINGS.filter((l) => l.id !== listing.id).map((l) => <Link key={l.id} href={`/try?listing=${l.id}`}>{l.title.split("—")[0].trim()}</Link>)}
            </div>
          )}
        </div>

        <div className="panel stack">
          <h3>Your photo</h3>
          <p className="small muted" style={{ margin: 0 }}>Chest-up, facing the camera, in the tudung you usually wear. Or use a sample model.</p>
          <div className="picker" role="group" aria-label="Sample models">
            {MODELS.map((m) => (
              <button key={m.id} aria-pressed={modelId === m.id && !upload} onClick={() => { setModelId(m.id); onUpload(null); setModelId(m.id); }}>
                <img src={m.photo} alt={`${m.name}, ${m.note}`} />
              </button>
            ))}
          </div>
          <label className="upload">
            <input type="file" accept="image/jpeg,image/png" onChange={(e) => onUpload(e.target.files?.[0] ?? null)} />
            {uploadUrl ? <img src={uploadUrl} alt="Your photo" style={{ width: 48, height: 64, objectFit: "cover", borderRadius: 6 }} /> : <span aria-hidden style={{ fontSize: 22 }}>＋</span>}
            <span className="small">{upload ? upload.name : "Use my own photo"}</span>
          </label>
          {upload && !live && <div className="alert info small">Live try-on is off right now, so your own photo can&rsquo;t be rendered. Sample models show real YouCam renders.</div>}
          <p className="small muted" style={{ margin: 0 }}>Your photo is sent only to YouCam to make the try-on. The tudung check runs on this device.</p>
          <button className="btn" onClick={run} disabled={busy || !parsed || !(canDemo || canLive)}>
            {busy ? "Working…" : !canDemo && canLive ? "Try it on (2 YouCam units)" : "Try it on"}
          </button>
        </div>
      </section>

      <section className="stack">
        {steps.length > 0 && <div className="panel"><h3>What Sopan is doing</h3><Trace steps={steps} /></div>}
        {error && <div className="alert bad">{error}</div>}
        {result && (
          <div className="panel stack">
            <div className={`seal-wrap ${blocked && !showOverlay ? "blocked" : ""}`} style={{ maxWidth: 520 }}>
              <img src={shownUrl} alt={showOverlay ? "Check overlay: red is hair, green is head covering, gold box is the area checked" : "Try-on result"} style={{ borderRadius: 18, width: "100%" }} />
              {blocked && !showOverlay && <div className="why">Hidden: hair is showing in this render</div>}
              {!showUnmasked && <Seal verdict={result.integrity.verdict} />}
            </div>
            <p style={{ margin: 0 }}>{verdictText(result.integrity)}</p>
            {(blocked || result.integrity.verdict === "skin_exposed") && parsed && parsed.coverage.suggestions.length > 0 && <p className="small">{parsed.coverage.suggestions[0]}.</p>}
            <div className="row">
              <label className="toggle"><input type="checkbox" checked={showOverlay} onChange={(e) => { setShowOverlay(e.target.checked); setShowUnmasked(false); }} /> Show what was checked</label>
              {result.mode === "demo" && listing.id && hasUnmasked(listing.id) && (
                <label className="toggle"><input type="checkbox" checked={showUnmasked} onChange={(e) => { setShowUnmasked(e.target.checked); setShowOverlay(false); }} /> Compare: without Sopan&rsquo;s head-masking</label>
              )}
            </div>
            {showUnmasked && <p className="small muted">Same shopper and garment, sent to the engine without hiding the seller model&rsquo;s head. In the study the engine changed the shopper&rsquo;s tudung in 10 of 16 renders like this, often copying the model&rsquo;s.</p>}
            <p className="label-honest">Visual preview made with YouCam AI. It shows style and colour, not fit, size or how sheer the fabric is. {result.seconds ? `Rendered in ${result.seconds} s, ${result.units} units.` : "Demo render, no units spent."}</p>
          </div>
        )}
        {result && !blocked && shades && (
          <div className="panel stack">
            <h3>Tudung shades against your skin tone</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Skin colour <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 4, background: shades.skin, verticalAlign: "middle", border: "1px solid #0002" }} /> {shades.skin}, {shades.source}.
              Contrast is measured as CIEDE2000 colour difference. Tap a shade to preview it on your tudung.
            </p>
            <div className="shades">
              {shades.ranked.map((s) => (
                <button key={s.name} className="shade" aria-pressed={shadePreview?.name === s.name} onClick={() => previewShade(s)}>
                  <div className="swatch" style={{ background: s.hex }} />
                  <strong>{s.name}</strong>
                  <div className="muted">{s.band === "blends" ? "Blends in" : `${s.band[0].toUpperCase()}${s.band.slice(1)} contrast`}</div>
                </button>
              ))}
            </div>
            <div className="row">
              {shadePreview && <button className="btn small secondary" onClick={() => setShadePreview(null)}>Show original tudung</button>}
              {live && <button className="btn small secondary" onClick={measure}>Measure skin colour with YouCam (20 units)</button>}
            </div>
            <p className="small muted" style={{ margin: 0 }}>Shade previews are a recolour of your tudung made on this device, not a new YouCam render.</p>
          </div>
        )}
        {!steps.length && (
          <div className="panel">
            <h3>How the check works</h3>
            <p className="small">Generative try-on was built for uncovered hair. Sopan hides the seller model&rsquo;s head before the render so her tudung isn&rsquo;t copied onto you, then checks the result: is your tudung still yours, and is any hair or extra skin showing?</p>
          </div>
        )}
      </section>
    </div>
  );
}
