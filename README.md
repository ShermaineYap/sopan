# Sopan — see it on you, tudung and all

Sopan is a hijab-aware virtual try-on for Malaysia's modest-fashion sellers and their shoppers, built on the **YouCam API**.

Generative try-on was designed around uncovered hair. In our tests, YouCam's engine often copied the seller model's tudung onto the shopper, and a sleeveless dress stripped the hijab entirely in 5 of 12 renders. Sopan wraps the engine in a small agent that:

1. **Reads the listing** (English or Bahasa Melayu, e.g. *lengan panjang*, *labuh*, *tak jarang*) and checks it against the shopper's coverage profile **before** spending API units.
2. **Hides the seller model's head** in the garment reference, on the device, so the engine can't copy her tudung. This raised tudung preservation from **6/16 to 16/16** renders.
3. **Renders** with YouCam AI Clothes Virtual Try-On (`cloth-v4`), choosing the garment category from measured results.
4. **Checks the result on the device**: hair showing, tudung changed, extra arm/neck skin. Hair exposure was caught in **5 of 5** cases with **0 false alarms** across 36 hand-graded renders. Renders with hair showing are hidden.
5. **Tudung shades**: skin colour from YouCam AI Facial Color Tones (or an on-device estimate), CIEDE2000 contrast against common tudung shades, and an instant recolour preview of the shopper's own tudung.

Sellers get a listing pack on three hijab-wearing models plus a "try it on me" link for their Shopee / TikTok Shop / Instagram caption or live stream.

**Live demo:** https://sopan-steel.vercel.app · **Video:** https://youtu.be/1kWHEAjbwOw

## YouCam APIs used

| API | Endpoint | Where | Units |
|---|---|---|---|
| AI Clothes Virtual Try-On V4 | `POST /s2s/v2.0/task/cloth-v4` | every try-on and listing-pack render | 2 |
| AI Facial Color Tones Analyzer | `POST /s2s/v2.0/task/skin-tone-analysis` | "Measure skin colour with YouCam" | 20 |
| File API | `POST /s2s/v2.0/file` + pre-signed PUT | uploads | 0 |
| Credits / feature cost | `GET /s2s/v1.0/client/credit` | unit reserve guard | 0 |

We also tested AI Scarf VTO (`task/scarf`). It generates a new full-body scene rather than changing a tudung, so it isn't used. See [docs/STUDY.md](docs/STUDY.md).

## How it's built

- **Next.js 14 (App Router, TypeScript)**. API routes hold the YouCam key server-side (`lib/youcam.ts`); the browser never sees it.
- **Async task flow**: `/api/tryon` uploads and creates the task, the browser polls `/api/task`, and result images are fetched through `/api/image` (allow-listed hosts) so the on-device check can read their pixels.
- **On-device vision** (`lib/vision.ts`): MediaPipe `selfie_multiclass_256x256` (hair / face / body skin / clothes) for head masking, the integrity check, tudung recolour and skin estimate.
- **Agent** (`lib/agent.ts`, `lib/coverage.ts`): Gemini with a fixed JSON schema when `GEMINI_API_KEY` is set, otherwise an EN/BM rule parser. Every attribute records the phrase it came from. Coverage verdict and render plan are deterministic.
- **Unit safety**: a reserve (`SOPAN_RESERVE_UNITS`, default 150) and a per-device daily limit. Sample models on demo listings use stored real YouCam renders, so judges can explore without spending units; uploading your own photo runs live.

## Run it

```bash
npm install
cp .env.example .env.local   # add YOUCAM_API_KEY (and optionally GEMINI_API_KEY)
npm run dev                  # http://localhost:3000
npm test                     # parser + CIEDE2000 tests (Node 22+)
```

Without `YOUCAM_API_KEY` the app runs in demo mode with stored renders.

## Honest limits

- Previews show style and colour, not fit, size or sheerness (sheerness comes only from listing text).
- Integrity thresholds were set on a small set (36 renders); treat the numbers as a first measurement.
- Coverage profiles are a shopper preference, not a religious ruling.
- Shopper photos are sent to YouCam to make the try-on and are not stored by Sopan.

## Credits

YouCam API by Perfect Corp · MediaPipe by Google · demo photos from Unsplash and Pexels (see `/how#credits` in the app).

MIT License.
