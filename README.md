# Comtriever

Comtriever is a small macOS desktop retriever companion built with Electron.

## Run

```bash
npm install
npm start
```

## Build a macOS DMG

Build the default unsigned DMG for MVP/test distribution:

```bash
npm run dist
```

This runs `npm run dist:mac:unsigned` and writes the DMG to `dist/`.

Current output:

```bash
dist/Comtriever-0.1.0-universal.dmg
```

Unsigned builds use ad-hoc signing and no Apple notarization. They are fine for MVP sharing or private testing, but macOS may warn users on first launch.

User install notes for unsigned builds:

- Open the DMG.
- Drag `Comtriever.app` into `Applications`.
- If macOS blocks the first launch, right-click `Comtriever.app` and choose `Open`.
- If it is still blocked, open `System Settings > Privacy & Security` and choose `Open Anyway`.

Prepare only the macOS app icon and menu bar icon:

```bash
npm run icons:prepare
```

## Optional signed and notarized distribution

To reduce "unidentified developer", "cannot check for malicious software", or virus-suspicion style install warnings on other Macs, distribute a Developer ID signed and Apple-notarized DMG.

Build a signed and notarized DMG:

```bash
npm run dist:mac
```

This command requires notarization credentials and code signing. It intentionally fails instead of silently producing an untrusted public build.

Requirements:

- Apple Developer Program membership.
- A `Developer ID Application` certificate available in the build machine Keychain, or provided through `CSC_LINK` and `CSC_KEY_PASSWORD`.
- Apple notarization credentials supplied as environment variables.

Recommended notarization variables:

```bash
export APPLE_API_KEY=/absolute/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run dist:mac
```

Alternative Apple ID variables:

```bash
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=TEAMID1234
npm run dist:mac
```

Do not commit certificates, `.p8` keys, app-specific passwords, or Team credentials to this repository.

## Current MVP

- A small settings window opens when the app starts.
- A transparent pet window shows a pixel-art sprite-animated retriever on the desktop.
- The retriever has separate idle, walking home, pop-in, happy, and sleeping animations.
- The retriever occasionally wanders around the desktop on its own while idle.
- `리트리버 집으로 보내기` makes the retriever walk toward home and disappear.
- `다시 부르기` brings the retriever back with a pop-in animation.
- `항상 위에 표시` keeps the retriever above other apps.
- `작업창 가리지 않기` keeps the retriever behind other work windows instead of forcing it always on top.
- The last pet visibility, display mode, and position are saved in Electron's user data folder.
- A macOS menu bar icon opens settings and exposes quick controls for showing, hiding, sending home, calling back, and quitting Comtriever.
- The app can register as a macOS login item so the retriever appears again after restarting the Mac.

## Assets

Retriever sprite sheets are prepared from the PNG files in `img/`. The prepare step removes the checker background and writes runtime assets to `src/assets/retriever/`.

```bash
npm run assets:prepare
```
