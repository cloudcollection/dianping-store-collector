# Asset provenance / 素材来源

## Dianping logo / 大众点评标志

The header uses the real, unmodified Dianping wordmark from the [official mobile website](https://m.dianping.com/), not a generated recreation.

界面页眉使用官网真实图片，没有用文字或生成图片仿制。

- Local file / 本地文件: [dianping-logo.webp](../extension/assets/dianping-logo.webp)
- Source image / 源图片: [Meituan image CDN](https://img.meituan.net/dpmobile/9d9025ccccb2d1d2377d6e604580707d13124.png.webp)
- Verified from / 核实依据: the official homepage's [home JavaScript bundle](https://s0.meituan.net/static-prod01/com.sankuai.growthweb.dpmobile/_next/static/chunks/pages/home-433bff6cf65d2874.js)
- Retrieved / 获取日期: 2026-10-21
- SHA-256: `0286874c2909283a5c26e389ec47eb0e1a558ecd2ace24249bcc3d6a0ee24ba8`

The trademark identifies the supported platform. It is not covered by this project's software license, and its presence does not imply affiliation or endorsement. The existing toolbar icons remain the project's own visual identity.

该商标不随项目代码按 GPL 重新授权；使用它不表示官方合作或背书。工具栏图标保留项目自身标识。

## Typography / 字体

The requested direction is Claude-like editorial serif typography in both languages. The font stack first checks local `Anthropic Serif`, `Copernicus` and `Tiempos Text`, then uses bundled, openly licensed alternatives. Naming a local font does not install it.

需求为 Claude 风格的中英文衬线排版。优先匹配本机同名字体；没有安装时，使用随项目分发的开放授权字体。没有复制或下载 Anthropic 的商业字体。

| Bundled file / 随附文件 | Upstream / 来源 | License / 授权 |
| --- | --- | --- |
| source-serif-latin.woff2 | [Google Fonts Source Serif 4](https://github.com/google/fonts/tree/main/ofl/sourceserif4), by [Adobe](https://github.com/adobe-fonts/source-serif) | [SIL OFL 1.1](../extension/fonts/OFL-SourceSerif4.txt) |
| noto-serif-sc-ui.woff2 | [Google Fonts Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc) | [SIL OFL 1.1](../extension/fonts/OFL-NotoSerifSC.txt) |

These are renamed WOFF2 subsets, built by [subset_fonts.py](../tools/subset_fonts.py). The Chinese subset covers interface and known status/error characters; arbitrary store names fall back to installed Noto Serif SC, Source Han Serif SC, Songti SC or SimSun. Latin coverage includes the basic and extended Latin range used by the English interface. Both font files are local: the extension makes no font-CDN request.

中文子集覆盖界面、已知状态和错误信息；其他店名用本机宋体类字体回退。两个字体均随扩展本地提供，界面不连接字体 CDN。

To rebuild / 重建：

```text
python -m pip install fonttools brotli
python tools/subset_fonts.py PATH_TO_NOTO_SERIF_SC.ttf PATH_TO_SOURCE_SERIF_4.ttf
```

## Design reference / 风格参考

[VoltAgent's Claude design analysis](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/claude/DESIGN.md) informed the paper canvas, warm accent and restrained borders. It is a community analysis, not an official Anthropic specification. Layout and interface copy were written for this collector.

参考社区分析中的暖纸色、暖色强调和克制边框，布局和文案按本工具的真实流程重新设计。该分析不是 Anthropic 官方设计规范。
