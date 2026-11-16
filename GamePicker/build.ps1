# Builds GamePicker.apk without Gradle: javac -> d8 -> aapt2 -> zipalign -> apksigner
$ErrorActionPreference = 'Stop'
$T    = "C:\Users\lucas\AndroidBuildTools"
$BT   = "$T\sdk\build-tools\34.0.0"
$JAR  = "$T\sdk\platforms\android-34\android.jar"
$env:JAVA_HOME = "$T\jdk"; $env:Path = "$T\jdk\bin;$env:Path"
$root = $PSScriptRoot
$src  = "$root\android"
$out  = "$root\build"

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force "$out\classes", "$out\dex", "$out\res" | Out-Null

# 1. resources
& "$BT\aapt2.exe" compile --dir "$src\res" -o "$out\res\res.zip"
if ($LASTEXITCODE) { throw "aapt2 compile failed" }

# 2. link manifest + resources into an unsigned apk (web assets are added in step 4)
& "$BT\aapt2.exe" link -o "$out\base.apk" -I $JAR --manifest "$src\AndroidManifest.xml" `
  "$out\res\res.zip" --min-sdk-version 24 --target-sdk-version 34
if ($LASTEXITCODE) { throw "aapt2 link failed" }

# 3. java -> class -> dex
$java = @(Get-ChildItem -Recurse "$src\src" -Filter *.java | ForEach-Object FullName)
& javac -encoding UTF-8 --release 11 -classpath $JAR -d "$out\classes" $java
if ($LASTEXITCODE) { throw "javac failed" }
$classes = @(Get-ChildItem -Recurse "$out\classes" -Filter *.class | ForEach-Object FullName)
& "$BT\d8.bat" --release --min-api 24 --lib $JAR --output "$out\dex" $classes
if ($LASTEXITCODE) { throw "d8 failed" }

# 4. add classes.dex + web assets (zip entry names MUST use '/', not '\')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$out\base.apk", 'Update')
[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$out\dex\classes.dex", "classes.dex") | Out-Null
$web = (Resolve-Path "$root\web").Path
foreach ($f in Get-ChildItem -Recurse -File $web) {
  $rel = $f.FullName.Substring($web.Length + 1).Replace('\', '/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, "assets/www/$rel") | Out-Null
}
$zip.Dispose()

# 5. align + sign (debug-style key kept next to the project so updates install over the old app)
& "$BT\zipalign.exe" -f -p 4 "$out\base.apk" "$out\aligned.apk"
$ks = "$root\gamepicker.keystore"
if (-not (Test-Path $ks)) {
  & keytool -genkeypair -keystore $ks -storepass gamepicker -keypass gamepicker -alias gp `
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=GamePicker" | Out-Null
}
& "$BT\apksigner.bat" sign --ks $ks --ks-pass pass:gamepicker --key-pass pass:gamepicker `
  --out "$root\GamePicker.apk" "$out\aligned.apk"
if ($LASTEXITCODE) { throw "apksigner failed" }
Write-Output ("OK -> {0} ({1:N1} MB)" -f "$root\GamePicker.apk", ((Get-Item "$root\GamePicker.apk").Length / 1MB))
