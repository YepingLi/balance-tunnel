# Balance Tunnel

A mobile-first 3D tilt game built with TypeScript, Vite, Three.js, and the Web Audio API.

Hold a phone in landscape and tilt in two dimensions. A centered phone follows the safe white `+1` chain. Move away from center to collect cyan `+5` and gold `+10` balls. Touching a glowing red cross ends the run.

## Game Link

Play the game here: [Balance Tunnel](https://yepingli.github.io/balance-tunnel/)

## Requirements

- Node.js 24 LTS or another Vite-compatible current Node release
- A recent Android phone with Chrome or iPhone with Safari for gameplay
- HTTPS for production motion permission and PWA installation

## Development

```sh
npm install
npm run dev
```

Open the local URL on desktop for visual preview. For phone testing on the same Wi-Fi, open the Network URL printed by Vite. Some mobile sensor APIs require HTTPS, so final permission testing should use an HTTPS deployment.

## Checks

```sh
npm test
npm run build
```

## Production preview

```sh
npm run build
npm run preview
```

The production files are generated in `dist/` and can be deployed to any static HTTPS host such as GitHub Pages, Vercel, or Netlify.

## Controls

- **Start** requests motion permission, captures the current phone pose as neutral, and begins a short countdown.
- Tilt left/right and forward/backward to move.
- **Pause/Resume** freezes or continues the run without recalibration.
- **Restart** starts a new run and recalibrates.
- **Sound On/Off** changes generated music and effects.

## Data

Only the high score and sound preference are saved in browser local storage. The game has no backend, account, analytics, or personal-data collection.

## Project structure

```text
src/app       app lifecycle, state, and configuration
src/audio     generated soundtrack and score sounds
src/game      Three.js tunnel, player, scoring balls, obstacles, spawning
src/input     motion permission, calibration, filtering, axis mapping
src/logic     tested pure game, tilt, and spawn rules
src/pwa       service-worker registration
src/storage   local high score and preferences
src/ui        screens, HUD, messages, and feedback
tests         unit and PWA checks
```

## Device test checklist

- Rotate to landscape.
- Grant motion permission after tapping Start.
- Confirm a balanced phone collects the white center chain.
- Confirm two-axis tilt reaches cyan and gold balls.
- Confirm red crosses end the run.
- Test Pause, Resume, Restart, Sound, background auto-pause, and home-screen installation.

The game was implemented from the local `Balance-Tunnel-Implementation-Spec.md` product and technical plan.
