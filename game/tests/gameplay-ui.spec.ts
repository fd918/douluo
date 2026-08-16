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
  const landscapeLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    height: document.querySelector<HTMLElement>('[data-testid="device-screen"]')?.getBoundingClientRect().height,
  }));
  expect(landscapeLayout.overflow).toBeLessThanOrEqual(0);
  expect(landscapeLayout.height).toBe(390);
});
