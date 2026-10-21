---
name: interview-reels
description: Build vertical (9:16) short-form reels from landscape interview footage in DaVinci Resolve — transcribe, pull the strongest quotes, reframe to vertical, burn karaoke captions, write intro and outro cards that sell the content and ask for a DM, generate b-roll featuring the interviewee themselves, lay a soft ducked music bed, then verify and export. Use this whenever someone wants to cut interview or talking-head footage into Instagram Reels / TikTok / YouTube Shorts, repurpose long interviews into clips, add word-by-word or karaoke captions, reframe 16:9 to 9:16, add a music bed under an edit, or generate personalised b-roll for an interview — even if they only say "make reels from this footage", "cut this interview up", or name DaVinci Resolve without saying what format they want.
---

# Vertical interview reels

Turn long landscape interview footage into short vertical reels that hold attention: a hook in the first two seconds, word-by-word captions, cuts between speakers, and b-roll that matches what is being said.

The work is mostly mechanical once the quotes are chosen. What separates a finished reel from a broken one is **verification** — most defects here are invisible in a contact sheet and obvious to a viewer. Measure, don't eyeball.

## Inputs you need

- Interview footage (any frame rate; 4K landscape is typical)
- DaVinci Resolve running, reachable over its scripting API
- Target: 1080×1920, 30 fps unless the client's existing reels differ
- A **licensed music track** for the bed — ask the client for their file or library
- **Confirmation that interviewees consented** to their likeness being used for
  generated b-roll, since that is the default here

If the client already has reels in this style, study one first: pull its cut points
(`ffmpeg -vf "select='gt(scene,0.3)',metadata=print"`), crop a caption frame to read
the exact type treatment, and match that rather than inventing a look.

## Pipeline

### 1. Inventory and transcribe

Separate interview masters from b-roll by duration — anything under ~20s is usually b-roll. Import the masters and transcribe them:

```python
clip.TranscribeAudio(True)          # True = speaker detection
t = clip.GetTranscription()         # {'language', 'segments':[{start,end,words:[{start,end,text}]}]}
```

`TranscribeAudio` blocks longer than the scripting bridge's timeout. The call still completes inside Resolve — fire it, let the call time out, then poll `GetTranscription()` until segments appear.

Timecodes are `HH:MM:SS:FF` at the **clip's** frame rate; subtract the clip's `Start TC` to get seconds from clip start. Dump everything to JSON once and work from that file — re-querying Resolve for transcripts is slow and you will do it many times.

### 2. Choose the cut

The reel has to carry a whole story on its own — a viewer who knows nothing about the
person should reach the end understanding who they are, what problem they have, and
what changes it. A pile of strong quotes is not a story; if a segment doesn't move
that arc forward, cut it.

Order it the way the conversation actually goes:

1. **Introduction** — the host's "who are you and what do you do", then the answer.
   This is the opening. Viewers need to know who is talking before they care what he
   says, and the intro card has already given them the hook.
2. **The problem** — the host's question that sets it up, then the answer describing
   what's hard today.
3. **The turn** — what would fix it, in their words.
4. **The payoff** — the line with the most weight. It lands hardest at the end, once
   the viewer understands the person and the problem well enough for it to mean
   something.
5. **The closer** — a sentence that resolves it.

Do not open on the payoff quote pulled from the middle of the interview. It reads as
a fragment with no one attached to it, and it spends the best line before the viewer
cares. The intro card is what stops the scroll; the interview is what holds it.

**Keep the question with its answer.** If you use someone answering, the question that
prompted it goes in too. Dropping it leaves the viewer watching a reply to nothing — an
answer like "honestly, that's why we stopped hiring for it" only lands once
you've heard "how do you handle the paperwork today?".
Cutting to the person asking is also what makes it read as an interview rather than a
monologue. Trim a long question to the part that sets up the answer, but never drop it.

**Cut on complete thoughts, at both ends of every segment.** Word-level timings make it
easy to land a cut in the middle of a sentence, and the viewer hears it as the video
breaking rather than as an edit. Two places this bites hardest:

- *The closer.* Run it to the end of the last full sentence, not to a filler like
  "you know" and never to a dangling fragment. Read the words you are keeping out
  loud — if the last thing you say leaves your voice hanging, the cut is early.
- *A question.* Let it finish its question mark. Trimming a question one second short
  is the single most common cause of "it cuts off abruptly" feedback.

Print the transcript for a few seconds either side of each in- and out-point before you
commit to them; the cost of extending a cut is a second of runtime, and the cost of
getting it wrong is the viewer noticing the edit.

When extending the closer pushes you past the length cap, pay for it by trimming a
*setup*, not the payoff. Hosts often stack two or three questions in a row — keep the
last, self-contained one and drop the preamble. That buys several seconds and costs
the viewer nothing.

Cut on word boundaries using word-level timings, and check length as you go: clients
usually cap at 45–60s.

### 3. Build the timeline

Place segments with **video and audio together** — omit `mediaType` entirely:

```python
mp.AppendToTimeline([{ "mediaPoolItem": src, "startFrame": a, "endFrame": b, "recordFrame": pos }])
```

Passing `"mediaType": 1` places video only and you get a **silent reel**. Use `mediaType` only for b-roll, where muting the generated audio is what you want.

`endFrame` is **exclusive**. Place sequentially and read back the real end frame for the next `recordFrame` rather than computing it, so frame-rate conform rounding can't accumulate gaps.

Mixed frame rates conform correctly (23.976 source on a 30 fps timeline keeps real-time duration). Note that Resolve's *playback* frame rate is a separate project setting that the API cannot change; if timeline playback sounds wrong but renders are correct, that's the cause — send the user to Project Settings.

### 4. Reframe to vertical

This is where reels most often break. See `references/framing.md` for the arithmetic and `scripts/framing.js` to compute values.

The rule that matters: **16:9 footage in a 9:16 timeline needs zoom ≥ 3.16× to fill the frame.** Below that you get black bars, and pan then exposes more black. Frame each shot on whoever is speaking.

Sources already vertical (2160×3840) and 720×1280 b-roll both want **zoom 1.0** — Resolve fits clips to the frame, so zooming b-roll "to fill" actually crops it.

**Check orientation by decoding a frame, not by reading the stream dimensions.** A clip
shot on a rotated camera carries a rotation flag: `ffprobe` reports its stream as
3840×2160 while it decodes to 2160×3840, and Resolve shows it upright. Treat that clip
as landscape and you apply a 3.2× zoom to footage that already fits — a crop so tight
the subject's head leaves the frame, in a batch where every other clip is genuinely
landscape and looks fine.

    ffprobe -v error -select_streams v:0 -show_entries stream_side_data=rotation ...
    # or just decode one frame and measure it:
    ffmpeg -ss 5 -i in.mp4 -frames:v 1 out.png   # then check out.png's dimensions

Resolve's own `GetClipProperty("Resolution")` reports the rotated size, so it is a
reliable second opinion. Check every source in a batch, not the first one.

### 5. Captions

Word-level timings from the transcription drive karaoke captions: the whole phrase in white, the word being spoken highlighted. Give each speaker their own highlight colour (e.g. host yellow, guests blue) — viewers track who's talking without thinking about it.

**Do not use Fusion Text+ through the scripting API.** It can be fully configured — font, size, colour, correct node graph, `Alpha1=1` — and still render nothing. Bake captions instead as a transparent ProRes 4444 clip on its own track: render each caption state to a PNG with alpha, then concat with per-state durations. `scripts/build_caption_states.js` and `scripts/render_captions.js` do this.

Fix transcription errors in the caption data before rendering; speech recognition mangles domain terms ("track and race" for track and trace, "game voicing" for invoicing). Read the phrases out and correct them — nonsense on screen is worse than no caption.

Correct only what you can actually verify. Where a stretch is garbled beyond recovery
("then we just pull the like for when it gets"), do not invent plausible words and put
them in someone's mouth — route the cut around it instead. A sentence you skip costs a
few seconds; a sentence you guess at is a quote the person never said.

Expect a fragment at every segment boundary. A cut rarely lands in silence, so the
first word of the *next* speaker's sentence bleeds a few frames past the out-point and
becomes a one-word caption sitting on top of the following one — two captions on
screen, one of them nonsense. `build_caption_states.js` drops these by detecting the
overlap; if you write your own, check that no two captions are ever on screen at once.

Group into 3–4 word phrases, breaking on sentence punctuation and speaker changes.

### 6. Title, branding, cards

The cards are not decoration; they do a job at each end of the reel.

**Intro card (~2s)** — state the crux of *this* reel, not the brand. A viewer decides
in a second whether to keep watching, and "NORTHWIND MEDIA" tells them nothing. Write
it from the quotes you actually chose: name the person's situation and the tension.
Derive it after picking the cut, never before.

Weak: `NORTHWIND MEDIA — LIVE FROM THE SHOW`
Strong: `SHE RUNS A 12-PERSON BAKERY / AND DOES THE BOOKS AT MIDNIGHT`
Strong: `A 6-CHAIR SALON OWNER ON WHY / SMALL SHOPS WON'T TOUCH AI`

Keep the brand as a small chip under it — the content line is the headline, the brand
is the footnote.

**To lengthen a card, hold its LAST frame, not its first.** Cards often fade or animate
in, so frame 0 is the one frame with no text on it — freeze that and you ship a blank
card. `tpad=stop_mode=clone` extends a clip by cloning its final frame, which keeps
the animation and adds the read time. Never assume a card you did not author this
session is static; step through it before you touch it.

**Give it long enough to actually read.** A three-line crux card is eight to twelve
words of heavy display caps, and one second is not enough to take that in — the card
is gone before the viewer has finished the second line, so the thing you wrote to stop
the scroll does nothing. Two seconds is about right for three lines; a one-line card
can be shorter. Time it against the words you wrote rather than reusing a fixed
number, and if you find yourself trimming the card to fit a duration, trim the reel
instead. The seconds come out of the interview, not the hook.

**Do not also burn a hook title over the opening seconds of the interview.** The intro
card already carried that message; repeating it means the viewer reads the same
sentence twice while someone is talking underneath, and it buries the face they just
arrived for. One hook, on the card. A burned-in title over the footage only makes
sense when there is no intro card at all.

What stays over the footage the whole way through is small: the **brand chip**
top-left and a **progress bar** along the bottom.

**Outro card (~2.5s)** — close the loop with the problem the reel just showed, then
ask for the reply. Mirror the specific pain from the interview so it reads as a
response rather than an advert, and make the action explicit.

Pattern: `[problem the reel just showed] / WE FIX THAT / DM US`
Example: `MISSED CALLS = MISSED BOOKINGS / WE BUILD THE AI THAT ANSWERS / DM US`

Keep the site or handle beneath it. One action only — "DM us" and "visit the site"
and "follow" in one card gets none of them done.

When adding cards, wrap the finished reel: build a new timeline of
`intro + nested reel + outro`. The inner timeline stays editable and caption sync is
preserved. **Voice Isolation and other clip processing do not survive nesting** —
reapply on the nested clip itself.

Render card graphics as alpha ProRes the same way as captions; `scripts/render_cards.js`
draws them. Apply darkening to the background, not to the card layer, or scaling the
card reveals its edges.

### 7. B-roll

**B-roll means moving footage.** A still with a slow push-in reads as a slideshow the
moment it sits beside live interview footage. Generators quietly hand you an image when
the prompt is ambiguous — ask for "a 9:16 vertical VIDEO clip, not a still image" and
check the frame count on what you download. One frame means try again.

**Every reel needs b-roll.** A reel that stays on one face for fifty seconds looks
like a clip of a conversation rather than something made. Plan 3–4 cutaways of about
3 seconds, one per idea in the story. Two rules carry the quality:

- **Match the shot to the line.** A clerk filing forms under "compliance and paperwork" earns
  its place; generic office stock under everything does not.
- **Never reuse a clip**, within a reel or across the set. Repeats make a batch look
  cheap. Track what you've used and check for duplicates programmatically.

**Land each cutaway either exactly on an interview cut or well clear of one.** If a
cutaway ends a few frames *before* the cut underneath it, the viewer gets a sliver of
the interview shot — too short to register as a shot, long enough to register as a
stutter. It reads as a freeze frame, and it is invisible in a contact sheet because
the frames themselves are all different. Aim for the cut exactly, or leave at least
half a second of the interview shot visible before it. After placing, check every
cutaway against the cut list:

```python
cuts = [0.0] + [s["tlEnd"] for s in spec["segments"]]
for it in tl.GetItemListInTrack("video", 2):
    b = (it.GetEnd() - st) / 30
    gap = min(abs(c - b) for c in cuts)
    assert gap < 0.05 or gap >= 0.5, f"{it.GetName()} ends {gap:.2f}s from a cut"
```

**Read back the realised length instead of trusting the frame count you asked for.**
`startFrame`/`endFrame` are in the *source* clip's frames, so a 24 fps cutaway on a
30 fps timeline occupies 1.25× the frames you passed — and clips that Resolve has
already conformed do not. The two behaviours coexist in one project, so the only
reliable method is to place the clip, read `GetEnd()`, and re-place it if it landed
wrong. That is exactly how slivers appear when you think you cut to the frame.

**Default to b-roll featuring the interviewee themselves.** A generic stock mechanic
under a shop owner talking about his shop is filler; that owner in his own shop is the story. It
is the single biggest quality difference available here, so treat personalised b-roll
as the normal case and stock as the fallback.

How to do it:

1. Pull a clean, front-facing reference frame of the person from the interview —
   good light, no motion blur, face unobstructed. Crop generously around them and
   export around 1024px.
2. Upload it to the generator as a reference image (in Google Flow: the **+**
   ingredients control, then *Upload media* → select it → *Add to prompt*).
3. Prompt for a scene true to what they actually said, and pin the likeness
   explicitly: *"Using the person in the reference photo, keep their face, hair and
   clothing exactly the same. A calm documentary shot of them [doing the thing they
   described]. Realistic, cinematic, 9:16 vertical. No text on screen."*
4. Check the result against the reference before using it. If it does not read as
   them, regenerate rather than settle.

Generators group successive runs in one session as versions of a single clip, which
makes them awkward to retrieve — the group shows only its newest version in the grid.

The asset picker is the fragile part of this. Uploading a reference with a filename
that already exists leaves several entries with that name, most of them hidden, so
clicking by filename either hits a hidden element or errors as ambiguous. Give each
reference a unique filename per run (`ref_speaker-a_<timestamp>.jpg`), and after
generating, confirm what you downloaded is the clip you meant — it is easy to pull an
older version of the group instead. Budget for this failing a few times; if it keeps
failing, finish the reel without the shot rather than stalling the whole edit.

**Consent is a prerequisite, not a formality.** These are synthetic shots of a real
person, cut beside genuine footage of that same person, and a viewer cannot tell
which is which. Confirm the subject agreed to it. Keep the scenes mundane and true to
what they said — never put words, claims or situations on someone that they did not
describe. Recommend a small "AI-generated" mark on those shots and let the client
decide; say so plainly rather than leaving it unmentioned.

Where the client has their own footage of the event or the person, prefer it — real
beats generated for anything about the event itself.

### 8. Audio

Trade-show and event audio is noisy. See `references/audio.md`. In short:

- Resolve's **Voice Isolation** is the main tool; 70–80% is usually right for a noisy
  room with two people talking over each other. **Back it off to 30–40% for a close-mic
  monologue.** A piece to camera has long pauses between sentences, and at 75% the
  isolation gates those pauses to near-silence — measured on one reel, gaps fell from
  −24 dB to −53 dB while speech stayed put. Speech level looks perfect and the reel
  pumps between every sentence. Compare the *gaps* before and after, not just speech:
  6–10 dB of reduction is noise removal, 25 dB is gating.
- Compare speakers: their median levels should land within ~3 dB, and no line should be far below its reel's median.
- Peaks must sit at or below about −1 dBFS *before* AAC encoding, because AAC overshoots.
- **Deliver 48 kHz.** Resolve renders at the project's timeline sample rate, and a
  project set to 96 kHz produces 96 kHz AAC in the MP4 — legal, unusual, and a
  portability risk. `add_music_bed.sh` now forces `-ar 48000`; check the delivered
  file rather than assuming.
- **Never use `SetFades` to declick.** It costs about 15 dB of level and setting the fades back to zero does not restore it.

### 9. Music bed

A soft instrumental bed under the whole reel lifts it — silence between sentences
reads as dead air on a phone, and music covers the room tone that Voice Isolation
leaves behind. It has to sit *under* the voice, never beside it.

- **Use a track the client is licensed for.** Ask for their file or library. Do not
  pull music off a streaming service or lift the audio from someone else's reel.
- **If they have no library, generate the bed** with `scripts/make_bed.js` rather than
  hunting for a "royalty free" download. It writes a loopable instrumental in a chosen
  key, already rolled off above 3 kHz and dipped through the presence band so it sits
  under a voice. Three reasons this beats a found track: the licence is unambiguous,
  there is no Content ID claim waiting on a track a thousand other people also
  uploaded, and stock music is written to be *listened to* — melodic hooks and builds
  are exactly what you do not want competing with the talking. Free-music sites also
  close down; one this skill relied on went offline between runs.

  Tell the client what the bed is, and offer to swap in their own track.
- **Level:** speech sits near −14 dB; put the bed roughly 18–25 dB below that, around
  −32 to −38 dB mean on its own. If you can hum along on first listen, it is too loud.
- **Duck it under speech** rather than riding one flat level — a compressor keyed off
  the dialogue, or a simple automation dip during each spoken segment. The bed should
  come up in the gaps, under the cards, and in the last beat of the outro.
- **Choose by energy, not genre:** steady, no vocals, no strong melodic hook that
  competes with the talking. Anything with lyrics fights the captions.
- **Fade in over the intro card and out across the outro**, so it frames the reel
  instead of stopping dead.
- **Loop or trim to length**, then confirm the mixed peak still sits at or below
  about −1 dBFS — adding a bed after you set levels is an easy way to start clipping.

Normalise the bed before setting its level. Offsetting from the track's own level means
a quiet file lands inaudible and a hot one overpowers the voice — normalise to a fixed
reference, then place it relative to the measured speech level.

Confirm it is actually there: measure the quietest windows before and after. If the gaps
don't lift by at least ~3 dB the bed is inaudible, whatever the settings say.
`scripts/add_music_bed.sh` does the ducking and reports speech drift, gap lift and peak.

Place it on its own audio track so the client can mute or swap it without touching
the dialogue. Verify afterwards that speech levels did not move: the speaker medians
from the audio step should be unchanged within about a dB.

### 10. Verify before you call it done

Run `scripts/verify_reel.sh <file.mp4>`. It checks, for every sampled frame and the whole audio track:

| Check | Why |
|---|---|
| Black borders | Catches under-zoomed reframing that a contact sheet hides |
| Peak level | Catches clipping introduced by gain or AAC |
| Speaker levels | Catches one speaker being inaudible |
| Duration and frame count | Catches conform and trim errors |
| Speech level unchanged after the bed | Catches music pushing dialogue down or peaks up |

**After a change that touches every reel, check every reel.** Sampling three of six is
how a blank card ships: the five you built the same way are all fine, and the odd one
out is the one built differently. The cost of checking the whole set is one contact
sheet.

Also pull frames from *interview* moments, not just b-roll and cards — a contact sheet sampled every 2s can miss an entire broken segment.

When you report, give the measured numbers. "Peaks −0.8 dB, no black borders in 214 sampled frames" is verification; "looks good" is not.

## Guardrails

Each of these comes from a real defect. Detail in `references/resolve-api.md`.

1. Omit `mediaType` when placing interview segments, or the reel is silent.
2. `endFrame` is exclusive — read back actual positions instead of computing them.
3. 16:9 → 9:16 needs zoom ≥ 3.16×; verify with `cropdetect`, not by eye.
4. B-roll and vertical sources use zoom 1.0 — Resolve already fits them.
5. Never `SetFades` on audio; it silently costs ~15 dB.
6. Voice Isolation and clip processing do not survive nesting — reapply on the nested clip.
7. Fusion Text+ via the API renders nothing; bake captions as alpha ProRes.
8. Correct transcription errors before captions are rendered.
9. One b-roll clip per line, never reused anywhere in the set.
10. B-roll features the interviewee by default, generated from a reference frame of
    them — with consent confirmed, scenes true to what they said, and the option of
    an "AI-generated" mark raised with the client.
11. The intro card states the crux of this reel, not the brand; write it from the
    quotes you chose. Do not also burn a hook title over the footage — one hook, on
    the card.
12. Open on the introduction and tell the story in order; the payoff line goes near
    the end, not the front. The reel must stand alone as a whole story.
13. Every reel gets 3–4 b-roll cutaways, and they are video — never stills with a
    push-in. Check `nb_frames` on anything a generator returns.
14. Never use an answer without the question that prompted it, and let the question
    reach its question mark — a question trimmed a second short is the usual cause of
    "it cuts off abruptly".
15. Every cut lands on a complete thought, the closer most of all. Extend to the end of
    the sentence; pay for the seconds by trimming a stacked question's preamble.
16. A cutaway ends exactly on an interview cut or at least 0.5s clear of one. A shorter
    sliver of the shot underneath reads as a freeze frame and a contact sheet will not
    show it. Read back `GetEnd()` rather than trusting the frame count you passed.
17. The intro card is on screen long enough to read - time it against the words you
    wrote, not a fixed duration. Roughly 2s for three lines.
18. The outro card mirrors the problem the reel just showed and asks for exactly one
    action (DM us).
19. The music bed is licensed, normalised before levelling, sits 18–25 dB under speech
    and ducks beneath it. Prove it is audible: the quiet gaps should lift ~3 dB or more.
20. Check for stray per-clip gain before blaming your processing chain; a single clip
    left at the wrong level looks exactly like a pipeline bug.
21. Never invent words to patch a garbled transcript - route the cut around it.
22. No two captions on screen at once; drop the fragment a segment boundary leaves.
23. Read back every placed clip length. Frame-rate conform is not uniform even
    between identical clips in one project.
24. Extend a card by cloning its last frame. Freezing frame 0 of a card that fades in
    ships a blank card.
25. When a change touches every reel, verify every reel, not a sample.
26. Decode a frame to learn a clip's orientation. A rotation flag makes a vertical
    clip report landscape dimensions, and zooming it crops the subject out of frame.
27. Voice Isolation at 70-80% gates a close-mic monologue's pauses. Use 30-40% there,
    and judge it by how far the gaps moved, not the speech level.
28. Deliver 48 kHz audio; the render inherits the project's sample rate.
29. Verify with measurements and report the numbers.
30. One sound effect per moment, and no effect used twice in a piece. A single whoosh
    recycled at every transition is what makes an edit sound like a template. Keep the
    opening card's sound fixed across a series so the brand has one recognisable stab,
    then give every later beat its own file. Prove it: count distinct filenames in the
    cue sheet, and render the SFX bus *alone* to confirm each cue is actually audible -
    a cue buried under the dialogue measures 0 dB difference in the full mix.
31. Pick sound effects by measurement, not by filename. Score every candidate on how
    far it sits clear of the 1-4 kHz speech band, and risers on how much they build
    from head to tail; a file called "riser" that measures -6 dB head-to-tail is a
    plateau and will vanish under the voice. A riser peaks at its *end*, so cue it one
    full length before the moment it serves.
32. Give each sound ONE fixed meaning and let it repeat whenever that meaning does.
    A sound design reads as a language, not as decoration: a riser means a question is
    being asked, a glass hit means bad news, a chime means something good landed, a pop
    means one item in a list, a ping means pay attention. Six or seven sounds used
    consistently beat twenty used once each. This is the one place the no-repeat rule
    does not apply - a mark that changes every time stops being a mark.
33. Match the sound to the sentiment of the sentence, not to the cut. Read the line:
    if it is a question, build into the question mark; if it is the bad news, break
    something; if it is the payoff, resolve it. Cue the sentiment on the *word* that
    carries it, which you get from the word timings, not from where the picture changes.
34. One sound at a time. Two effects ringing together is mud, and it happens by
    accident: a 2.5s body sound is still decaying when the next mark lands two seconds
    later. Keep bodies to 1.2-1.6s, space cues against those lengths, and make the mixer
    fade any cue that would run into the next one rather than trusting yourself to
    notice. Count the overlapping pairs before and after - on one pass it was 13 of 33.
35. Check every sound effect's ONSET, not just its duration. A downloaded file often
    carries 50-250 ms of silence before the sound actually starts, so the cue fires late
    by that much - six of thirteen in one library did, the worst by 271 ms, which is
    seven frames. Detect the first sample within 20 dB of the file's peak and re-cut the
    head so the onset sits ~12 ms in. A cue time is a promise that the sound fires then;
    a silent head breaks it silently. Risers are the exception - they are meant to peak
    at their end.
36. A mark placed under a word is a mark nobody hears. Put short effects in the gaps
    between phrases, which you get from the word timings - landing one in a 0.4s pause
    makes it 15 dB clearer than the same effect at the same gain half a second earlier.
37. When the script recommends a product by name, show that product's own logo, and mark
    its arrival with its own sound. A name typeset in your house font is a caption; the
    real mark is a recommendation. Fetch it from the product's own site - the favicon or
    web-clip PNG is usually the clean mark on transparency.
38. Harvest sound effects from a source whose licence permits commercial use without
    attribution - Pixabay's Content Licence does, Freesound's varies per clip. Pull
    several candidates per role, score them all, and keep the score table in the
    project so the next person can see why each one won.

39. **When a generator keeps failing a stage, read its error before rewriting the prompt.**
    Veo killed five of eight generations with "Audio generation failed"; the error named a
    **Return silent videos** setting, and turning it on cut the failures sharply. It does not
    end them: on the next reel one prompt still failed twice with the toggle on, then passed
    once the *action* changed (a driver handing over cash -> signing a receipt). So: toggle on
    first, always; if one prompt keeps failing, change what happens in the shot, not the
    audio wording. And the toggle lives in the browser session - check it is still on when
    a new session starts.

40. **Measure an effect on the band it occupies, not on broadband RMS.**
    Nine of twenty-five cues looked inaudible when scored on total energy, because the voice
    owns that number. Scored above 4 kHz — where the bright effects actually live — twenty-
    three lifted the mix by 3.5 to 60 dB. The two that still looked weak were the sub and the
    low drama hit, which carry nothing up there by design, and both lifted broadband by 7.5
    and 14.6 dB. One yardstick for every sound will condemn sounds that are working and pass
    sounds that are not. Pick the measure from what the sound is made of.

41. **A cap on a sound's length is a separate control from the overlap guard.**
    The guard asks "does this run into the NEXT cue" - so a 1.9s hit followed by six seconds
    of silence passes it, then rings on underneath the next line of dialogue. Give the cue
    sheet its own length column and cap by ear-reason, not only by collision.

42. **A talking face in b-roll under a voiceover reads as the wrong voice.**
    Veo gave a broker who nods for four seconds and then starts speaking. Nothing in any
    automated check flags it - no freeze, good luma, correct subject. Watch for mouths, and
    end the window before one opens.

43. **Keep helper scripts in the project's `specs/`, not the scratchpad.** The scratchpad
    is wiped between sessions; every measurement helper had to be rewritten the next day.
    Anything you will run twice belongs next to the cue sheet it checks.

44. **`add_music_bed.sh`'s "gaps barely changed" check is blind on an SFX-dense reel.**
    It samples the floor on whole seconds of the pre-bed mix; with ~36 cues nearly every
    sample lands on an effect, so the "before" floor reads -44 dB instead of -66 and the
    bed looks inaudible. Before raising the bed, measure it in windows that hold neither
    speech nor an effect (envelope gaps minus cue spans). There it lifted 13-18 dB - fine.

45. **Two b-roll plates that follow each other must butt exactly: next.in == prev.out + 1.**
    A one-to-four-frame gap shows the talking head for an instant between two cutaways - a
    flash nobody asked for, and invisible on a contact sheet. Measure the frames either side
    of every join against the bare avatar pass. (Caught on two reels: 1 frame and 4 frames.)
    And check `add_music_bed.sh` warnings with `bedcheck.js`, which finds speech- and SFX-free
    gaps itself, before touching the bed level (see 44).

46. **Check sentence STARTS against the envelope, not just the median word gap.**
    On one take whisper's word timings looked genuine (median gap 0.27s) but the first word
    of every sentence sat on a round segment boundary - x.00 / x.50 - up to 0.45s before it
    was spoken. Round sentence starts are the tell. Move each to the first sustained onset in
    the audio (`fixstarts.js`) before pinning captions, graphics or cues to it.

47. **Never let the overlap guard fade a riser.** A riser peaks at its end, so even a 0.02s
    trim moves the 0.35s fade onto the crest. If the guard reports a riser "faded early",
    move the NEXT cue later inside its quiet window until the riser plays whole.




## Scripts

All verified working on this machine. They are node and bash because CLI `python3`
here is blocked by an unagreed Xcode licence — Resolve's own scripting bridge
still runs python fine.

- `scripts/framing.js` — zoom/pan/tilt for reframing. `--check` flags a setup that
  would expose black *before* you render it.
- `scripts/build_caption_states.js` — transcript + cut spec to caption states, with
  phrase grouping and speaker colours. Prints the opening lines so you can catch
  recognition errors before anything is rendered.
- `scripts/render_captions.js` — states to PNGs with alpha. Run under a
  browser-backed node runtime for canvas and system fonts.
- `scripts/captions_to_prores.sh` — timed PNGs to an alpha ProRes clip for a video track.
- `scripts/render_cards.js` — hook title, brand chip, crux intro card and DM outro card
  as PNGs with alpha. Pass each reel's text as a JSON file in `CARDS_CONFIG`
  (same keys as the `DEFAULTS` block at the top; anything omitted keeps the placeholder).
- `scripts/make_bed.js` - generates a loopable instrumental bed already shaped to sit
  under speech. Use when the client has no licensed library of their own.
- `scripts/add_music_bed.sh` — side-chain a licensed bed under the dialogue and report
  whether speech level drifted or peaks went hot.
- `scripts/mix_sfx.js` - cue sheet -> SFX bus under a finished mix. One sound at a time: a cue
  still ringing when the next lands is faded 60 ms before it; an optional 4th column caps a
  sound's length (guardrails 30, 34, 41, 47).
- `scripts/envelope.js` - the REAL quiet windows in a voice track from its audio envelope;
  whisper's token end times are padded (guardrails 36, 46).
- `scripts/fixstarts.js` - moves each sentence's first word to its true onset when whisper has
  snapped it to a round segment boundary (guardrail 46).
- `scripts/bedcheck.js` - measures the music bed only where it is the sole new sound (no speech,
  no SFX), because `add_music_bed.sh`'s floor check is blind on SFX-dense reels (guardrail 44).
- `scripts/verify_reel.sh` — the verification harness. Run before declaring done.

## References

- `references/resolve-api.md` — scripting API behaviour and traps
- `references/framing.md` — reframing arithmetic
- `references/audio.md` — noise, levels, isolation