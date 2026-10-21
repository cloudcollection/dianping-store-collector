# Configuration / 配置

Set environment variables in the same PowerShell window **before** running `start.ps1`. Values are read when the service starts; restart it after changing them.

在启动服务的同一 PowerShell 窗口中设置。修改后重启服务。

| Variable / 变量 | Default / 默认值 | Purpose / 用途 |
| --- | --- | --- |
| DIANPING_MONGO_URI | mongodb://127.0.0.1:27017 | MongoDB connection / 数据库连接 |
| DIANPING_MONGO_DATABASE | dianping_collector | Database name / 数据库名 |
| DIANPING_DATA_DIR | Project data/ | Local records and evidence / 本地记录与证据 |
| DIANPING_TOKEN_FILE | data/.collector-token | Local pairing token file / 配对令牌文件 |
| DIANPING_MONGO_TIMEOUT_MS | 1500 | Connection timeout in ms / 连接超时 |
| DIANPING_MONGO_RETRY_SECONDS | 5 | Reconnect interval / 重连间隔 |
| DIANPING_MAX_REQUEST_BYTES | 6291456 | Declared request-size limit / 声明请求大小上限 |
| DIANPING_MAX_CAPTURE_BYTES | 5242880 | Per-response evidence limit / 单份响应证据上限 |
| DIANPING_RAW_MAX_TOTAL_BYTES | 262144000 | Evidence storage budget / 证据总预算 |
| DIANPING_RAW_RETENTION_DAYS | 14 | Evidence retention / 证据保留天数 |

Use positive numeric values. The local API listens at `127.0.0.1:8765`; the extension uses this fixed address.

数值请设置为正数。扩展使用固定本地地址 `127.0.0.1:8765`。

Changing the database selects a different collection of records. It does not move existing data, and it does not reset the queue in browser-local storage. Finish or deliberately start a new task after a database change.

切换数据库不会搬迁旧数据，也不会清空浏览器队列。切换后应明确结束旧任务或开始新任务。

Pairing tokens are credentials. If you deliberately rotate the token file while the service is stopped, reconnect the extension with the new token on the next startup. Do not include the token file in commits or screenshots.

配对令牌属于凭据。若停服后主动更换令牌文件，下次启动时需要重新配对。不要提交令牌文件或把它放进截图。
