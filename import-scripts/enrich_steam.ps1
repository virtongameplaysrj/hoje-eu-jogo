param([string]$Data)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# --- tag id -> english name
$tags = Invoke-RestMethod "https://store.steampowered.com/tagdata/populartags/english"
$tagName = @{}; foreach ($t in $tags) { $tagName[[int]$t.tagid] = $t.name }

function Get-SteamItems([int[]]$ids) {
  $req = @{
    ids = @($ids | ForEach-Object { @{ appid = $_ } })
    context = @{ language = 'brazilian'; country_code = 'BR' }
    data_request = @{ include_tag_count = 20; include_trailers = $true; include_assets = $true; include_basic_info = $true }
  } | ConvertTo-Json -Depth 5 -Compress
  $u = "https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=" + [uri]::EscapeDataString($req)
  for ($try = 0; $try -lt 4; $try++) {
    try { return (Invoke-RestMethod $u -TimeoutSec 60).response.store_items } catch { Start-Sleep 5 }
  }
  return @()
}

function Convert-Item($it) {
  if (-not $it.success -or $it.success -ne 1) { return $null }
  $a = $it.assets
  $cover = $null; $hero = $null
  if ($a -and $a.library_capsule) {
    $cover = "https://shared.akamai.steamstatic.com/store_item_assets/" + $a.asset_url_format.Replace('${FILENAME}', $a.library_capsule)
  }
  if ($a -and $a.library_hero) {
    $hero = "https://shared.akamai.steamstatic.com/store_item_assets/" + $a.asset_url_format.Replace('${FILENAME}', $a.library_hero)
  } elseif ($a -and $a.header) {
    $hero = "https://shared.akamai.steamstatic.com/store_item_assets/" + $a.asset_url_format.Replace('${FILENAME}', $a.header)
  }
  $micro = $null
  $tr = @($it.trailers.highlights) + @($it.trailers.other_trailers) | Where-Object { $_ }
  foreach ($t in $tr) {
    $m = $t.microtrailer | Where-Object { $_.type -eq 'video/mp4' } | Select-Object -First 1
    if ($m) { $micro = "https://video.akamai.steamstatic.com/store_trailers/" + $m.filename; break }
  }
  [ordered]@{
    appid = [int]$it.appid
    type  = [int]$it.type
    tags  = @($it.tags | Sort-Object { -[int]$_.weight } | ForEach-Object { $tagName[[int]$_.tagid] } | Where-Object { $_ })
    desc  = $it.basic_info.short_description
    cover = $cover
    hero  = $hero
    trailer = $micro
  }
}

$steam = Get-Content "$Data\steam.txt" -Encoding UTF8 | Where-Object { $_ } | ForEach-Object {
  $p = $_.Split('|'); $n = $p.Count
  [pscustomobject]@{ appid = [int]$p[0]; name = ($p[1..($n-3)] -join '|'); minutes = [int]$p[$n-2]; shared = $p[$n-1].Trim() -eq '1' }
}
$meta = @{}
$ids = @($steam.appid)
for ($i = 0; $i -lt $ids.Count; $i += 50) {
  $batch = $ids[$i..([Math]::Min($i + 49, $ids.Count - 1))]
  foreach ($it in (Get-SteamItems $batch)) { $c = Convert-Item $it; if ($c) { $meta[$c.appid] = $c } }
  Write-Output "steam $([Math]::Min($i+50,$ids.Count))/$($ids.Count)"
}
$meta.Values | ConvertTo-Json -Depth 5 | Set-Content "$Data\steam_meta.json" -Encoding UTF8
Write-Output "done: $($meta.Count) with metadata"
