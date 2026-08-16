import { expect, test } from "@playwright/test";

test("六武魂开局、世界支线与拍卖在手机尺寸可完整操作", async ({ page }) => {
  await page.route("**/api/ai/generate", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "测试本地回退", code: "AI_TEST_FALLBACK" }),
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?native=1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "开始新的人生" }).click();
  await expect(page.getByRole("heading", { name: "在你的命运开始之前" })).toBeVisible();
  await page.getByRole("button", { name: "塑造我的身份" }).click();
  await expect(page.locator(".martial-soul-card")).toHaveCount(6);
  await page.getByRole("button", { name: /赤羽隼/ }).click();
  await page.getByRole("button", { name: "进入斗罗大陆" }).click();
  await expect(page.getByText(/赤羽隼在你掌心展开/)).toBeVisible();

  await page.getByRole("button", { name: "世界", exact: true }).click();
  await expect(page.getByText("世界导演", { exact: true })).toBeVisible();
  await expect(page.locator(".faction-panel article")).toHaveCount(4);
  await page.getByRole("button", { name: /探索当前区域/ }).click();
  await expect(page.locator(".world-event-sheet")).toBeVisible();
  await page.locator(".world-event-sheet button").first().click();
  await expect(page.locator(".world-director-card h2")).not.toHaveText("大陆正在等待你的下一次探索");

  await page.getByRole("button", { name: "行囊", exact: true }).click();
  await page.getByRole("button", { name: "魂师拍卖" }).click();
  await expect(page.locator(".auction-list article")).toHaveCount(3);
  await page.locator(".auction-list article").first().getByRole("button").click();
  await expect(page.locator(".auction-list article").first().getByRole("button")).toHaveText("已拍得");
});

test("旧版存档会保留并补齐开放世界字段", async ({ page }) => {
  await page.goto("/?native=1");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("douluo-life-simulator-save-v1", JSON.stringify({
      name: "旧档魂师",
      martialSoul: "蓝银草",
      soulPower: 17,
      coins: 31,
    }));
  });
  await page.reload();

  await page.getByRole("button", { name: "关系", exact: true }).click();
  await expect(page.getByText("旧档魂师")).toBeVisible();
  await page.getByRole("button", { name: "世界", exact: true }).click();
  await expect(page.getByText("第 1 日")).toBeVisible();
  await expect(page.getByText("势力声望", { exact: true })).toBeVisible();
});

test("375px、小屏横屏、减少动态效果和大字体均不产生横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?native=1");
  await page.addStyleTag({ content: "html { font-size: 125% !important; }" });

  const portraitOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(portraitOverflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("button", { name: "开始新的人生" })).toBeVisible();

  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await page.waitForTimeout(250);
  const landscapeLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    height: document.querySelector<HTMLElement>('[data-testid="device-screen"]')?.getBoundingClientRect().height,
  }));
  expect(landscapeLayout.overflow).toBeLessThanOrEqual(0);
  expect(landscapeLayout.height).toBe(390);
});

test("微信式无系统语音环境使用录制旁白，物品原画与清档确认可正常操作", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: undefined });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: undefined });
    const playbackUrls: string[] = [];
    Object.defineProperty(window, "__narrationPlaybackUrls", { configurable: true, value: playbackUrls });
    HTMLMediaElement.prototype.play = function play() {
      playbackUrls.push(this.src);
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {};
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/?native=1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: "开始新的人生" }).click();
  await expect(page.getByText("正在自动朗读")).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const urls = (window as typeof window & { __narrationPlaybackUrls?: string[] }).__narrationPlaybackUrls ?? [];
    return urls.some((url) => url.endsWith("/audio/douluo/narration/prologue.mp3"));
  })).toBe(true);

  await page.getByRole("button", { name: "塑造我的身份" }).click();
  await page.getByRole("button", { name: "进入斗罗大陆" }).click();
  await expect.poll(() => page.evaluate(() => {
    const urls = (window as typeof window & { __narrationPlaybackUrls?: string[] }).__narrationPlaybackUrls ?? [];
    return urls.some((url) => url.endsWith("/audio/douluo/narration/opening-blue-silver-grass.mp3"));
  })).toBe(true);

  await page.getByRole("button", { name: "行囊", exact: true }).click();
  const itemArt = page.locator(".interactive-inventory .item-icon img");
  await expect(itemArt).toHaveCount(5);
  await expect(itemArt.first()).toHaveAttribute("alt", "学院推荐信图标");
  await page.locator(".interactive-inventory button").first().click();
  await expect(page.locator(".item-sheet-hero img")).toHaveAttribute("alt", "学院推荐信图标");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "档案", exact: true }).click();
  await page.getByRole("button", { name: "重新创建角色" }).click();
  await expect(page.getByRole("heading", { name: "确认重新创建角色？" })).toBeVisible();
  await expect(page.getByText(/角色属性、剧情时间线、已发现结局/)).toBeVisible();
  await page.getByRole("button", { name: "取消，保留当前角色" }).click();
  await expect(page.getByText("档案与时间线")).toBeVisible();

  await page.getByRole("button", { name: "重新创建角色" }).click();
  await page.getByRole("button", { name: "确认清除并重新创建" }).click();
  await expect(page.getByRole("button", { name: "开始新的人生" })).toBeVisible();
});
