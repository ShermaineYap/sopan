import Link from "next/link";

export const metadata = { title: "How Sopan works" };

export default function How() {
  return (
    <article className="stack" style={{ maxWidth: 760, paddingBottom: 24 }}>
      <h1 style={{ fontSize: "clamp(1.8rem,5vw,2.6rem)" }}>How Sopan works</h1>
      <p>Sopan is a small agent wrapped around YouCam&rsquo;s generative try-on. Every step either costs nothing or tells you what it costs, and every result carries a check you can inspect.</p>

      <h2>The pipeline</h2>
      <ol>
        <li><strong>Read the listing.</strong> Gemini with a fixed output schema when configured, otherwise an English/BM rule parser. Each attribute keeps the phrase it came from, so you can see why Sopan decided &ldquo;long sleeve&rdquo;.</li>
        <li><strong>Check coverage.</strong> Deterministic rules against the shopper&rsquo;s profile (long sleeves, ankle length, not sheer). Failing pieces get a layering suggestion instead of a silent render.</li>
        <li><strong>Plan the render.</strong> Garment category chosen from study results: <code>full_body</code> for dresses, abaya and kurung; <code>auto</code> for tops, because <code>upper_body</code> swapped the tudung in 7 of 8 test renders.</li>
        <li><strong>Prepare the reference.</strong> On the device, MediaPipe finds the seller model&rsquo;s face and paints out her head before upload.</li>
        <li><strong>Render.</strong> YouCam AI Clothes Virtual Try-On (<code>cloth-v4</code>), 2 units, about 12 seconds.</li>
        <li><strong>Check the result.</strong> On the device, the shopper photo and the render are segmented into hair, face, body skin and clothing. Sopan compares the head covering (overlap and CIEDE2000 colour shift), looks for new hair, and measures added body skin.</li>
        <li><strong>Tudung shades.</strong> Skin colour from YouCam AI Facial Color Tones (20 units) or an on-device estimate, contrast measured against common tudung shades, previewed by recolouring the shopper&rsquo;s own tudung.</li>
      </ol>

      <h2>What we measured</h2>
      <p>Four hijab-wearing models (Fitzpatrick roughly III to VI), two abaya references worn by hijab-wearing models, one sleeveless lace dress. 60 renders on 23 October 2026, 2 units each, median 11.7 s.</p>
      <table className="small" style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr style={{ textAlign: "left" }}><th>Condition</th><th>Renders</th><th>Result</th></tr></thead>
        <tbody>
          <tr><td>Abaya reference, engine as is</td><td>16</td><td>Shopper&rsquo;s tudung kept in 6; hair never exposed</td></tr>
          <tr><td>Abaya reference, model&rsquo;s head masked by Sopan</td><td>16</td><td>Shopper&rsquo;s tudung kept in 16 (small collar artefact on one reference)</td></tr>
          <tr><td>Sleeveless dress</td><td>12</td><td>Hijab removed, hair showing in 5</td></tr>
          <tr><td>upper_body category</td><td>8 (abaya)</td><td>Tudung swapped in 7</td></tr>
          <tr><td>YouCam Scarf VTO on the shopper</td><td>8</td><td>Generates a new full-body scene; not usable to change a tudung</td></tr>
        </tbody>
      </table>
      <p>Integrity check against hand grading of 36 renders: hair-exposed caught 5 of 5 with 0 false alarms; tudung changes caught 11 of 18 with 0 false alarms. It misses subtle same-tone overlays, such as a light grey drape over a white tudung. Thresholds were set on this same small set, so treat the numbers as a first measurement, not a benchmark.</p>

      <h2>What Sopan doesn&rsquo;t do</h2>
      <p>It doesn&rsquo;t judge fit or size, and it can&rsquo;t see sheerness in a generated image; that comes from the listing text only. Coverage profiles are a shopper&rsquo;s choice, not a religious ruling. Photos are sent to YouCam to make the try-on and are not stored by Sopan.</p>

      <h2 id="credits">Credits</h2>
      <ul className="small">
        <li>Try-on and colour analysis: YouCam API by Perfect Corp.</li>
        <li>On-device segmentation: Google MediaPipe (selfie multiclass segmenter).</li>
        <li>Model and garment photos (free licences): Unsplash photos by contributors for &ldquo;woman in brown hijab and blue denim jacket&rdquo;, &ldquo;woman in blue hijab smiling&rdquo;, &ldquo;woman wearing white dress and white hijab scarf&rdquo;, &ldquo;hanged white and gray floral sleeveless dress&rdquo;; Pexels photos &ldquo;elegant portrait of woman in a hijab outdoors&rdquo; (Abiola Femi), &ldquo;portrait of a woman in traditional dress&rdquo;, &ldquo;elegant woman in traditional black and white attire&rdquo; (Black Wolf). Names in the app are placeholders.</li>
      </ul>
      <p><Link href="/try">Try it on</Link></p>
    </article>
  );
}
