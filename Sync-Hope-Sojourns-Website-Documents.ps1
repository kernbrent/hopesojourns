[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$documentRoot = 'C:\Users\kernb\OneDrive\MasterFolder\Documents\ChristianStepsDoco\HopeSojourns'
$statePath = Join-Path $projectRoot '.document-sync-state.json'
$logPath = Join-Path $projectRoot 'document-sync.log'
$conflictRoot = Join-Path $documentRoot 'Website-Document-Sync-Conflicts'
$allowedExtensions = @('.docx', '.pdf', '.xlsx', '.xls', '.csv', '.pptx', '.md')

# Only files already published by the website are synchronized. Documents that
# exist only in the private document library are never copied into the website.
$syncSets = @(
    @{ Website = 'brochure'; Destination = 'Marketing' }
    @{ Website = 'letters'; Destination = 'Marketing' }
    @{ Website = 'admin\internship-program'; Destination = 'IntershipProgram' }
    @{ Website = 'admin\supplemental-documents'; Destination = 'BusinessAdmin\WebsiteSupplementalDocuments' }
    @{ Website = 'agreements'; Destination = '' }
    @{ Website = 'resources\do-you-see-me'; Destination = 'WebsiteResources\DoYouSeeMe' }
    @{ Website = 'outputs\contact-import-template'; Destination = 'BusinessAdmin\ContactManagement' }
    @{ Website = 'docs\tech-admin'; Destination = 'TechAdmin' }
)

function Write-SyncLog {
    param([string]$Message)

    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "$timestamp  $Message"
}

function Invoke-WithRetry {
    param(
        [scriptblock]$Operation,
        [string]$Description,
        [int]$Attempts = 5,
        [int]$DelaySeconds = 2
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            return & $Operation
        }
        catch {
            if ($attempt -eq $Attempts) {
                throw
            }
            Write-SyncLog "$Description failed on attempt $attempt of $Attempts. Retrying in $DelaySeconds seconds. $($_.Exception.Message)"
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Get-FileFingerprint {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    return Invoke-WithRetry -Description "Reading '$Path'" -Operation {
        (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }
}

function Get-DocumentFingerprint {
    param(
        [string]$Path,
        [System.IO.FileInfo]$WebsiteFile,
        [string]$WebsiteHash
    )

    try {
        return Get-FileFingerprint -Path $Path
    }
    catch {
        # Word can temporarily prevent Get-FileHash from reading an open file.
        # When the synchronized copies still have identical metadata, the
        # website hash safely represents both copies until the next run.
        if (Test-Path -LiteralPath $Path -PathType Leaf) {
            $documentItem = Get-Item -LiteralPath $Path
            if (
                $documentItem.Length -eq $WebsiteFile.Length -and
                $documentItem.LastWriteTimeUtc -eq $WebsiteFile.LastWriteTimeUtc
            ) {
                Write-SyncLog "Used matching size and timestamp for locked document '$Path'."
                return $WebsiteHash
            }
        }

        throw
    }
}

function Copy-SyncFile {
    param(
        [string]$From,
        [string]$To,
        [string]$Reason
    )

    $destinationFolder = Split-Path -Parent $To
    if (-not (Test-Path -LiteralPath $destinationFolder -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null
    }

    Invoke-WithRetry -Description "Copying '$From' to '$To'" -Operation {
        Copy-Item -LiteralPath $From -Destination $To -Force
    }
    Write-SyncLog "Copied '$From' to '$To' ($Reason)."
}

function Save-ConflictCopy {
    param(
        [string]$Path,
        [string]$WebsiteRelativePath,
        [string]$CopyLabel
    )

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $relativeFolder = Split-Path -Parent $WebsiteRelativePath
    $destinationFolder = if ([string]::IsNullOrWhiteSpace($relativeFolder)) {
        $conflictRoot
    } else {
        Join-Path $conflictRoot $relativeFolder
    }
    New-Item -ItemType Directory -Path $destinationFolder -Force | Out-Null

    $item = Get-Item -LiteralPath $Path
    $conflictName = "$($item.BaseName).$CopyLabel-conflict-$timestamp$($item.Extension)"
    $conflictPath = Join-Path $destinationFolder $conflictName
    Invoke-WithRetry -Description "Preserving conflict copy from '$Path'" -Operation {
        Copy-Item -LiteralPath $Path -Destination $conflictPath -Force
    }
    Write-SyncLog "Preserved conflict copy '$conflictPath'."
}

if (-not (Test-Path -LiteralPath $documentRoot -PathType Container)) {
    throw "The Hope Sojourns document folder does not exist: $documentRoot"
}

$state = @{}
$isFirstRun = -not (Test-Path -LiteralPath $statePath -PathType Leaf)
if (-not $isFirstRun) {
    try {
        $savedState = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        foreach ($property in $savedState.PSObject.Properties) {
            $state[$property.Name] = [string]$property.Value
        }
    }
    catch {
        Write-SyncLog "Could not read the prior sync state. Website copies will initialize the new state. $($_.Exception.Message)"
        $state = @{}
        $isFirstRun = $true
    }
}

$syncedCount = 0
$unchangedCount = 0
$failedCount = 0

foreach ($syncSet in $syncSets) {
    $websiteFolder = Join-Path $projectRoot $syncSet.Website
    if (-not (Test-Path -LiteralPath $websiteFolder -PathType Container)) {
        Write-SyncLog "Skipped missing website folder '$websiteFolder'."
        continue
    }

    $destinationFolder = if ([string]::IsNullOrWhiteSpace($syncSet.Destination)) {
        $documentRoot
    } else {
        Join-Path $documentRoot $syncSet.Destination
    }

    $websiteFiles = Get-ChildItem -LiteralPath $websiteFolder -Recurse -File | Where-Object {
        $allowedExtensions -contains $_.Extension.ToLowerInvariant() -and
        -not $_.Name.StartsWith('~$')
    }

    foreach ($websiteFile in $websiteFiles) {
        $relativeWithinSet = $websiteFile.FullName.Substring($websiteFolder.Length).TrimStart('\', '/')
        $websiteRelativePath = Join-Path $syncSet.Website $relativeWithinSet
        $documentPath = Join-Path $destinationFolder $relativeWithinSet
        $stateKey = $websiteRelativePath.Replace('\', '/')

        try {
            $websiteHash = Get-FileFingerprint -Path $websiteFile.FullName
            $documentHash = Get-DocumentFingerprint -Path $documentPath -WebsiteFile $websiteFile -WebsiteHash $websiteHash

            if ([string]::IsNullOrWhiteSpace($documentHash)) {
                Copy-SyncFile -From $websiteFile.FullName -To $documentPath -Reason 'Document-library copy was missing'
                $state[$stateKey] = $websiteHash
                $syncedCount++
                continue
            }

            if ($websiteHash -eq $documentHash) {
                $state[$stateKey] = $websiteHash
                $unchangedCount++
                continue
            }

            $lastHash = $state[$stateKey]
            if ($isFirstRun -or [string]::IsNullOrWhiteSpace($lastHash)) {
                Save-ConflictCopy -Path $documentPath -WebsiteRelativePath $websiteRelativePath -CopyLabel 'document-library'
                Copy-SyncFile -From $websiteFile.FullName -To $documentPath -Reason 'Initialized from the current website copy'
                $state[$stateKey] = $websiteHash
                $syncedCount++
                continue
            }

            $websiteChanged = $websiteHash -ne $lastHash
            $documentChanged = $documentHash -ne $lastHash

            if ($websiteChanged -and -not $documentChanged) {
                Copy-SyncFile -From $websiteFile.FullName -To $documentPath -Reason 'Website copy changed'
            }
            elseif ($documentChanged -and -not $websiteChanged) {
                Copy-SyncFile -From $documentPath -To $websiteFile.FullName -Reason 'Document-library copy changed'
            }
            else {
                $documentItem = Get-Item -LiteralPath $documentPath
                if ($websiteFile.LastWriteTimeUtc -ge $documentItem.LastWriteTimeUtc) {
                    Save-ConflictCopy -Path $documentPath -WebsiteRelativePath $websiteRelativePath -CopyLabel 'document-library'
                    Copy-SyncFile -From $websiteFile.FullName -To $documentPath -Reason 'Both copies changed; newer website copy won'
                }
                else {
                    Save-ConflictCopy -Path $websiteFile.FullName -WebsiteRelativePath $websiteRelativePath -CopyLabel 'website'
                    Copy-SyncFile -From $documentPath -To $websiteFile.FullName -Reason 'Both copies changed; newer document-library copy won'
                }
            }

            $state[$stateKey] = Get-FileFingerprint -Path $websiteFile.FullName
            $syncedCount++
        }
        catch {
            $failedCount++
            Write-SyncLog "Failed to synchronize '$websiteRelativePath'. $($_.Exception.Message)"
        }
    }
}

$orderedState = [ordered]@{}
$state.Keys | Sort-Object | ForEach-Object { $orderedState[$_] = $state[$_] }
$orderedState | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

$summary = "Hope Sojourns document sync completed: $syncedCount updated, $unchangedCount unchanged, $failedCount failed."
Write-SyncLog $summary
Write-Host $summary

if ($failedCount -gt 0) {
    exit 1
}
