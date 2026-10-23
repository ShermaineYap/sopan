import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>See it on you, tudung and all.</h1>
          <p className="lede">
            Virtual try-on was built for uncovered hair. Sopan makes it work for hijab-wearing shoppers: it keeps your own tudung in the picture,
            checks every render for hair or skin that shouldn&rsquo;t be there, and tells you before you buy whether a piece meets your coverage.
          </p>
          <div className="row">
            <Link className="btn" href="/try">Try on an abaya</Link>
            <Link className="btn secondary" href="/seller">I sell modest fashion</Link>
          </div>
        </div>
        <div className="pair">
          <figure><img src="/demo/models/aisyah.jpg" alt="Shopper in a teal tudung, before try-on" /><figcaption>Aisyah&rsquo;s photo</figcaption></figure>
          <figure className="seal-wrap">
            <img src="/demo/results/abaya-sulam/aisyah.jpg" alt="The same shopper wearing the embroidered abaya, teal tudung unchanged" />
            <div className="seal" role="img" aria-label="Integrity check: tudung kept"><span>Tudung<span className="big">kept</span></span></div>
            <figcaption>In the Abaya Sulam, made with YouCam</figcaption>
          </figure>
        </div>
      </section>

      <section>
        <h2>What Sopan checks</h2>
        <p className="muted">Measured on 60 YouCam renders of hijab-wearing models (details on <Link href="/how">How it works</Link>).</p>
        <div className="checks">
          <div className="check">
            <div className="num">Before</div>
            <h3>Coverage, from the listing</h3>
            <p className="small">Reads the seller&rsquo;s words in English or BM (lengan panjang, labuh, jarang) and flags sleeveless, short or sheer pieces before you spend time on them.</p>
          </div>
          <div className="check">
            <div className="num">16 / 16</div>
            <h3>Your tudung stays yours</h3>
            <p className="small">The engine tends to copy the seller model&rsquo;s tudung onto you. Hiding her head first kept the shopper&rsquo;s own tudung in all 16 test renders, up from 6.</p>
          </div>
          <div className="check">
            <div className="num">5 / 5</div>
            <h3>Hair or skin showing</h3>
            <p className="small">A sleeveless dress stripped the hijab in 5 of 12 renders. Sopan&rsquo;s on-device check caught all 5 with no false alarms, and hides those images.</p>
          </div>
        </div>
      </section>

      <section className="panel stack" style={{ marginBottom: 12 }}>
        <h2>For live-commerce sellers</h2>
        <p>Paste a Shopee, TikTok Shop or Instagram listing and one photo of the outfit. Sopan renders it on three hijab-wearing models, checks every tudung, and gives you a &ldquo;try it on me&rdquo; link for your caption or live stream.</p>
        <div><Link className="btn secondary" href="/seller">Make a listing pack</Link></div>
      </section>
    </>
  );
}
