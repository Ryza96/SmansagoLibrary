$ErrorActionPreference = "Stop"
Write-Host "APLibrary - Development Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

Write-Host "[1/4] Installing npm dependencies..." -ForegroundColor Yellow
npm install
if (-not $?) { throw "npm install failed" }

Write-Host "[2/4] Generating Prisma client..." -ForegroundColor Yellow
npx prisma generate
if (-not $?) { throw "prisma generate failed" }

Write-Host "[3/4] Running database migration..." -ForegroundColor Yellow
npx prisma migrate dev --name init
if (-not $?) { throw "prisma migrate failed" }

Write-Host "[4/4] Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Run 'npm run dev' to start the application." -ForegroundColor Cyan
