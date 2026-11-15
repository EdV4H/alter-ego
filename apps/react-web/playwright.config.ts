import { defineConfig, devices } from "@playwright/test";

// デモアプリの煙テスト。本番ビルドを vite preview で配り、主な操作が通るかだけを見る。
// 細かい振る舞いは vitest（src/**/*.test.ts）で確かめる。
// ライブラリは vite.config.ts の alias でソースを読むので、ライブラリのビルドは要らない。

/** 手元で開いている dev（5480）や preview（5481）とぶつからない番号 */
const PORT = 5482;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
