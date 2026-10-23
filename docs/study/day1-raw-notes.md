# Sopan — Day-1 hijab feasibility test (23 Oct 2026)

**Setup:** YouCam `cloth-v4` and `scarf` APIs. 4 hijab-wearing shoppers (Fitzpatrick ~III–VI) and 3 garments: 2 worn abaya references (model in hijab) + 1 sleeveless dress product shot. 3 garment categories (`auto`, `full_body`, `upper_body`), plus 8 direct Scarf VTO runs. Test images are Unsplash/Pexels licensed (see SOURCES.md).
**Spend:** 44 tasks, 84 units (1,040 → 956). Real costs: cloth-v4 2, scarf 2, shoes 2, bag 2, Facial Color Tones 20.
**Reliability:** 42/44 succeeded. The 2 failures were Scarf VTO `error_no_face` on a strongly tilted head. Latency was 11.4–18.9 s per task (median ~11.7 s).

## Results (graded by eye from the contact sheets)

| Garment type | Renders | Hair exposed | Shopper's own tudung kept as-is |
|---|---|---|---|
| Modest, worn reference (abaya + hijab), auto/full_body | 16 | **0** | ~6 / 16 |
| Modest, worn reference, upper_body | 8 | **0** | ~1 / 8 |
| Sleeveless dress, auto/full_body | 8 | **3** (hijab removed, hair/braids visible) | 5 / 8 |
| Sleeveless dress, upper_body | 4 | **2** | 2 / 4 |

Scarf VTO, run directly on the shopper photo, does **not** swap the tudung. It generates a whole new full-body street photo with a new outfit and scene, and drapes the scarf as a neck scarf. It is unusable for "change my tudung" and is dropped from the chain.

## What this means for the build

1. **Feasible.** Modest garments never exposed hair (0/24), at ~12 s and 2 units per look. Use `auto` or `full_body`; `upper_body` is worst at preserving the tudung.
2. **The engine copies the reference model's headwear.** That is useful in *seller mode* ("see the full styled look, tudung included"), but it breaks *"keep my own tudung"* mode.
3. **The Hijab Integrity Check is necessary, not decorative.** 5 of 12 sleeveless renders (~42%) removed the hijab. Sopan must detect this and either block the result, retry, or restore the head region. This is the headline demo moment and a measured stat for the write-up.
4. **"Keep my tudung" = restore step.** Segment the head/tudung region in the source image and composite it back onto the result (KeepMe-style detect → restore → re-verify), then re-check with IoU.
5. **Next cheap test (~16 units):** mask or crop the reference model's head before upload, to see if the engine stops copying her headwear. If it works, it is a zero-cost pre-processing fix.
6. **Coverage agent gate:** the agent should flag sleeveless or short-sleeve listings *before* spending units, as Sopan's coverage verdict (and the reason the integrity check exists).

## Files
- `sheet_cloth.jpg`: auto/full_body grid (rows = shoppers, columns = garment × mode)
- `sheet_upper.jpg`: upper_body grid
- `sheet_scarf.jpg`: Scarf VTO direct
- `outputs/*/results.csv`: per-task status, latency, units
