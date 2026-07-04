<#
.SYNOPSIS
    Alembic migration helper for BidWise AI.

.PARAMETER Action
    upgrade   - Apply all pending migrations (default)
    check     - Check if models are in sync with the database
    new       - Auto-generate a new migration from model changes
    downgrade - Rollback by one migration
    history   - Show migration history
    current   - Show current migration revision
#>

param(
    [ValidateSet("upgrade", "check", "new", "downgrade", "history", "current")]
    [string]$Action = "upgrade",

    [string]$Message = "",
    [string]$Revision = "head"
)

$Backend = Join-Path $PSScriptRoot "..\backend"
Set-Location $Backend

switch ($Action) {
    "upgrade" {
        & .\venv\Scripts\python.exe -m alembic upgrade $Revision
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Migrations applied successfully (rev: $Revision)" -ForegroundColor Green
        }
    }
    "check" {
        & .\venv\Scripts\python.exe -m alembic check
    }
    "new" {
        if (-not $Message) {
            $Message = Read-Host "Migration message"
        }
        & .\venv\Scripts\python.exe -m alembic revision --autogenerate -m $Message
        if ($LASTEXITCODE -eq 0) {
            Write-Host "New migration created: $Message" -ForegroundColor Green
        }
    }
    "downgrade" {
        & .\venv\Scripts\python.exe -m alembic downgrade -1
    }
    "history" {
        & .\venv\Scripts\python.exe -m alembic history
    }
    "current" {
        & .\venv\Scripts\python.exe -m alembic current
    }
}
