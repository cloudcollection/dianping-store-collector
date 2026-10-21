param([string]$PythonPath = "")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    if ($PythonPath) {
        $selectedPython = $PythonPath
        $pythonArgs = @()
    } elseif (Get-Command py -ErrorAction SilentlyContinue) {
        $selectedPython = "py"
        $pythonArgs = @("-3")
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        $selectedPython = "python"
        $pythonArgs = @()
    } else {
        throw "未找到 Python / Python not found. Use -PythonPath with Python 3.10+."
    }
    & $selectedPython @pythonArgs -B -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
    if ($LASTEXITCODE -ne 0) { throw "需要 Python 3.10+ / Python 3.10+ required. Use -PythonPath." }
    & $selectedPython @pythonArgs -B -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "创建虚拟环境失败 / Could not create virtual environment." }
}
& .\.venv\Scripts\python.exe -B -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip 更新失败 / pip upgrade failed." }
& .\.venv\Scripts\python.exe -B -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "安装依赖失败 / Dependency installation failed." }
Write-Host "安装完成 / Setup complete. Start MongoDB, then run .\start.ps1"
