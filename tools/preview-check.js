async (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const root = "http://127.0.0.1:8848/extension/";
  const output = "docs/assets/";
  const renderedFonts = [];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  async function checkFont(selector) {
    await page.evaluate(() => document.fonts.ready);
    const {root} = await cdp.send("DOM.getDocument");
    const {nodeId} = await cdp.send("DOM.querySelector", {nodeId:root.nodeId,selector});
    const {fonts} = await cdp.send("CSS.getPlatformFontsForNode",{nodeId});
    if (!fonts.some(font=>font.glyphCount>0 && /^(Anthropic Serif|Collector Serif)/.test(font.familyName))) throw Error("Serif font did not render: "+selector+" "+JSON.stringify(fonts));
    renderedFonts.push({selector,fonts:fonts.map(font=>font.familyName)});
  }
  await page.goto(root + "sidepanel.html");
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  await page.setViewportSize({ width: 420, height: 980 });
  await page.evaluate(() => document.fonts.ready);
  if (!(await page.locator("#pace-preview").textContent()).includes("30–90"))
    throw Error("Default pace is inconsistent");
  for (const width of [300, 360, 420]) {
    await page.setViewportSize({ width, height: 980 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("Chinese view overflows at " + width);
  }
  await page
    .getByRole("combobox", { name: "任务范围", exact: true })
    .selectOption("current");
  if (await page.locator("#city-id").isEnabled())
    throw Error("Current page still requires search inputs");
  await page
    .getByRole("combobox", { name: "任务范围", exact: true })
    .selectOption("full");
  await page.setViewportSize({ width: 420, height: 980 });
  await page.setViewportSize({
    width: 420,
    height: await page.evaluate(() => document.documentElement.scrollHeight),
  });
  await page.screenshot({ path: output + "sidepanel-preview.png" });
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("en");
  await page.getByRole("heading", { name: "Plan a collection" }).waitFor();
  if(!(await page.locator(".target-card .field-hint").textContent()).includes("Find the city ID")) throw Error("Wrapped field hint was not translated");
  const guide = page.getByRole("link",{name:"User guide"});
  if((await guide.getAttribute("href")) !== "https://github.com/cloudcollection/dianping-store-collector/blob/main/README.en.md#get-started") throw Error("Wrong English guide destination");
  for(const selector of [".overview-card h1",".brand-copy small",".eyebrow","[data-docs-link] span"]) await checkFont(selector);
  for (const width of [300, 360, 420]) {
    await page.setViewportSize({ width, height: 980 });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )
    )
      throw Error("English view overflows at " + width);
  }
  await page.setViewportSize({
    width: 420,
    height: await page.evaluate(() => document.documentElement.scrollHeight),
  });
  await page.screenshot({ path: output + "sidepanel-preview-en.png" });
  await page.reload();
  if ((await page.locator("html").getAttribute("lang")) !== "en")
    throw Error("Language did not persist");
  await page.goto(root + "popup.html");
  await page.setViewportSize({ width: 360, height: 450 });
  await checkFont(".brand small");
  await checkFont("[data-docs-link] span");
  await page.screenshot({ path: output + "popup-preview-en.png" });
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  const chineseGuide=page.getByRole("link",{name:"使用教程"});
  if(decodeURIComponent((await chineseGuide.getAttribute("href"))).split("#")[1] !== "快速上手") throw Error("Wrong Chinese guide destination");
  await page.screenshot({ path: output + "popup-preview.png" });
  if (errors.length) throw Error(errors.join("\n"));
  return {
    passed: true,
    widths: [300, 360, 420],
    languages: ["zh-CN", "en"],
    screenshots: 4,
    renderedFonts,
  };
}
