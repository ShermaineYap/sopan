# Devpost submission — Sopan

**Tagline (≤ 200 chars):** See it on you, tudung and all. A YouCam-powered try-on agent that keeps a hijab-wearing shopper's own tudung, checks every render for hair or skin, and reads listings for coverage.

**Track:** eCommerce VTO (also uses Skin AI: Facial Color Tones Analyzer)

**Built with:** YouCam API (AI Clothes Virtual Try-On cloth-v4, AI Facial Color Tones Analyzer), Next.js, TypeScript, MediaPipe Tasks Vision, Gemini (optional), Vercel

**Links:** Live app: https://sopan-steel.vercel.app · Repo: https://github.com/ShermaineYap/sopan · Video: https://youtu.be/1kWHEAjbwOw

**Judges' quick path:** open the live app → **Try on** → pick a sample model → *Try it on*. Sample models on demo listings use stored real YouCam renders (no units spent), and the tudung check runs live in your browser. Then switch to *Lace Sleeveless Party Dress* to see the coverage gate and a "Skin showing" result. To test a fully live render, upload your own chest-up photo (2 units).

---

## Inspiration

Virtual try-on reached Malaysia in 2026: Google's Try On in Search (June) and ChatGPT's (October). Both assume uncovered hair; Google's own guidance asks for fitted clothing and visible hands. Meanwhile Malaysia is 61% Muslim, modest fashion is sold mostly through social and live commerce (about 32% of Southeast Asian platform GMV in 2025), and TikTok Shop's SEA GMV doubled to $45.6B. Shopee and Lazada only offer beauty AR, not apparel try-on.

A hijab-wearing shopper in Aiuta's research put the gap in one line: *"with my headscarf, the look can be totally different."* We wanted to find out whether YouCam's try-on could close it, and measure what breaks.

## What we found first (the study that shaped the product)

We ran 60 YouCam tasks on four hijab-wearing models (roughly Fitzpatrick III–VI) before writing any app code:

- With a worn abaya as the reference, **hair was never exposed (0/24)**, but the engine copied the seller model's tudung onto the shopper: the shopper's own tudung survived in only **6 of 16** renders.
- `upper_body` swapped the tudung in **7 of 8** renders.
- A sleeveless dress **removed the hijab in 5 of 12** renders.
- Scarf VTO generates a new full-body scene instead of changing a tudung, so we dropped it.

The fix came from that data: **paint out the reference model's head before upload**. Shopper's own tudung kept: **16 of 16**.

## What it does

**For shoppers** (mobile web, from a seller's link):
1. **Reads the listing** in English or BM (*lengan panjang*, *labuh*, *tak jarang*, *jarang*) and checks it against the shopper's coverage profile before rendering. Every attribute shows the phrase it came from.
2. **Hides the seller model's head** in the garment photo, on the device.
3. **Renders** with YouCam cloth-v4, choosing `full_body` or `auto` from the study results.
4. **Checks the result on the device** and stamps a seal: *Tudung kept*, *Tudung changed*, *Skin showing* or *Hair showing*. Renders with hair showing are hidden, and a layering suggestion (inner, manset lengan) is shown instead. "Show what was checked" overlays the segmentation.
5. **Tudung shades:** skin colour from YouCam Facial Color Tones (or an on-device estimate), CIEDE2000 contrast against 12 common tudung shades, and an instant recolour of the shopper's own tudung in the result.

**For sellers:** paste a Shopee, TikTok Shop or Instagram listing plus one worn-outfit photo, and get the coverage read-out, the prepared reference, renders on three hijab-wearing models with a tudung check on each, downloads, and a "try it on me" link for the caption or live stream.

## How we built it

- **YouCam API, server-side only:** `POST /s2s/v2.0/file` (pre-signed PUT) → `POST /s2s/v2.0/task/cloth-v4` → poll `GET …/{task_id}`; `task/skin-tone-analysis` for skin colour. A same-origin image proxy lets the browser analyse result pixels.
- **On-device vision:** MediaPipe `selfie_multiclass_256x256` (hair / face / body skin / clothes) for head masking, the integrity check (head-covering overlap, CIEDE2000 colour shift, new hair, added body skin) and tudung recolouring.
- **Agent:** Gemini with a fixed JSON schema (optional) or a deterministic EN/BM rule parser, then deterministic coverage rules and a render plan whose choices cite the study.
- **Unit safety:** a unit ledger with a reserve floor, a per-device daily limit, and stored real renders for sample models, so judges can explore all week.
- Next.js 14 + TypeScript on Vercel; unit tests for the parser and CIEDE2000 (validated against Sharma et al.'s reference pair).

## Results (measured)

| | |
|---|---|
| Tudung preserved, reference head masked vs not | **16/16 vs 6/16** |
| Hair exposure caught by the integrity check | **5/5, 0 false alarms** (36 hand-graded renders) |
| Tudung changes caught | 11/18, 0 false alarms |
| Render time / cost | median **11.7 s**, **2 units** per look; skin colour 20 units |
| On-device check time | under 1 s in the browser |

## Challenges

- The engine's habit of transferring the reference model's headwear wasn't documented; we only found it by testing.
- Tight braids barely register as "hair" to the segmenter, so we also treat a collapsed head-covering overlap (IoU < 0.45) as "covering lost".
- Result URLs aren't CORS-enabled, so we added an allow-listed image proxy.

## Accomplishments

The core decision in the product, masking the reference model's head, came from a measured failure and fixed it completely on our test set. Every claim in the app comes with a number we can show.

## What we learned

Inclusive try-on is less about the model and more about checking: knowing when a render is wrong for this person, and saying so.

## Honest limits

- Previews show style and colour, not fit, size or sheerness (sheerness comes from listing text only).
- Thresholds were set on a small set; the next step is a held-out set with more skin tones and tudung styles.
- Coverage profiles are a shopper's choice, not a religious ruling.
- Photos go to YouCam to make the render and are not stored by Sopan.

## What's next

A Shopee / TikTok Shop seller integration; restoring the shopper's own tudung pixels when the engine changes it; a larger study with more tudung styles; and exposing Sopan's checks over MCP so shopping agents can call them.

## Sources

- Google Try On in Malaysia: https://blog.google/intl/en-my/products/explore-get-answers/you-can-now-virtually-try-on-clothes-and-shoes-with-this-new-ai-shopping-feature/
- Google Shopping photo guidance: https://support.google.com/googleshopping/answer/16253678?hl=en
- Malaysia 61% Muslim, modest fashion: https://salaamgateway.com/story/islamic-modest-fashion-gaining-share-in-malaysias-5-billion-clothing-market
- Live/video commerce ≈32% of SEA GMV: https://e27.co/content-commerce-isnt-a-trend-its-seas-new-retail-engine-20260421/
- TikTok Shop SEA $45.6B: https://technode.global/2026/02/11/tiktoks-southeast-asia-doubles-gmv-year-on-year-to-45-6b-in-2025/
- Shopee/Lazada beauty-only AR: https://www.glamar.io/blog/top-virtual-try-on-platforms-for-southeast-asian-retailers-in-2026
- Shopper quote: https://www.aiuta.com/blog/one-size-doesnt-fit-all
