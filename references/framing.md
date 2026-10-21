# Reframing 16:9 to 9:16

## The arithmetic

Resolve fits a clip to the timeline frame by its larger dimension. A 3840×2160 source in a 1080×1920 timeline fits by **width**, so at zoom 1.0 it is 1080×607.5 — a letterboxed strip.

At zoom `Z`:

```
displayed size    = 1080·Z  ×  607.5·Z
fills the height  when 607.5·Z ≥ 1920   →   Z ≥ 3.1605
visible source    = 3840/Z wide, 2160·(1920/(607.5·Z)) tall
scale factor      = Z · 0.28125          (timeline px per source px)
crop centre x     = 1920 − Pan/(Z·0.28125)
crop centre y     = 1080 − Tilt/(Z·0.28125)
```

To centre on a subject at source x `cx`:

```
Pan = (1920 − cx) · Z · 0.28125
```

**Use Z ≥ 3.2**, not exactly 3.16 — the extra margin gives room to pan without exposing an edge.

## Edge limits

With visible width `w = 3840/Z`, the crop centre must stay within `[w/2, 3840 − w/2]` or black appears at that side. Same for the vertical with the visible height. Tilt range shrinks fast as zoom drops: at Z=3.6 you have ±133 px of tilt; at Z=3.4 only ±72.

## Finding the subject

Grab a frame, overlay a grid, and read off where the person sits:

```bash
ffmpeg -ss <t> -i src.MP4 -frames:v 1 -vf "scale=480:-1,drawgrid=w=48:h=270:t=1:c=yellow@0.5" -y f.png
```

Each grid column is 1/10 of frame width → multiply by 384 for source x at 4K. Do this at several moments; interviewers drift and the camera moves. Frame on whoever is speaking in that segment.

## Other sources

| Source | Zoom | Why |
|---|---|---|
| 3840×2160 landscape | ≥ 3.2 | needs to fill height |
| 2160×3840 vertical | 1.0 | already matches the frame |
| 720×1280 b-roll | 1.0 | Resolve fits it; more crops and softens it |

Zooming 720p b-roll to 1.5 crops away a third of the shot and upscales what's left — it looks tighter and softer for no reason.

## Verify

Never judge framing from a contact sheet; thumbnails hide thin black edges. Sample frames and measure:

```bash
ffmpeg -i reel.mp4 -vf "fps=4,cropdetect=limit=20:round=2:reset=1,metadata=print:file=-" -an -f null - 2>/dev/null
```

Any frame reporting `w < 1070` or `h < 1905` has a border. Exclude intro/outro cards, which are legitimately dark. A dark shirt against a dark background can trip `cropdetect` — confirm a flagged frame by eye before chasing it.
