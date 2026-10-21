# DaVinci Resolve scripting API — behaviour and traps

Everything here was observed and measured, not read from docs.

## Placing clips

```python
mp.AppendToTimeline([{
  "mediaPoolItem": clip,
  "startFrame": a,          # source frames, at the CLIP's frame rate
  "endFrame": b,            # EXCLUSIVE
  "recordFrame": pos,       # absolute timeline frame (add timeline.GetStartFrame())
  "trackIndex": 1,          # optional
  "mediaType": 1,           # 1=video only, 2=audio only, OMIT for both
}])
```

- **Omit `mediaType`** for interview segments — passing `1` places video only and the reel comes out silent.
- `endFrame` is exclusive: `endFrame - startFrame` frames are used. Using `b-1` leaves one-frame gaps at every cut.
- Place sequentially and read back `max(x.GetEnd() for x in items)` for the next `recordFrame`. Frame-rate conform means placed duration ≠ requested source frames.
- **Stills** ignore `startFrame`/`endFrame` and take the project's default still duration. To control duration, pre-render the still as a video clip of known length.

## Frame rate

A 23.976 fps source on a 30 fps timeline conforms correctly: 250 source frames (10.43s) becomes 312 timeline frames (10.4s). Real time is preserved; don't "fix" it.

**But conform is not uniform across a project.** Two 24 fps b-roll clips in the same media pool, placed onto the same 30 fps timeline the same way, came back with different ratios: one stretched by 1.25× as expected, the other took the frame count literally. (The literal one had had its clip attributes touched earlier in the session.) So never compute a cutaway's out-point — place it, read `GetEnd()`, and if it landed wrong, delete and re-place with the ratio you just measured. A cutaway that lands a few frames short of the cut underneath it produces a visible stutter (see the b-roll section of SKILL.md).

`timelinePlaybackFrameRate` is a separate project setting. `SetSetting` refuses it even on an empty project — it is UI-only. If timeline playback sounds pitched or stuttery while renders are clean, this mismatch is why.

## Transcription

```python
clip.TranscribeAudio(True)        # speaker detection; blocks past the bridge timeout
t = clip.GetTranscription()       # poll until ['segments'] is populated
folder.TranscribeAudio(True)      # batch, same blocking behaviour
```

Returns segment- and word-level entries with `HH:MM:SS:FF` timecodes at the clip's frame rate. Convert with the clip's `Start TC` as the origin. Speaker detection merges speakers within a segment, so don't trust a segment's speaker for every word inside it — assign speakers from your own cut instead.

## Timeline items

```python
it.SetProperty("ZoomX", 3.6); it.SetProperty("ZoomY", 3.6)
it.SetProperty("Pan", -400.0); it.SetProperty("Tilt", -70.0)
it.SetProperty("AudioVolume", 0.0)          # dB
it.GetProperty()                            # dict of everything
```

- `it.GetProperty("Volume")` returns `False`; the audio gain key is `AudioVolume`.
- **`SetFades({"FadeIn": n, "FadeOut": n})` is not frames in any useful sense.** Small values cost roughly 15 dB of overall level, and setting them back to 0 does not restore it. Don't use it for declicking. If cuts click, fix at the cut point or in delivery.
- Check `AudioVolume` on every clip before diagnosing a level problem. A single clip at an odd value (e.g. −6.43 dB among clips at +15) looks exactly like a broken processing chain.

## Voice Isolation and Dialogue Leveler

```python
tl.SetVoiceIsolationState(trackIndex, {"isEnabled": True, "amount": 75})
item.SetVoiceIsolationState({"isEnabled": True, "amount": 75})
item.SetProperty("AudioDialogueLevelerEnabled", True)
```

- Track-level Voice Isolation **does not render through a nested timeline** (measured: noise floor −51 dB → −24 dB). Apply it to the nested clip item in the outer timeline.
- The Dialogue Leveler applied to a nested clip did nothing measurable; on clips inside their own timeline it works but is weak against a loud/quiet spread.
- Read settings back after writing. Some values silently fail to apply.

## Fusion

`AddFusionComp()`, `comp.AddTool(...)`, `comp.BezierSpline()` and `tool.Input = spline` all work, and camera moves via a `Transform` render correctly — but:

- **Text+ renders nothing.** Correct graph, font, size, `Alpha1=1`, MediaOut connected — still empty frames. Bake text externally instead.
- Comps sometimes silently don't apply to a clip: the spline evaluates correctly when queried (`GetInput("Size", 18)` returns the right value) yet the render is unchanged, and `DeleteFusionCompByName` returns `False`. If a move doesn't show up in a render, bake it into the media rather than fighting it.
- `tool.Size = comp.BezierSpline()` then `spline.SetKeyFrames({0:{1:v0}, n:{1:v1}})` gives smooth eased keyframes.
- Inputs with dots (`Transform3DOp.Translate.Z`) need `SetInput`/attribute assignment, not subscripting.

## Rendering

```python
proj.SetRenderSettings({"TargetDir":..., "CustomName":..., "FormatWidth":1080, "FormatHeight":1920,
                        "MarkIn": S, "MarkOut": S+n-1, "ExportVideo": True, "ExportAudio": True})
job = proj.AddRenderJob()
proj.StartRendering(job)            # or StartRendering([jobs]) to batch
proj.GetRenderJobStatus(job)        # {'JobStatus': 'Complete', ...}
```

- `ExportVideo: False` makes `StartRendering` return `False`.
- Poll `GetRenderJobStatus`, not the file — the file appears before it's finished, and checking size/mtime races the encoder.
- `DeleteAllRenderJobs()` and preset loading can exceed the bridge timeout on heavy projects; call them alone.

## Sandbox

The scripting bridge blocks `import os` etc. Use the unsafe/full-access variant when you need to write JSON to disk — dumping transcripts and cut specs to files is much faster than re-querying.


## Project export / import (.drp)

`ProjectManager.ExportProject(name, path)` then `ImportProject(path, newName)` is the
only way to copy a project under a new name — there is no `SaveProjectAs`.

**Clip processing does not survive the round trip.** Voice Isolation came back disabled
on every timeline of an exported-and-reimported project, silently: timelines, clip
lengths, transforms, bins and media links were all intact, so nothing looked wrong. If
you render from a re-imported project, re-apply Voice Isolation first and verify with
`GetVoiceIsolationState()` — and measure the gaps in the output, because a reel that
lost its isolation still has correct speech levels.

Rendered sample rate comes from the project's `timelineSampleRate`, not from the
source clips. Two projects holding the same timelines can deliver different rates.
