# After faucet funding, this completes deploy + health check (no secrets printed)
$ErrorActionPreference='Stop'
Set-Location 'C:\Users\yakin\Downloads\recycling-platform-main\recycling-platform-main'
npm run check:hedera
if ($LASTEXITCODE -ne 0) { throw 'Operator still not funded' }
npm run deploy:testnet
npm run smoke:reward
# Restart backend if running is left to operator; health check:
try { Invoke-RestMethod 'http://localhost:4001/api/health' | ConvertTo-Json -Depth 5 } catch { Write-Host 'Backend not up — start npm run dev:backend then recheck /api/health' }
