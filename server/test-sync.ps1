$ErrorActionPreference = "Stop"
Start-Sleep -Seconds 3

Write-Host "Testing sync scheduler API..."
try {
    $r = Invoke-RestMethod -Uri "http://localhost:3000/api/scheduler/sync" -TimeoutSec 5
    Write-Host "SUCCESS:"
    Write-Host ($r | ConvertTo-Json -Depth 5)
} catch {
    Write-Host "FAILED: $_"
}

Write-Host ""
Write-Host "Testing health..."
try {
    $h = Invoke-RestMethod -Uri "http://localhost:3000/health" -TimeoutSec 5
    Write-Host ($h | ConvertTo-Json -Depth 2)
} catch {
    Write-Host "Health check failed: $_"
}
