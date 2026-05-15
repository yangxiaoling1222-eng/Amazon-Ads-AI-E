$r = Invoke-RestMethod -Uri "http://localhost:3000/api/scheduler/sync" -Method PUT -ContentType "application/json" -Body (@{intervalMinutes=120;enabled=$true} | ConvertTo-Json -Compress) -TimeoutSec 10
$r | ConvertTo-Json -Depth 3
