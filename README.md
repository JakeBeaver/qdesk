# qdesk

Global keyboard chord switcher for Windows.

qdesk lets you:

- Arm an add mode, then press any chord to bind the current foreground window.
- Arm a remove mode, then press a chord to delete that binding.
- Jump to a bound window by pressing its chord.

It uses native Win32 APIs through Koffi.

## Platform

- Windows only
- Node.js 18+ recommended

## Run With npx

Run directly without installing globally:

```powershell
npx qdesk
```

Override control chords at startup:

```powershell
npx qdesk -a ctrl+shift+r -d ctrl+shift+d
```

Startup flags:

- `-a <combo>`: add/bind mode trigger
- `-d <combo>`: drop mode trigger

Defaults:

- add chord: `ctrl+win+a`
- drop chord: `ctrl+win+d`

## How It Works

1. Press the `add` chord.
2. qdesk enters recording mode (red screen hue indicates recording).
3. Press the chord you want to bind.
4. Press that bound chord later to activate its window.

Remove flow:

1. Press the 'drop' chord.
2. qdesk enters remove mode (green hue).
3. Press the chord to delete.

## Install Locally (Dev)

```powershell
pnpm install
pnpm build
pnpm start
```

Run directly from TypeScript source:

```powershell
pnpm dev
```

## Package Scripts

- `pnpm dev` - run from TypeScript source
- `pnpm build` - clean and compile to `dist`
- `pnpm start` - run compiled CLI
- `pnpm prepack` - build before packing/publishing

## Publish/Test Package

Create a tarball:

```powershell
pnpm pack
```

Test tarball locally:

```powershell
npx --yes .\qdesk-<version>.tgz
```

## Notes

- Some display/driver combinations may limit screen hue APIs.
- Window activation can be restricted by Windows focus rules for certain apps.
- Use unique add/drop chords to avoid mode conflicts.
