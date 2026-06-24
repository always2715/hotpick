param(
  [string]$BaseUrl = "https://secufocus-now-web.vercel.app",
  [string]$Secret = "",
  [int]$Batch = 25,
  [int]$MaxRounds = 200,
  [int]$RequestTimeoutSec = 120,
  [int]$MaxTransportRetries = 3
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$Batch = [Math]::Max(1, [Math]::Min(100, $Batch))
$RequestTimeoutSec = [Math]::Max(60, [Math]::Min(240, $RequestTimeoutSec))
$MaxTransportRetries = [Math]::Max(1, [Math]::Min(5, $MaxTransportRetries))

function Limit-Text {
  param(
    [string]$Value,
    [int]$Length = 1200
  )

  if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
  $normalized = ($Value -replace "\s+", " ").Trim()
  if ($normalized.Length -le $Length) { return $normalized }
  return $normalized.Substring(0, $Length - 3).TrimEnd() + "..."
}

function Get-WebExceptionBody {
  param($Exception)

  try {
    $webResponse = $Exception.Response
    if ($null -eq $webResponse) { return "" }
    $stream = $webResponse.GetResponseStream()
    if ($null -eq $stream) { return "" }
    $reader = New-Object System.IO.StreamReader($stream)
    try { return $reader.ReadToEnd() }
    finally { $reader.Dispose() }
  }
  catch {
    return ""
  }
}

function Write-RequestFailureDetail {
  param(
    [string]$Body,
    [string]$FallbackMessage
  )

  if ([string]::IsNullOrWhiteSpace($Body)) {
    Write-Host ("Request failed: {0}" -f $FallbackMessage) -ForegroundColor Yellow
    return
  }

  $detail = $Body
  try {
    $parsed = $Body | ConvertFrom-Json
    if ($parsed.detail) { $detail = [string]$parsed.detail }
    elseif ($parsed.error) { $detail = [string]$parsed.error }
  }
  catch {
  }

  Write-Host ("Request failed: {0}" -f (Limit-Text -Value $detail -Length 1200)) -ForegroundColor Yellow

  $rayMatch = [regex]::Match($detail, "Cloudflare Ray ID:\s*(?:<[^>]+>)*\s*([A-Za-z0-9]+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($rayMatch.Success) {
    Write-Host ("Cloudflare Ray ID: {0}" -f $rayMatch.Groups[1].Value) -ForegroundColor Yellow
  }
}

if ([string]::IsNullOrWhiteSpace($Secret)) {
  $secure = Read-Host "Enter Vercel CRON_SECRET" -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $Secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

$headers = @{ Authorization = "Bearer $Secret" }
$resetCursorPending = $true
$consecutiveFullFailures = 0

for ($round = 1; $round -le $MaxRounds; $round++) {
  $transportAttempt = 0
  $response = $null

  while ($null -eq $response -and $transportAttempt -lt $MaxTransportRetries) {
    $transportAttempt++
    $resetCursor = if ($resetCursorPending) { 1 } else { 0 }
    $uri = "$BaseUrl/api/cron/nvd-enrichment?batch=$Batch&resetCursor=$resetCursor"
    Write-Host ("Round {0}: batch={1}, transportAttempt={2}" -f $round, $Batch, $transportAttempt) -ForegroundColor Cyan

    try {
      $webResponse = Invoke-WebRequest `
        -Method Get `
        -Uri $uri `
        -Headers $headers `
        -UseBasicParsing `
        -TimeoutSec $RequestTimeoutSec
      $response = $webResponse.Content | ConvertFrom-Json
      $resetCursorPending = $false
    }
    catch {
      $message = $_.Exception.Message
      $body = Get-WebExceptionBody -Exception $_.Exception
      Write-RequestFailureDetail -Body $body -FallbackMessage $message

      if ($Batch -gt 5) {
        $Batch = [Math]::Max(5, [Math]::Floor($Batch / 2))
        Write-Host ("Reducing batch to {0} for the retry." -f $Batch) -ForegroundColor Yellow
      }
      elseif ($Batch -gt 1) {
        $Batch = 1
        Write-Host "Reducing batch to 1 for the retry." -ForegroundColor Yellow
      }

      if ($transportAttempt -ge $MaxTransportRetries) { throw }
      Start-Sleep -Seconds ([Math]::Min(30, 6 * $transportAttempt))
    }
  }

  if ($null -eq $response) { throw "NVD enrichment API did not return a response." }
  if (-not $response.ok) {
    $detail = if ($response.detail) { [string]$response.detail } else { "NVD enrichment API returned ok=false." }
    throw $detail
  }

  $result = $response.result
  Write-Host ("Candidates before : {0}" -f $result.totalCandidatesBefore)
  Write-Host ("Selected          : {0}" -f $result.selectedCount)
  Write-Host ("Attempted         : {0}" -f $result.attemptedCount)
  Write-Host ("Enriched          : {0}" -f $result.enrichedCount)
  Write-Host ("Partial           : {0}" -f $result.partialCount)
  Write-Host ("WAF fallback      : {0}" -f $result.wafFallbackCount)
  Write-Host ("Missing in NVD    : {0}" -f $result.missingCount)
  Write-Host ("Failed            : {0}" -f $result.failedCount)
  Write-Host ("Remaining         : {0}" -f $result.remainingCount)

  if ($result.wafSamples -and $result.wafSamples.Count -gt 0) {
    Write-Host "Cloudflare-safe fallback samples:" -ForegroundColor Yellow
    foreach ($sample in $result.wafSamples) {
      $blockedFields = if ($sample.blockedFields -and $sample.blockedFields.Count -gt 0) {
        $sample.blockedFields -join ", "
      }
      else {
        "none"
      }
      $rayIds = if ($sample.rayIds -and $sample.rayIds.Count -gt 0) {
        $sample.rayIds -join ", "
      }
      else {
        "none"
      }
      Write-Host ("- {0}: completed={1}, blockedFields={2}, rayIds={3}" -f $sample.cveId, $sample.completed, $blockedFields, $rayIds)
      if ($sample.error) { Write-Host ("  detail: {0}" -f $sample.error) }
    }
  }

  if ($result.errorSamples -and $result.errorSamples.Count -gt 0) {
    Write-Host "Error samples:" -ForegroundColor Yellow
    foreach ($sample in $result.errorSamples) {
      Write-Host ("- {0}: {1}" -f $sample.cveId, $sample.error)
    }
  }

  if ($result.remainingCount -eq 0) {
    Write-Host "NVD detail enrichment backfill completed." -ForegroundColor Green
    exit 0
  }

  if ($result.enrichedCount -eq 0 -and $result.attemptedCount -gt 0) {
    $consecutiveFullFailures++
    if ($Batch -gt 5) {
      $Batch = [Math]::Max(5, [Math]::Floor($Batch / 2))
      Write-Host ("No records were enriched. Next batch reduced to {0}." -f $Batch) -ForegroundColor Yellow
    }
    Start-Sleep -Seconds ([Math]::Min(60, 10 * $consecutiveFullFailures))
  }
  else {
    $consecutiveFullFailures = 0
    Start-Sleep -Seconds 6
  }

  if ($result.stalled) {
    Write-Host "A full set of repeated batch attempts made no progress." -ForegroundColor Yellow
    Write-Host "The daily collector will retry deferred CVEs later." -ForegroundColor Yellow
    exit 0
  }
}

throw "NVD detail enrichment did not complete within MaxRounds."
