"""Build offline UI font subsets from the upstream OFL font files.

Usage: python tools/subset_fonts.py NOTO_SERIF_SC.ttf SOURCE_SERIF_4.ttf
Requires fonttools[woff] (developer tooling only).
"""
import sys
from pathlib import Path
from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
ui_sources = list((ROOT / "extension").glob("*.html")) + [
    ROOT / "extension/i18n.js",
    ROOT / "extension/background.js",
    ROOT / "backend/app.py",
]
characters = set("".join(p.read_text(encoding="utf-8") for p in ui_sources))
characters.update(chr(i) for i in range(32, 127))
characters.update("，。；：、！？（）【】《》“”‘’—–…·￥¥")
for source, filename, codes, family in [
    (sys.argv[1], "noto-serif-sc-ui.woff2", sorted(map(ord, characters)), "Collector Song UI"),
    (sys.argv[2], "source-serif-latin.woff2", list(range(32, 0x250)) + [0x2013,0x2014,0x2018,0x2019,0x201c,0x201d,0x2026,0x20ac], "Collector Serif Latin"),
]:
    options = subset.Options()
    options.flavor = "woff2"
    options.name_IDs = ["*"]
    font = subset.load_font(source, options)
    sub = subset.Subsetter(options=options)
    sub.populate(unicodes=codes)
    sub.subset(font)
    for record in font["name"].names:
        if record.nameID in {1,4,6,16}:
            value = family.replace(" ", "") if record.nameID == 6 else family
            record.string = value.encode(record.getEncoding())
    output = ROOT / "extension/fonts" / filename
    subset.save_font(font, str(output), options)
    print(f"{filename}: {output.stat().st_size:,} bytes")
