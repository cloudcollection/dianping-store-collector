# Security Policy

## Supported version

当前维护版本为 `2.x`。安全修复优先合入最新的 `2.x` 分支。

## Reporting a vulnerability

请不要在公开 Issue 中披露以下问题：

- 本地 API 鉴权绕过；
- 配对令牌泄露；
- 任意文件读写；
- 浏览器权限滥用；
- MongoDB 未授权访问；
- 导出文件中的公式注入或代码执行风险。

仓库为私密状态时，请直接联系仓库所有者。仓库公开后，优先使用 GitHub 的 Private vulnerability reporting / Security Advisory。

报告应包含：

- 受影响版本；
- 最小复现步骤；
- 实际影响；
- 可行的修复建议；
- 是否已在其他地方披露。

## Security model

- 服务仅监听 `127.0.0.1`。
- 所有业务接口要求 `X-Collector-Token`。
- 令牌首次启动时随机生成，保存在本地数据目录。
- CSV 下载使用短期、一次性凭证。
- 不应把 `data/`、`.collector-token`、Cookie、浏览器用户目录或 MongoDB 数据提交到 Git。

## Operator responsibilities

- 为 MongoDB 启用本机访问控制，不要直接暴露到公网。
- 不要在截图、Issue 或日志中分享配对令牌。
- 只安装来自可信提交或正式 Release 的扩展代码。
- 在公开分发前重新审查 Manifest 权限和依赖版本。
