# Architecture

## 组件

```text
Edge / Chrome
  ├─ sidepanel.js / popup.js      用户控制与状态
  ├─ background.js                固定队列、导航、恢复、网络监听
  ├─ content.js                   搜索页与详情页 DOM 解析
  └─ offer_parser.js              优惠标准化
          │ X-Collector-Token
          ▼
FastAPI @ 127.0.0.1:8765
  ├─ app.py                       API、安全边界与校验
  ├─ storage.py                   MongoDB、写入镜像、提交状态
  ├─ parsers.py                   网络响应解析
  └─ security.py                  配对令牌与一次性导出凭证
          │
          ├─ MongoDB              主存储
          └─ data/                写入镜像与受限原始证据
```

## 完成语义

一条队列项只有在以下步骤全部成功后才算完成：

1. `shops` 写入店铺当前快照；
2. `deals` 幂等写入本次优惠；
3. `shop_commits` 写入 `status=committed`；
4. 扩展把本地队列项标记为 `completed`。

如果步骤 1 或 2 成功、步骤 3 失败，恢复时 `complete_shop_ids` 不会把该店判为完成，当前店会被安全重试。

## MongoDB 故障恢复

- 所有结构化写入先更新本地原子 JSON 镜像，再写 MongoDB。
- MongoDB 写入失败时 API 返回错误，扩展保留当前店并暂停。
- 健康检查按退避间隔尝试重连。
- 重连成功后，本地镜像重放到 MongoDB，再允许继续任务。

本项目假设单机、单用户、单本地服务实例。若未来支持多实例，需要引入版本字段或事务日志解决多写者冲突。

## 安全边界

- 业务端点通过 `X-Collector-Token` 鉴权。
- 浏览器扩展将令牌保存在 `chrome.storage.local`。
- CORS 只允许 `chrome-extension://<extension-id>`。
- CSV 下载使用内存中的短期一次性 ticket，避免把长期令牌放入 URL。
- 请求和网络证据都有大小限制。

## 数据来源原则

- 只采集用户打开页面中可见或页面自然产生的数据。
- 不额外构造受保护接口请求。
- 未明确展示的原价、折扣、面值和规则保持空值。
- 页面没有栏目允许空数组；检测到栏目但解析为空时暂停。
