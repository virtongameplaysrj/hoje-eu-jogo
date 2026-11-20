# Hoje eu jogo

Android app for choosing what to play from the Steam, GOG, Epic and PS2 library:
groups by category, a 3D box shelf and a quick trailer when you stop on a game.

**📲 [Download the APK (latest version)](https://github.com/virtongameplaysrj/hoje-eu-jogo/releases/latest/download/GamePicker.apk)**
(open it on your phone and tap the file to install)

- `GamePicker/web/`: interface (HTML/CSS/JS) and `games.json`. Published to GitHub Pages
  on every push; the app fetches from there, so changes reach the phone without reinstalling.
- `GamePicker/android/`: Android wrapper (WebView). Only needs a new APK if this changes.
- `GamePicker/build.ps1`: builds `GamePicker.apk` (JDK 17 + Android SDK in `E:\Dev\Android\Sdk`; signing key in `E:\Dev\keystores\gamepicker`, outside the repo).
- `import-scripts/`: re-import the library (Steam/GOG/Epic → tags, covers, trailers → `games.json`).
