# Documentation and interface review / 文档与界面自审

Reviewed / 审阅日期: 2026-10-21. Scope / 范围: v2.0.0 → v2.1.0.

## References actually read / 实际阅读的参考

The following star counts were retrieved from GitHub repository metadata on the review date. Counts change. These are high-star examples chosen for transferable documentation patterns; stars are not evidence that every design choice suits this collector.

星数为审阅时的 GitHub 元数据快照。参考的是表达和组织方法，没有复制其介绍文字。

| Repository | Stars at review | What was useful / 可借鉴之处 |
| --- | ---: | --- |
| [codecrafters-io/build-your-own-x](https://github.com/codecrafters-io/build-your-own-x) | 554,893 | Opens with one clear purpose, then routes readers to concrete tutorials / 先说清用途，再按任务进入教程 |
| [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | 522,003 | Short introduction, clear navigation and deliberate organization / 简短介绍、清楚导航、便于查找 |
| [freeCodeCamp/freeCodeCamp](https://github.com/freeCodeCamp/freeCodeCamp) | 457,598 | Explains who it helps, with visible paths for help and contributions / 先解释服务谁，再给求助和参与入口 |
| [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) | 122,563 | Claude design analysis: warm canvas, terracotta accents, serif display hierarchy / Claude 风格的纸色、陶土色与衬线层级 |

README sources / 阅读入口：
[build-your-own-x README](https://github.com/codecrafters-io/build-your-own-x/blob/master/README.md) ·
[awesome README](https://github.com/sindresorhus/awesome/blob/main/readme.md) ·
[freeCodeCamp README](https://github.com/freeCodeCamp/freeCodeCamp/blob/main/README.md) ·
[Claude design analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/claude/DESIGN.md)

## Recommendations adopted / 采用的建议

1. Start with the reader's problem: copying store data repeatedly. Replace generic feature marketing with a small, understandable use case.
   开头描述反复抄店铺资料的麻烦，让读者先知道工具能帮什么。
2. Put the language switch and shortest setup path near the top. Keep both README versions functionally equivalent.
   首屏提供语言入口和导航，中英文教程保持一致。
3. Make the first successful task explicit: MongoDB → local service → extension → pairing → 3 stores → review → CSV.
   将首次成功过程写完整，明确安装脚本不会安装 MongoDB。
4. Explain the output before promising analysis: CSV scope, 12 columns, JSON offer cells, local data and recovery state.
   写清产物形态，避免误以为优惠一行一条或 CSV 可恢复任务。
5. Use actual screenshots and label previews honestly. Keep known compatibility limits visible.
   使用实际渲染截图，明确是离线预览。
6. Borrow a design vocabulary, then adapt it to the job. Serif typography, warm paper, one accent and clear numbered sections fit a narrow collection panel.
   用统一视觉语言服务采集任务，保留必要控制，不仿造 Claude 聊天页面。
7. Verify assets and distribute only suitable fonts. The official platform logo and openly licensed font subsets are documented separately.
   核实真实标志，说明字体来源与回退方式。

## Revision log / 自监督修订

| Pass / 轮次 | Finding / 发现 | Revision / 已修改 |
| --- | --- | --- |
| 1 — content | English-only README and Chinese-only UI; first use lacked detailed outputs / 文档和界面语言不完整，产物说明不足 | Parallel Chinese/English README; shared UI translations; full first-run tutorial; output table and fictional example |
| 1 — accuracy | Export reads the whole configured database, while users could assume it means the active task / 导出范围容易误解 | Both README versions state database-wide store snapshots and JSON offer cells |
| 2 — behavior | Popup showed a fixed decorative progress bar / 弹窗进度原为固定装饰 | Shared real progress calculation and accessible progress value |
| 2 — behavior | Current-page capture validated unrelated search inputs / 当前页被搜索参数拦住 | Run current-page action directly; disable irrelevant search inputs |
| 2 — usability | Empty CSV contained only a BOM / 空导出没有字段说明 | Always write the 12-column header; add regression test |
| 2 — upgrades | Settings migration reset saved ranges / 升级会重置旧范围 | Preserve stored values; new installations default to 3 stores and cautious pace |
| 2 — setup | Python launcher was pinned to 3.11; pip failures could still reach a success message / Python 选择固定且失败提示不完整 | Select installed Python 3, require 3.10+, check every install step's exit code |
| 3 — visual QA | Initial offline preview showed fast wait text beside the cautious selection / 离线预览节奏文字不一致 | Initialize pacing through the same rendering path |
| 3 — data integrity | A translated UI could accidentally translate a store name matching an interface phrase / 店名可能恰好等于界面词 | Keep record names, addresses and usage text verbatim; translate field labels only |
| 3 — settings | Language rerender could save defaults back to task settings / 语言重绘可能覆盖设置 | Language and settings rendering do not persist task configuration |
| 3 — feedback | Polling could re-enable controls during an action; success/error feedback was immediately overwritten / 轮询影响操作状态与反馈 | Guard active actions and show action feedback after status refresh |
| 3 — maintenance | Dense generated styles were hard to review / 样式过于密集 | Format the new interface code for maintenance; keep font generation reproducible |

## Validation / 验证

- Python: 25 tests passed, covering the existing API/storage/parser behavior and empty-export schema.
- JavaScript: five regression scripts passed, including language messages and real progress.
- Browser previews: Chinese and English at 300, 360 and 420 px widths; no horizontal overflow, language persistence checked, four screenshots saved.
- Runtime simulation: task settings, verbatim record rendering, current-page action and progress are checked with mocked extension APIs. This does not establish live Dianping compatibility.
- Existing database field names, local pairing and risk-pause mechanisms are retained.
- Broad live-site compatibility remains unverified.

中文：离线和模拟检查不代表真实网站已全部兼容。本次没有通过实际店铺采集来声称通过上线验收。

## Remaining work / 后续建议

After a supervised three-store trial, verify selectors and offers against the pages your account can access. If analysis needs one row per offer, a separate offer export would be a useful next feature; this release does not claim to provide it.

先完成有人监督的三店实际试用，再验证账户可见页面的解析表现。后续可考虑新增“优惠逐条导出”；本版没有将它描述为现有功能。
