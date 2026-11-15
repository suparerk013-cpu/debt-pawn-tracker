# CLAUDE.md — Multitrack Mix Practice App (working name: TBD)

## What we are building
A web app (PWA) for practicing audio mixing. The user imports multitrack
audio files (stems), plays them in sync, and mixes them with real in-app
DSP: channel strip (low cut, 4-band EQ, gate, compressor), faders, pan,
mute/solo, buses/sends, FX racks, master bus, and practice tools
(A-B loop, speed change, scenes, export WAV).
Runs fully in the browser. No server, no upload to the internet.

## About the user
- Goes by NOT, Thai-speaking, based in Ubon Ratchathani. Basic HTML/CSS only.
- ALWAYS reply in Thai (keep code, file names and technical terms in English).
- Explain simply, in small steps. Do one phase at a time. After each step tell
  the user exactly how to run and what they should see/hear.
- Ask before big or irreversible changes (deleting files, changing structure).

## HARD RULES (legal)
- This is an ORIGINAL project. Do NOT copy code, UI, assets, names or text from:
  - the GitHub repo "multiplatform-mixer / Mix Practice Studio" (not ours, no license)
  - Mixing Station (Behringer/Midas remote app)
  - any Waves / Cubase / TikTok-listed plugin
- Use only general, public algorithms (RBJ biquad cookbook, standard compressor
  and gate math, Freeverb/Dattorro-style reverb ideas, etc.), written from scratch.
- Do not add GPL/AGPL dependencies. Prefer zero dependencies.
- Own name, own look. Do not use names like "Mixing Station" or "Mix Practice Studio".

## Tech decisions (keep it simple for a beginner)
- Plain HTML + CSS + JavaScript (ES modules). NO framework, NO build step at first.
- Run locally with a tiny static server (AudioWorklet needs localhost/https):
  `python -m http.server 8080` or `npx serve`.
- Web Audio API for the graph; AudioWorklet for custom DSP (gate, compressor,
  saturator, de-esser, etc.). Built-in nodes (BiquadFilter, Delay, Convolver,
  StereoPanner, Gain) where they are good enough.
- Store projects locally with IndexedDB. Make it an installable PWA late (phase 6).
- Initialize git. Small commits, clear messages.
- Target: desktop Chrome first, then Android Chrome, then iOS Safari.

## Folder layout (proposed)
```
index.html
css/        styles
js/
  app.js          UI wiring
  engine/         audio graph, transport, channel strip, buses
  dsp/            AudioWorklet processors (gate, comp, fx)
  ui/             faders, knobs, meters, EQ graph
  storage/        IndexedDB
docs/PLAN.md      the phase plan (source of truth)
docs/UI.md        screen-by-screen UI spec (dark theme, tokens, 4 screens)
```

## Limits
- Maximum 32 tracks per project (decided by the user). Real use is about 20; 32 is a safety ceiling.
- Create channel strips only for files actually loaded. The ceiling of 32 is not a number of strips to always show or allocate.
- Show 16 channels per layer/page on desktop (Ch 1-16, Ch 17-32); on phones scroll sideways.
- Check memory when loading: warn before the decoded audio gets too large for the device.

## UI rules
- Wide screens (>= 1024 px) use the one-screen workflow in docs/UI.md (workspace for the selected channel
  above the fader bank, sends column on the right). Below 1024 px use the phone layout.
- App start: open directly into the full-screen Mixer (no landing page). With no files, show ghost strips
  plus one "Add your tracks" card. See docs/UI.md "App start".
- Follow docs/UI.md for layout, colors and fonts. Mobile-first touch targets (>= 44px).
- Transport stays slim (play + seek slider). No A-B loop.
- Level meters always show dB scale numbers beside them.

## Audio engine rules
- One shared AudioContext. One transport (play/pause/seek) driving all tracks
  with the same start time so tracks stay sample-aligned.
- Decode with `decodeAudioData` (it resamples to the context rate, so mixed
  44.1k/48k stems stay in sync). Decode one file at a time with a progress bar.
- Show a clear error for files the browser cannot decode (name + reason).
  Optional later fallback: ffmpeg.wasm loaded only on demand.
- Memory: warn when total decoded audio gets large; mono stems should stay mono.
- Never block the audio thread; no allocation inside `process()`.
- Metering: peak (and later RMS) with smooth ballistics; show clip indicator.
- Signal flow per channel:
  input trim -> low cut -> EQ(4 band) -> gate -> compressor -> fader -> pan
  -> (sends to buses/FX) -> main bus (EQ + compressor + limiter) -> output.

## Parameter specs (our own definitions)
- Gate: threshold, range, attack, hold, release, optional key filter.
- Compressor: threshold, ratio, attack, hold, release, knee, makeup gain,
  mix (parallel), peak/RMS detection, auto-release, optional key filter,
  gain-reduction meter.
- EQ: low cut + 4 bands (low shelf, 2 bells, high shelf), freq/gain/Q, plus a
  live frequency-response graph.
- Sends: per-send level and tap point (pre/post fader).
- FX racks (first 2): reverb (plate/room/hall style), delay (tempo-aware).
- Later core FX: saturator, de-esser, chorus, limiter, dynamic EQ, pitch/formant.

## Quality bar
- Every DSP block gets a test: feed a known signal (sine/noise/click), check
  the result numerically (e.g. compressor ratio, filter gain at frequency).
- No audible clicks when moving faders/knobs (smooth parameter changes).
- Tell the user honestly what is not finished or not tested on a phone.
