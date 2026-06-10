# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # Start Expo dev server (scan QR code with Expo Go)
npx expo run:android    # Build and run on Android device/emulator
npx expo run:ios        # Build and run on iOS simulator (macOS only)
```

No lint, test, or type-check step is configured.

## Architecture

This is a 4-player Mahjong score-tracking app with **two parallel implementations** sharing identical logic:

- **`App.js`** — React Native / Expo version. Entry point is `index.js` → `registerRootComponent(App)`. Uses `@react-native-async-storage/async-storage` for persistence and RN primitives (`View`, `Text`, `Modal`, etc.).
- **`mahjong-score.jsx`** — Web React version for browser embedding. Uses `localStorage` for persistence and plain HTML with inline styles + a `<style>` block of CSS class names.

Both files are fully self-contained with no shared module between them.

### Core state model

Both implementations share the same top-level state:
- `players` — 4 objects `{ id, name, score, wins }`, defaulting to 东/南/西/北家
- `round` — integer, incremented on each recorded win
- `history` — up to 50 win entries (newest first)

### Scoring logic

`getBaseScore(fans)` returns `2^fans`. Fan values 0–6 map to 基础/1番/2番/3番/4番/满贯/大满贯.

- **Self-draw (自摸)**: each of the 3 other players loses `baseScore`; winner gains `baseScore × 3`
- **Discard (点炮)**: each selected loser pays `baseScore`; winner gains `baseScore × loserCount`

### Modal system

A single `modal` string drives all overlays: `'win' | 'share' | 'edit' | 'import' | 'reset' | null`.

### Import / export

`encodeState` / `decodeState` serialize game state to a URL-safe base64 string. The JSON payload uses short keys (`p`, `r`, `h`) to keep the code compact. Player names are also persisted separately under `mahjong_player_names` in AsyncStorage (RN) or localStorage (web) so names survive a game reset.
