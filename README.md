# Comtriever

Comtriever is a small macOS desktop retriever companion built with Electron.

## Run

```bash
npm install
npm start
```

## Current MVP

- A small settings window opens when the app starts.
- A transparent pet window shows a pixel-art sprite-animated retriever on the desktop.
- The retriever has separate idle, walking home, pop-in, happy, and sleeping animations.
- The retriever occasionally wanders around the desktop on its own while idle.
- `리트리버 집으로 보내기` makes the retriever walk toward home and disappear.
- `다시 부르기` brings the retriever back with a pop-in animation.
- `항상 위에 표시` keeps the retriever above other apps.
- `작업창 가리지 않기` hides the retriever while non-Finder work apps, such as Chrome, are frontmost.
- The last pet visibility, display mode, and position are saved in Electron's user data folder.

## Assets

Retriever sprite sheets are prepared from the PNG files in `img/`. The prepare step removes the checker background and writes runtime assets to `src/assets/retriever/`.

```bash
npm run assets:prepare
```
