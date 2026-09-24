[CmdletBinding()]
param(
  [string]$Destination = 'C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns\UserGuides'
)

$ErrorActionPreference = 'Stop'
$sourceFolder = Join-Path $PSScriptRoot 'docs\user'
$expected = [System.IO.Path]::GetFullPath('C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns\UserGuides')
$resolved = [System.IO.Path]::GetFullPath($Destination)
if ($resolved -ne $expected) { throw "Refusing to sync to an unexpected destination: $resolved" }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $resolved) -PathType Container)) {
  throw "Hope Sojourns document library is missing: $(Split-Path -Parent $resolved)"
}
if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
  New-Item -ItemType Directory -Path $resolved | Out-Null
}
foreach ($name in @('README.md','Hope-Sojourns-MMT-User-Guide.md','Hope-Sojourns-MMT-User-Guide.docx')) {
  $source = Join-Path $sourceFolder $name
  $target = Join-Path $resolved $name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing canonical guide file: $source" }
  $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
  $targetHash = if (Test-Path -LiteralPath $target -PathType Leaf) { (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash } else { $null }
  if ($sourceHash -ne $targetHash) {
    Copy-Item -LiteralPath $source -Destination $target -Force
    Write-Host "Updated $name"
  } else {
    Write-Host "Current $name"
  }
}
Write-Host "MMT user guide is synchronized: $resolved"
