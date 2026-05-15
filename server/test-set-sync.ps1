$ErrorActionPreference = "Stop"

Write-Host "Setting sync interval to 120 minutes..."
$body = @{
    intervalMinutes = 120
    enabled = $true
} | ConvertTo-Json

$r = Invoke-RestMethod -Uri "http://localhost:3000/api/scheduler/sync" -Method PUT -ContentType "application/json" -Body $body -TimeoutSec 10
Write-Host ($r | ConvertTo-Json)

Write-Host ""
Write-Host "Checking status..."
Start-Sleep -Seconds 1
$s = Invoke-RestMethod -Uri "http://localhost:3000/api/scheduler/sync" -TimeoutSec 5
Write-Host ($s | ConvertTo-Json -Depth 3)
