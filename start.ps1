$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    throw "尚未安装本地环境，请先运行 .\setup.ps1"
}

Write-Host ""
& .\.venv\Scripts\python.exe -m backend.cli info
Write-Host ""
Write-Host "浏览器扩展配对令牌（仅粘贴到本机扩展，请勿分享）："
& .\.venv\Scripts\python.exe -m backend.cli token
Write-Host ""

& .\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8765

