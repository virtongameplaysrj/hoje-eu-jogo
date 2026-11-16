# Hoje eu jogo

Android app for choosing what to play from the Steam, GOG, Epic and PS2 library:
groups by category, a 3D box shelf and a quick trailer when you stop on a game.

- `GamePicker/web/`: interface (HTML/CSS/JS) and `games.json`. Published to GitHub Pages
  on every push; the app fetches from there, so changes reach the phone without reinstalling.
- `GamePicker/android/`: Android wrapper (WebView). Only needs a new APK if this changes.
- `GamePicker/build.ps1`: builds `GamePicker.apk` (JDK + Android SDK in `C:\Users\lucas\AndroidBuildTools`).
- `import-scripts/`: re-import the library (Steam/GOG/Epic → tags, covers, trailers → `games.json`).
