param([string]$Data, [string]$OutFile)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot\enrich_lib.ps1"

function Norm([string]$s) {
  $s = $s.ToLowerInvariant() -replace '[™®©]', ''
  $s = $s -replace '\b(game of the year|goty|definitive|enhanced|complete|deluxe|ultimate|gold|special|anniversary|remastered|director''?s cut|final cut|standard)\b( edition)?', ''
  $s = $s -replace '\bedition\b', ''
  return ($s -replace '[^a-z0-9]', '')
}

# ---- Steam library + metadata
$steamMeta = @{}
foreach ($m in (Get-Content "$Data\steam_meta.json" -Raw -Encoding UTF8 | ConvertFrom-Json)) { $steamMeta[[int]$m.appid] = $m }
$games = [ordered]@{}       # key: "steam:<appid>" or "<store>:<id>"
$byNorm = @{}
foreach ($line in (Get-Content "$Data\steam.txt" -Encoding UTF8 | Where-Object { $_ })) {
  $p = $line.Split('|'); $n = $p.Count
  $appid = [int]$p[0]; $name = $p[1..($n-3)] -join '|'
  $m = $steamMeta[$appid]
  if ($m -and $m.type -ne 0) { continue }   # skip non-game items (tools, soundtracks)
  $g = [ordered]@{ id = "steam:$appid"; name = $name; stores = @('steam'); steamAppId = $appid
    minutes = [int]$p[$n-2]; tags = @(); cover = $null; hero = $null; trailer = $null; youtube = $null; desc = $null }
  if ($m) { $g.tags = @($m.tags); $g.cover = $m.cover; $g.hero = $m.hero; $g.trailer = $m.trailer; $g.desc = $m.desc }
  $games[$g.id] = $g; $byNorm[(Norm $name)] = $g
}

# ---- match a title from another store against Steam
$cache = @{}
if (Test-Path "$Data\search_cache.json") {
  (Get-Content "$Data\search_cache.json" -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $cache[$_.Name] = $_.Value }
}
function Find-SteamApp([string]$title) {
  $k = Norm $title
  if ($cache.ContainsKey($k)) { return $cache[$k] }
  $res = 0
  try {
    $u = "https://store.steampowered.com/api/storesearch/?cc=BR&l=english&term=" + [uri]::EscapeDataString(($title -replace '[™®©]', ''))
    $items = (Invoke-RestMethod $u -TimeoutSec 30).items
    $hit = $items | Where-Object { (Norm $_.name) -eq $k } | Select-Object -First 1
    if ($hit) { $res = [int]$hit.id }
  } catch { Start-Sleep 3 }
  $cache[$k] = $res
  Start-Sleep -Milliseconds 250
  return $res
}

function Add-Other([string]$store, [string]$id, [string]$title, [string]$fallbackCover) {
  $k = Norm $title
  if (-not $k) { return }
  if ($byNorm.ContainsKey($k)) {                      # already have it (Steam or other store)
    $g = $byNorm[$k]; if ($g.stores -notcontains $store) { $g.stores += $store }
    if (-not $g.cover -and $fallbackCover) { $g.cover = $fallbackCover }
    return
  }
  $g = [ordered]@{ id = "${store}:$id"; name = $title; stores = @($store); steamAppId = $null
    minutes = 0; tags = @(); cover = $fallbackCover; hero = $null; trailer = $null; youtube = $null; desc = $null }
  $appid = Find-SteamApp $title
  if ($appid) { $g.steamAppId = $appid }
  $games[$g.id] = $g; $byNorm[$k] = $g
}

$i = 0
foreach ($line in (Get-Content "$Data\gog.txt" -Encoding UTF8 | Where-Object { $_ })) {
  $p = $line.Split('|'); Add-Other 'gog' $p[0] $p[1] $null
  if ((++$i % 50) -eq 0) { Write-Output "gog $i" }
}
$i = 0
foreach ($line in (Get-Content "$Data\epic.txt" -Encoding UTF8 | Where-Object { $_ })) {
  $p = $line.Split('|'); Add-Other 'epic' $p[0] $p[1] $(if ($p.Count -gt 2 -and $p[2]) { $p[2] } else { $null })
  if ((++$i % 50) -eq 0) { Write-Output "epic $i" }
}
$cache | ConvertTo-Json | Set-Content "$Data\search_cache.json" -Encoding UTF8

# ---- fetch Steam metadata for the GOG/Epic games we matched
$need = @($games.Values | Where-Object { $_.steamAppId -and -not $_.tags.Count -and $_.stores -notcontains 'steam' })
$ids = @($need | ForEach-Object { [int]$_.steamAppId } | Select-Object -Unique)
$extra = @{}
for ($j = 0; $j -lt $ids.Count; $j += 50) {
  foreach ($it in (Get-SteamItems $ids[$j..([Math]::Min($j + 49, $ids.Count - 1))])) { $c = Convert-Item $it; if ($c) { $extra[$c.appid] = $c } }
}
foreach ($g in $need) {
  $m = $extra[[int]$g.steamAppId]
  if ($m) { $g.tags = @($m.tags); if ($m.cover) { $g.cover = $m.cover }; $g.hero = $m.hero; $g.trailer = $m.trailer; $g.desc = $m.desc }
}

# ---- GOG fallback for unmatched GOG titles: tags, box art, YouTube video
foreach ($g in @($games.Values | Where-Object { $_.id -like 'gog:*' -and -not $_.tags.Count })) {
  try {
    $r = Invoke-RestMethod ("https://api.gog.com/v2/games/" + $g.id.Substring(4) + "?locale=en-US") -TimeoutSec 30
    $g.tags = @($r._embedded.tags | ForEach-Object { $_.name })
    if (-not $g.cover -and $r._links.boxArtImage) { $g.cover = $r._links.boxArtImage.href }
    $v = $r._embedded.videos | Where-Object { $_.provider -eq 'youtube' } | Select-Object -First 1
    if ($v) { $g.youtube = $v.videoId }
    if (-not $g.desc) { $g.desc = ($r.description -replace '<[^>]+>', '' -replace '\s+', ' ').Substring(0, [Math]::Min(300, $r.description.Length)) }
  } catch { }
  Start-Sleep -Milliseconds 200
}

$list = @($games.Values)
$list | ConvertTo-Json -Depth 5 -Compress | Set-Content $OutFile -Encoding UTF8
Write-Output ("total {0} | with tags {1} | with trailer {2} | with cover {3}" -f $list.Count,
  @($list | ? { $_.tags.Count }).Count, @($list | ? { $_.trailer -or $_.youtube }).Count, @($list | ? { $_.cover }).Count)
