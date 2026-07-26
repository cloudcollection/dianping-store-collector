$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
    throw "尚未安装本地环境，请先运行 .\setup.ps1"
}

New-Item -ItemType Directory -Force -Path ".\.test-tmp" | Out-Null
& .\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp ".\.test-tmp\latest"
if ($LASTEXITCODE -ne 0) {
    throw "Python 测试失败。"
}

if (Get-Command node -ErrorAction SilentlyContinue) {
    $scripts = @(
        ".\tests\test_offer_parser.js",
        ".\tests\test_rate_limit.js",
        ".\tests\test_resume_queue.js",
        ".\tests\test_content_reinjection.js"
    )
    foreach ($script in $scripts) {
        & node $script
        if ($LASTEXITCODE -ne 0) {
            throw "浏览器脚本测试失败：$script"
        }
    }
} else {
    Write-Warning "未找到 Node.js，已跳过浏览器脚本测试。"
}
