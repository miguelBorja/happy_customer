# Set the connection string to the cloud database
$env:DATABASE_URL="postgresql://postgres.jcuoeglpxvcmlqxximsd:KcCH%22%25%2CTPiUa8.s@aws-1-us-west-2.pooler.supabase.com:5432/postgres?binary_parameters=yes"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running database backup script..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

go run cmd/backup/main.go
