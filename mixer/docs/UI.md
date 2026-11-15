# UI.md — screen specs (own design, dark studio theme)

Visual reference: the design canvas made in chat (4 screens). Build to match
the structure below; exact pixels may vary.

## Theme tokens
- App bg #0f1115 · panel #171a20 · raised #1e222a · input well #12151a
- Border #232832 / #2a2f39 · text #e8ebf0 · secondary text #9aa3b2 / #8a93a3
- Accent amber #f2b04a · gate/teal #4fd1c5 · meter green #3fbf75, amber #f2b04a, red #ff6b5b
- Group colors: drums #ff8a5b, bass #6ea8ff, guitars #5bd6a6, keys #b58cff, vocals #ff7fb2
- Fonts: Space Grotesk (titles), Inter (UI), JetBrains Mono (numbers). Always touch targets >= 44px.
- No emoji, no fake phone status bar.

## App start (decided)
- The app opens straight into the full-screen Mixer. No landing page, no splash, no marketing screen.
  Full screen on phone/tablet/desktop (PWA display: fullscreen/standalone).
- First launch with no files: show the Mixer chrome (top bar, group overview, empty fader area with
  a few dimmed "ghost" strips) and ONE clear card in the middle: "Add your tracks" with
  [Choose files] -> opens the Import screens (3-4) as a full-screen sheet. So it never looks empty/boring.
- Once files are loaded, the ghost strips disappear: only real strips for loaded files are shown.
- Optional later: a built-in demo project made of synthetic stems (our own generated audio, no
  copyrighted music) so a first-time user can try the mixer immediately.

## Wide layout (>= 1024 px wide) — one-screen workflow (decided)
Same visual style as above; only the arrangement changes. Below 1024 px use the phone layout.
```
[ top bar: play + seek slider | Files | Speed | Scene | Export WAV            ]
[ group meter overview (layer buttons + per-group LED meters + toolbar)        ]
[ WORKSPACE of the SELECTED channel: Gate | EQ | Comp | Sends  (4 panels)      ][ SENDS COLUMN ]
[ FADER BANK: 16 strips per layer (Ch 1-16 / Ch 17-32)                         ][ bus/FX picker + Main ]
```
- Selected-channel model: tapping a strip name selects it (amber border); the whole workspace follows it.
  Tapping the EQ panel expands it to fill the workspace (big graph with live spectrum behind it).
- Strip tag row: group color + instrument icon guessed from the file name (kick, snare, bass, guitar,
  keys, vox, ...); the user can change it.
- Sends on faders: the right column lists buses/FX racks (Mix 1-4, FX 1-4). Picking one turns every
  strip fader into that channel's SEND level to that bus (fader knob changes color); picking "Main"
  returns to normal faders.
- FX Racks screen: 4 slots (start with Plate reverb + Stereo delay). Each slot shows: routing label
  (send bus or insert on a channel), On/Off, simple parameter knobs, L/R level meter, "None" if empty.
- Phone layout (< 1024 px): fader bank only (3-4 strips visible, swipe sideways); tapping a name opens
  the channel editor (Screen 2) as a full page; sends picker as a bottom sheet.
- Not now: DCA/mute groups, recording to SD, hardware mixer control.

## Screen 1 — Mixer (main)
Top bar (68px): logo + app name + project name | slim transport | Files, Speed, Scene, Export WAV.
- Slim transport = Play button + current time + a SEEK SLIDER + total time. Nothing else.
  NO A-B loop, no stop/rewind buttons, no big waveform strip.
- Group overview bar under the top bar: layer buttons on the left (e.g. "Ch 1-10", "FX + Buses"),
  one meter panel per group (Drums, Bass, Guitars, Keys, Vocals, FX, Main): one vertical LED bar per
  channel + amber peak-hold tick; the selected group has an amber border; toolbar icons on the right
  (meters, grid, FX, files, settings). Meters on/off in settings.
- Channel strips (108px wide), top to bottom:
  1. group color bar
  2. INPUT LED BAR (horizontal LED level) with SIG lamp (left) and CLIP lamp (right, red)
  3. name button (number + name) -> opens Screen 2
  4. mini EQ curve thumbnail
  5. GATE and COMP chips (lit when on) each with a tiny activity bar
  6. pan slider
  7. fader zone: dB SCALE NUMBERS on the left (0, -6, -12, -24, -48), stereo LED meter, fader
  8. dB readout of the fader
  9. M (mute, red when on) and S (solo, amber when on)
- MAIN strip on the right: same plus COMP/LIMIT chips and DIM/MONO buttons, scale numbers.
- Show only strips for loaded files (no empty placeholders). Capacity: up to 32 channels, shown as layers of 16 (Ch 1-16, Ch 17-32) on desktop; sideways scroll on phones.
- Dropped for now: layers editing UI, Spill. Keep the layer idea in data (layer = ordered channel list).

## Screen 2 — Channel editor (opens from a strip name)
- Header: Back, prev/next channel, channel name, A/B compare, Bypass all, Reset channel.
- Equalizer: log-frequency graph (20 Hz-20 kHz, +-18 dB), draggable nodes: low cut + 4 bands,
  optional live spectrum; band cells below (type, freq, gain, Q).
- Compressor: knobs Threshold, Ratio, Attack, Release, Knee, Makeup, Mix; transfer-curve graph;
  GR meter; toggles Peak/RMS, Auto release, Key filter, Compress/Expand.
- Gate: knobs Threshold, Range, Attack, Hold, Release; OPEN lamp; Key filter, Key source.
- Sends: FX racks and buses, each with level slider and Pre/Post tap.

## Screen 3 — Import: choose files
- Big drop zone + "Choose files" + "Choose a folder"; supported formats listed
  (WAV, MP3, FLAC, M4A, OGG); step indicator 1 Choose files > 2 Review > 3 Mix.

## Screen 4 — Import: review (after files are chosen)
- Header count ("8 tracks", "1 still loading"), button "Add more files" (always available),
  "Clear all".
- One row per track: color dot, file name + format/sample-rate/mono-stereo, group dropdown,
  mini waveform, length, size, status (Ready / Reading NN% with progress bar / Waiting),
  remove (X).
- Footer: hint "drop more files anywhere to add them; mixed sample rates are matched
  automatically" + primary button "Open mixer".
- Auto-guess the group and color from the file name (kick, snare, bass, vox...); user can change.
- Adding files later must keep the current mix settings and not restart playback.
