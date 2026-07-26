param(
    [string]$PythonPath = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    if ($PythonPath) {
        & $PythonPath -m venv .venv
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.11 -m venv .venv
        if ($LASTEXITCODE -ne 0) {
            throw "py -3.11 不可用，请使用 -PythonPath 指定 Python 3.10 或更高版本。"
        }
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv .venv
    } else {
        throw "没有找到 Python，请使用 -PythonPath 指定解释器完整路径。"
    }
}

& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Host "Demo 环境安装完成。"
Write-Host "下一步运行：.\start.ps1"

