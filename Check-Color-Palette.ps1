[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$violations = [System.Collections.Generic.List[string]]::new()
$excludedFolders = '\\(?:\.git|\.audio_env|\.video_env|\.venv|\.tmp|venv|node_modules|dist|build|site-dist|tmp|work|outputs|DoYouSeeMeMusicVideo|logo-explorations)\\'

$cssFiles = Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Filter '*.css' |
  Where-Object { $_.FullName -notmatch $excludedFolders }

$rootBlockPattern = [regex]::new(':root\s*\{.*?\}', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$commentPattern = [regex]::new('/\*.*?\*/', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$literalColorPattern = [regex]::new(
  '#[0-9a-fA-F]{3,8}\b|(?:rgb|rgba|hsl|hsla)\(\s*[0-9]|(?<![-\w])(?:white|black)(?![-\w])',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)

foreach ($file in $cssFiles) {
  $relativePath = $file.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
  $content = Get-Content -LiteralPath $file.FullName -Raw

  if ($relativePath -eq 'styles.css') {
    $content = $rootBlockPattern.Replace($content, '', 1)
  }

  $content = $commentPattern.Replace($content, '')

  foreach ($match in $literalColorPattern.Matches($content)) {
    $violations.Add("$relativePath contains a literal color '$($match.Value)'. Use a shared palette variable.")
  }
}

$htmlFiles = Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Filter '*.html' |
  Where-Object { $_.FullName -notmatch $excludedFolders }

foreach ($file in $htmlFiles) {
  $relativePath = $file.FullName.Substring($projectRoot.Length).TrimStart('\', '/')
  $content = Get-Content -LiteralPath $file.FullName -Raw

  if ($content -notmatch '/styles\.css(?:\?[^"'']*)?') {
    $violations.Add("$relativePath does not load the shared /styles.css color system.")
  }
}

if ($violations.Count -gt 0) {
  $violations | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Color palette check passed: $($cssFiles.Count) stylesheet(s) and $($htmlFiles.Count) page(s)."
