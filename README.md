# interview-reels

A Claude Code skill for cutting talking-head and interview footage into finished short-form
reels (Instagram Reels / TikTok / YouTube Shorts) with DaVinci Resolve, ffmpeg and whisper:
transcribe, pick the moments, reframe to 9:16, word-timed captions, motion graphics, b-roll,
a sound-design pass, a ducked music bed - then measure the result before calling it done.

Build vertical (9:16) short-form reels from landscape interview footage in DaVinci Resolve — transcribe, pull the strongest quotes, reframe to vertical, burn karaoke captions, write intro and outro cards that sell the content and ask for a DM, generate b-roll featuring the interviewee themselves, lay a soft ducked music bed, then verify and export. Use this whenever someone wants to cut interview or talking-head footage into Instagram Reels / TikTok / YouTube Shorts, repurpose long interviews into clips, add word-by-word or karaoke captions, reframe 16:9 to 9:16, add a music bed under an edit, or generate personalised b-roll for an interview — even if they only say "make reels from this footage", "cut this interview up", or name DaVinci Resolve without saying what format they want.

## Install

```sh
git clone git@github.com:imajij/interview-reels.git ~/.claude/skills/interview-reels
```

Claude Code picks the skill up from `~/.claude/skills/`. `SKILL.md` is the skill; everything
else is supporting material it points to.

## What's here

| path | what |
|---|---|
| `SKILL.md` | the pipeline, and the guardrails below in full - each with the failure that taught it |
| `scripts/` | renderers, the SFX mixer, the music-bed generator and mixer, measurement helpers |
| `references/` | Resolve scripting traps, reframing arithmetic, audio notes |
| `evals/evals.json` | test prompts with the assertions a good run must meet |

### Scripts
| script | does |
|---|---|
| `framing.js` | reframing arithmetic for 16:9 → 9:16 |
| `build_caption_states.js`, `render_captions.js`, `captions_to_prores.sh` | word-timed captions → alpha ProRes |
| `render_cards.js` | hook / intro / outro cards as alpha PNGs |
| `make_sfx.js` | a small, matched set of synthesised transition sounds |
| `mix_sfx.js` | cue sheet → SFX bus, one sound at a time, with a collision guard |
| `make_bed.js` | a loopable instrumental bed shaped to sit under speech (pick key + tempo) |
| `add_music_bed.sh` | sidechain the bed under the dialogue; reports drift and peaks |
| `bedcheck.js` | measure the bed only where it is the sole new sound |
| `envelope.js` | real quiet windows in a voice track |
| `fixstarts.js` | move sentence-initial words to their true onsets |
| `verify_reel.sh` | the pre-delivery check: borders, clipping, dead air |

## Guardrails (47)

Every one of these came from a real mistake on a real edit. The full text - what went wrong,
how it was measured and what to do instead - is in `SKILL.md`.

1. Omit `mediaType` when placing interview segments, or the reel is silent.
2. `endFrame` is exclusive — read back actual positions instead of computing them.
3. 16:9 → 9:16 needs zoom ≥ 3.16×; verify with `cropdetect`, not by eye.
4. B-roll and vertical sources use zoom 1.0 — Resolve already fits them.
5. Never `SetFades` on audio; it silently costs ~15 dB.
6. Voice Isolation and clip processing do not survive nesting — reapply on the nested clip.
7. Fusion Text+ via the API renders nothing; bake captions as alpha ProRes.
8. Correct transcription errors before captions are rendered.
9. One b-roll clip per line, never reused anywhere in the set.
10. B-roll features the interviewee by default, generated from a reference frame of them — with consent confirmed, scenes true to what they said, and the option of an…
11. The intro card states the crux of this reel, not the brand; write it from the quotes you chose.
12. Open on the introduction and tell the story in order; the payoff line goes near the end, not the front.
13. Every reel gets 3–4 b-roll cutaways, and they are video — never stills with a push-in.
14. Never use an answer without the question that prompted it, and let the question reach its question mark — a question trimmed a second short is the usual cause of "it…
15. Every cut lands on a complete thought, the closer most of all.
16. A cutaway ends exactly on an interview cut or at least 0.5s clear of one.
17. The intro card is on screen long enough to read - time it against the words you wrote, not a fixed duration.
18. The outro card mirrors the problem the reel just showed and asks for exactly one action (DM us).
19. The music bed is licensed, normalised before levelling, sits 18–25 dB under speech and ducks beneath it.
20. Check for stray per-clip gain before blaming your processing chain; a single clip left at the wrong level looks exactly like a pipeline bug.
21. Never invent words to patch a garbled transcript - route the cut around it.
22. No two captions on screen at once; drop the fragment a segment boundary leaves.
23. Read back every placed clip length.
24. Extend a card by cloning its last frame.
25. When a change touches every reel, verify every reel, not a sample.
26. Decode a frame to learn a clip's orientation.
27. Voice Isolation at 70-80% gates a close-mic monologue's pauses.
28. Deliver 48 kHz audio; the render inherits the project's sample rate.
29. Verify with measurements and report the numbers.
30. One sound effect per moment, and no effect used twice in a piece.
31. Pick sound effects by measurement, not by filename.
32. Give each sound ONE fixed meaning and let it repeat whenever that meaning does.
33. Match the sound to the sentiment of the sentence, not to the cut.
34. One sound at a time.
35. Check every sound effect's ONSET, not just its duration.
36. A mark placed under a word is a mark nobody hears.
37. When the script recommends a product by name, show that product's own logo, and mark its arrival with its own sound.
38. Harvest sound effects from a source whose licence permits commercial use without attribution - Pixabay's Content Licence does, Freesound's varies per clip.
39. When a generator keeps failing a stage, read its error before rewriting the prompt.
40. Measure an effect on the band it occupies, not on broadband RMS.
41. A cap on a sound's length is a separate control from the overlap guard.
42. A talking face in b-roll under a voiceover reads as the wrong voice.
43. Keep helper scripts in the project's `specs/`, not the scratchpad.
44. `add_music_bed.sh`'s "gaps barely changed" check is blind on an SFX-dense reel.
45. Two b-roll plates that follow each other must butt exactly: next.in == prev.out + 1.
46. Check sentence STARTS against the envelope, not just the median word gap.
47. Never let the overlap guard fade a riser.
