# PLAN — build order (one phase at a time, finish and test before the next)

## Phase 0 — Setup (30 min)
- git init, folder layout, index.html with a "hello" page, local server running.
- Ask the user: app name, accent color/theme (dark), max tracks is fixed at 32 (decided).
- Done when: page opens at http://localhost:8080 and git has the first commit.

## Phase 1 — Engine MVP (import + play + basic mixing)
- Build the responsive page SHELL from docs/UI.md "Wide layout": top bar, group overview, workspace area,
  fader bank, right sends column. Only the fader bank and top bar are real now; the rest are empty
  placeholders that later phases fill. Breakpoint: 1024 px (wide) / phone layout below.
- Meters are drawn on <canvas> with requestAnimationFrame (many meters must not lag).
- Import flow (see docs/UI.md screens 3-4): choose files (button, folder, drag and drop) ->
  review list with progress per file -> "Add more files" at any time -> "Open mixer".
- Decode, show track list with mini waveforms. Guess group/color from file names.
- Transport is SLIM: play button, time, one seek slider. No A-B loop, no stop/rewind buttons.
  All tracks in sync.
- Per channel: fader (dB), pan, mute, solo, input LED bar with SIG/CLIP lamps, stereo level
  meter with dB scale numbers (0, -6, -12, -24, -48). Main fader + meter. Layout: docs/UI.md.
- Done when: 8 test stems play in sync, solo/mute behave correctly, no clicks.
- Test files: generate synthetic stems (sine/noise/click) with a script until
  the user supplies real multitracks.

## Phase 2 — Channel strip DSP
- Selected-channel model: clicking a strip name selects it; workspace panels (Gate | EQ | Comp | Sends)
  follow it. EQ panel can expand full size with a live spectrum behind the graph (AnalyserNode).
- Low cut filter, 4-band EQ with response graph.
- Gate and compressor as AudioWorklet, with gain-reduction meter.
- Numeric tests for each block.
- Done when: compressing a drum stem audibly and measurably works, A/B bypass works.

## Phase 3 — Buses, sends, FX racks, main bus
- Sends on faders (decided: in MVP, built in this phase): right column picks a bus/FX; strip faders
  then control that send level. FX Racks screen with 4 slots (routing label, On/Off, knobs, meters).
- Send levels per channel (pre/post), 2-4 FX racks (reverb + delay first), 2-4 buses.
- Main bus EQ + compressor + limiter. Output protection against clipping.
- Done when: vocal send to reverb works and tails are not cut when stopping.

## Phase 4 — Core FX set (one at a time, each with tests)
- Saturator, de-esser, chorus, limiter, dynamic EQ, pitch/formant shift,
  stereo imager, exciter, tape-style delay.
- Each effect: spec of parameters first, then code, then listening test.
- Hide anything not good enough instead of shipping a bad effect.

## Phase 5 — Practice features
- Speed change without pitch change, count-in. (No A-B loop: the user does not want it.)
- Scenes: save/recall mix (with a recall scope), compare my mix vs reference.
- Export mixdown to WAV (offline render).
- Save/load projects in IndexedDB.

## Phase 6 — Polish and release
- Test the 1024 px breakpoint on tablet and phone landscape.
- Responsive layout (phone/tablet/desktop), touch-friendly faders.
- PWA install + offline. Test on Android and iPhone.
- Optional: wrap as desktop/mobile app (Electron/Tauri/Capacitor).

---
## How the user talks to Claude Code (copy/paste prompts)

**First prompt (Phase 0):**
> อ่าน CLAUDE.md, docs/PLAN.md และ docs/UI.md ก่อน แล้วเริ่ม Phase 0 อย่างเดียว
> ตั้งโปรเจกต์ ทำหน้า hello รันได้ แล้วบอกฉันว่ารันยังไงเป็นขั้น ๆ
> ยังไม่ต้องทำ Phase อื่น

**Start each next phase:**
> Phase ก่อนหน้าผ่านแล้ว เริ่ม Phase N ตาม docs/PLAN.md
> ทำทีละส่วนเล็ก ๆ แล้วให้ฉันลองฟัง/ลองกดก่อนไปต่อ

**When something is wrong:**
> [บอกอาการ เช่น "เสียงแตกเมื่อเลื่อน fader"] ช่วยหาสาเหตุก่อน อย่าเพิ่งแก้ แล้วบอกแผนแก้

**Before closing for the day:**
> สรุปว่าทำอะไรเสร็จ อะไรยังไม่เสร็จ อะไรยังไม่ได้ทดสอบ แล้ว commit ให้

**Useful habits**
- One phase per session; ask Claude Code to commit after each working step.
- Real multitrack files go in a folder named `testfiles/` (add it to .gitignore).
- If the AI starts copying from the old repo or from Mixing Station, stop it and
  point to the HARD RULES in CLAUDE.md.
