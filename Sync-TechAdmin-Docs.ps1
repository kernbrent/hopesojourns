[CmdletBinding()]
param(
  [string]$Destination = 'C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns\TechAdmin'
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$sourceFolder = Join-Path $projectRoot 'docs\tech-admin'
$expectedDestination = 'C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns\TechAdmin'

$resolvedParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $Destination))
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
$expectedResolved = [System.IO.Path]::GetFullPath($expectedDestination)

if ($resolvedDestination -ne $expectedResolved) {
  throw "Refusing to sync to an unexpected destination: $resolvedDestination"
}

if (-not (Test-Path -LiteralPath $resolvedParent -PathType Container)) {
  throw "The TechAdmin parent folder does not exist: $resolvedParent"
}

if (-not (Test-Path -LiteralPath $resolvedDestination -PathType Container)) {
  New-Item -ItemType Directory -Path $resolvedDestination | Out-Null
}

$files = @(
  'README.md',
  'Hope-Sojourns-Style-Guide.md',
  'Hope-Sojourns-Style-Guide.docx',
  'Hope-Sojourns-Developer-Guide.md',
  'Hope-Sojourns-Developer-Guide.docx'
)

foreach ($fileName in $files) {
  $sourcePath = Join-Path $sourceFolder $fileName
  $destinationPath = Join-Path $resolvedDestination $fileName

  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required canonical document is missing: $sourcePath"
  }

  $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
  $destinationHash = if (Test-Path -LiteralPath $destinationPath -PathType Leaf) {
    (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash
  } else {
    $null
  }

  if ($sourceHash -ne $destinationHash) {
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    Write-Host "Updated $fileName"
  } else {
    Write-Host "Current $fileName"
  }
}

Write-Host "TechAdmin documentation is synchronized: $resolvedDestination"
