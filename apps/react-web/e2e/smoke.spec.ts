import { expect, test, type Page } from "@playwright/test";

// 各テストは新しいブラウザ文脈で動くので、localStorage は空から始まる。

/** コンソールのエラーとページの例外を集める。テストの最後に空であることを確かめる */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

const nav = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "カテゴリ" }).getByRole("button", { name, exact: true });
const inspector = (page: Page) => page.getByRole("complementary");
const schemaSelect = (page: Page) => page.getByRole("combobox", { name: "スキーマ" });

/** エンジンの mount が終わるまで待つ（PNG 保存ボタンは準備ができるまで押せない） */
async function waitReady(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "アバターを PNG で保存" })).toBeEnabled();
}

/** 「開発」項目に出ている状態の JSON */
async function stateJson(page: Page): Promise<{ selections: Record<string, { partId: string; color?: string }> }> {
  await nav(page, "開発").click();
  const text = await inspector(page).getByRole("region", { name: "状態（AvatarState）" }).locator("pre").innerText();
  return JSON.parse(text);
}

// 人の素材はリポジトリに入れていないので、E2E はマスコットのスキーマで確かめる
test("マスコットのスキーマで開き、パーツと色を変えられる", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await waitReady(page);
  await expect(schemaSelect(page)).toHaveValue("mascot");
  await expect(nav(page, "体")).toBeVisible();

  // 耳は SlotGroup。左を選ぶと右も同じ形になる
  await nav(page, "耳").click();
  const bunny = inspector(page).getByRole("button", { name: "ウサギ耳", exact: true });
  await bunny.click();
  await expect(bunny).toHaveAttribute("aria-pressed", "true");
  // 体の色を変えると、体の色を使う耳としっぽも変わる（状態としては体の色だけを持つ）
  await nav(page, "体").click();
  await inspector(page).getByRole("button", { name: "#9AD0EC", exact: true }).click();

  const state = await stateJson(page);
  expect(state.selections.ear_left?.partId).toBe("ear-left-bunny");
  expect(state.selections.ear_right?.partId).toBe("ear-right-bunny");
  expect(state.selections.body?.color).toBe("#9AD0EC");
  expect(errors).toEqual([]);
});

test("リロードしても構成と選んだスキーマが残り、やり直すと戻る", async ({ page }) => {
  await page.goto("/?schema=mascot");
  await waitReady(page);
  await nav(page, "アクセサリ").click();
  await inspector(page).getByRole("button", { name: "王冠", exact: true }).click();

  // 自動保存は少し遅れて書くので、書かれるまで待つ
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("alter-ego-demo:state:demo-mascot") ?? ""))
    .toContain("acc-crown");
  await page.goto("/");
  await waitReady(page);
  await expect(schemaSelect(page)).toHaveValue("mascot");
  expect((await stateJson(page)).selections.accessory?.partId).toBe("acc-crown");

  await inspector(page).getByRole("button", { name: "最初からやり直す", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "やり直す" }).click();
  await expect(inspector(page).locator("pre").first()).not.toContainText("acc-crown");
});

test("PNG で保存できる", async ({ page }) => {
  await page.goto("/");
  await waitReady(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "アバターを PNG で保存" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
});
