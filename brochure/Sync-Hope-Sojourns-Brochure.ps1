[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$sourceFolder = $PSScriptRoot
$marketingFolder = 'C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns\Marketing'
$statePath = Join-Path $sourceFolder '.brochure-sync-state.json'
$logPath = Join-Path $sourceFolder 'brochure-sync.log'
$conflictFolder = Join-Path $marketingFolder 'Brochure-Sync-Conflicts'
$fileNames = @(
    'Hope-Sojourns-Trifold-Brochure-Full-Page.docx',
    'Hope-Sojourns-Trifold-Brochure-Full-Page.pdf'
)

function Write-SyncLog {
    param([string]$Message)

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "$timestamp  $Message"
}

function Get-FileFingerprint {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Copy-SyncFile {
    param(
        [string]$From,
        [string]$To,
        [string]$Reason
    )

    $destinationFolder = Split-Path -Parent $To
    if (-not (Test-Path -LiteralPath $destinationFolder)) {
        New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null
    }

    Copy-Item -LiteralPath $From -Destination $To -Force
    Write-SyncLog "Copied '$From' to '$To' ($Reason)."
}

if (-not (Test-Path -LiteralPath $marketingFolder)) {
    New-Item -ItemType Directory -Path $marketingFolder -Force | Out-Null
}

$state = @{}
if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    try {
        $savedState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        foreach ($property in $savedState.PSObject.Properties) {
            $state[$property.Name] = [string]$property.Value
        }
    }
    catch {
        Write-SyncLog "Could not read the prior sync state. A new state will be created. $($_.Exception.Message)"
    }
}

foreach ($fileName in $fileNames) {
    try {
        $sourcePath = Join-Path $sourceFolder $fileName
        $marketingPath = Join-Path $marketingFolder $fileName
        $sourceExists = Test-Path -LiteralPath $sourcePath -PathType Leaf
        $marketingExists = Test-Path -LiteralPath $marketingPath -PathType Leaf

        if (-not $sourceExists -and -not $marketingExists) {
            Write-SyncLog "Skipped '$fileName' because neither copy exists."
            continue
        }

        if ($sourceExists -and -not $marketingExists) {
            Copy-SyncFile -From $sourcePath -To $marketingPath -Reason 'Marketing copy was missing'
        }
        elseif ($marketingExists -and -not $sourceExists) {
            Copy-SyncFile -From $marketingPath -To $sourcePath -Reason 'Working copy was missing'
        }
        else {
            $sourceHash = Get-FileFingerprint -Path $sourcePath
            $marketingHash = Get-FileFingerprint -Path $marketingPath

            if ($sourceHash -ne $marketingHash) {
                $lastHash = $state[$fileName]
                $sourceChanged = [string]::IsNullOrWhiteSpace($lastHash) -or $sourceHash -ne $lastHash
                $marketingChanged = [string]::IsNullOrWhiteSpace($lastHash) -or $marketingHash -ne $lastHash

                if ($sourceChanged -and -not $marketingChanged) {
                    Copy-SyncFile -From $sourcePath -To $marketingPath -Reason 'Working copy changed'
                }
                elseif ($marketingChanged -and -not $sourceChanged) {
                    Copy-SyncFile -From $marketingPath -To $sourcePath -Reason 'Marketing copy changed'
                }
                else {
                    $sourceItem = Get-Item -LiteralPath $sourcePath
                    $marketingItem = Get-Item -LiteralPath $marketingPath
                    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
                    New-Item -ItemType Directory -Path $conflictFolder -Force | Out-Null

                    if ($sourceItem.LastWriteTimeUtc -ge $marketingItem.LastWriteTimeUtc) {
                        $conflictName = "$($sourceItem.BaseName).marketing-conflict-$timestamp$($sourceItem.Extension)"
                        Copy-Item -LiteralPath $marketingPath -Destination (Join-Path $conflictFolder $conflictName) -Force
                        Copy-SyncFile -From $sourcePath -To $marketingPath -Reason 'Both copies changed; newer working copy won and the Marketing version was preserved as a conflict copy'
                    }
                    else {
                        $conflictName = "$($marketingItem.BaseName).working-conflict-$timestamp$($marketingItem.Extension)"
                        Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $conflictFolder $conflictName) -Force
                        Copy-SyncFile -From $marketingPath -To $sourcePath -Reason 'Both copies changed; newer Marketing copy won and the working version was preserved as a conflict copy'
                    }
                }
            }
        }

        $finalHash = Get-FileFingerprint -Path $sourcePath
        if (-not [string]::IsNullOrWhiteSpace($finalHash)) {
            $state[$fileName] = $finalHash
        }
    }
    catch {
        Write-SyncLog "Failed to sync '$fileName'. $($_.Exception.Message)"
    }
}

$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
