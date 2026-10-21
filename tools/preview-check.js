async (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const root = "http://127.0.0.1:8848/extension/";
  const output = "docs/assets/";
  await page.goto(root + "sidepanel.html");
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  await page.setViewportSize({ width: 420, height: 980 });
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
  await page.setViewportSize({ width: 360, height: 390 });
  await page.screenshot({ path: output + "popup-preview-en.png" });
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  await page.screenshot({ path: output + "popup-preview.png" });
  if (errors.length) throw Error(errors.join("\n"));
  return {
    passed: true,
    widths: [300, 360, 420],
    languages: ["zh-CN", "en"],
    screenshots: 4,
  };
}
