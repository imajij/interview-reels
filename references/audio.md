# Audio for event-recorded interviews

Trade-show and conference audio is the hard case: a loud room, one mic, speakers at different distances.

## Diagnose before processing

Measure the source, the render, and the gap between speech and silence:

```bash
# level of a window
ffmpeg -ss T -t D -i f.mp4 -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
# quietest 0.4s window ≈ the noise floor
```

Healthy speech sits near −14 dB mean with the floor 30+ dB below. If speech and room tone are within a few dB of each other, that is the problem — no amount of gain fixes it, because gain lifts both.

Check whether the channels are identical (`pan=mono|c0=0.5*c0-0.5*c1` ≈ silence means dual mono) before suspecting phase issues.

## Voice Isolation

Resolve's Voice Isolation is the tool that actually works on room noise.

- 70–80% is the useful range. It lifted one reel's speech-to-noise from ~0 dB to ~30 dB.
- Higher is not better: at 90% it thins the voice, and it starts stripping **off-mic speakers** — if a guest is away from the mic, strong isolation can remove them along with the room.
- It does **not** survive nesting. Apply it to the nested clip in the outer timeline.

## Levels between speakers

Measure per phrase, grouped by speaker, using the caption word timings you already have. Compare medians:

- Speakers should land within ~3 dB of each other.
- Flag any line more than ~6 dB below its reel's median — that's the one the user will complain about.
- Compare against the raw source before blaming processing. If the source line is loud and the render is quiet, look for stray per-clip gain first.

## When one speaker is loud and another quiet

Ordered by how much damage they do:

1. **Per-clip gain** on the quiet segments only. No artefacts, keeps the noise floor where it is. Try this first.
2. **Peak-only compression** (threshold ≈ −18 dB, ratio ~6) to tame laughs and shouted words, then modest gain. Lifts the floor by only the gain amount.
3. **Broadband compression** with heavy makeup. Effective on speech but drags the room up with it — one measured attempt raised the noise floor from −44 dB to −18 dB, which sounds like static. Use only as a last resort and measure the floor afterwards.

The Dialogue Leveler is worth trying but measured weak here, and it does nothing on a nested clip.

## Delivery

- Keep peaks at or below about −1 dBFS **before** AAC; the encoder overshoots and a −1.0 dB master can land at 0.0 in the MP4.
- Match the loudness of the client's existing posts (around −14 LUFS is typical for social).
- Encode: `libx264 -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -movflags +faststart`.

## Cut clicks

Hard cuts between loud passages can click. Do **not** use Resolve's `SetFades` — it costs ~15 dB of level and clearing it doesn't restore it. Cut in a natural pause, or handle it in the delivery encode.
