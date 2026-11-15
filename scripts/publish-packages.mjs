#!/usr/bin/env node
// 公開パッケージ（private でないもの）のうち、npm にまだ無い版だけを公開する。
// 手順と前提は docs/release.md と ADR-0014 を参照。
//
//   node scripts/publish-packages.mjs              # CI（Trusted Publishing）から。既存パッケージの新しい版だけ出す
//   node scripts/publish-packages.mjs --allow-new  # 手元から初回公開。npm にまだ無いパッケージも出す
//   node scripts/publish-packages.mjs --dry-run    # 何を出すかの確認だけ（npm publish --dry-run）
//
// pnpm pack で workspace:^ を実際の版に置き換えた tarball を作り、npm publish に渡す。
// pnpm publish を使わないのは、Trusted Publishing（OIDC）に対応している npm CLI に公開を任せるため。
// 公開できた版ごとに `New tag: <name>@<version>` を出力し、git tag を付ける（changesets/action がこの行を読んで GitHub Release を作る）。

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const allowNew = args.has("--allow-new");

/** packages/* と plugins/* のうち private でないものを、依存される側が先に来る順で返す */
function listPublicPackages() {
  const pkgs = [];
  for (const group of ["packages", "plugins"]) {
    for (const name of readdirSync(join(root, group))) {
      const dir = join(root, group, name);
      const manifestPath = join(dir, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.private) continue;
      pkgs.push({ dir, manifest });
    }
  }
  const byName = new Map(pkgs.map((p) => [p.manifest.name, p]));
  const sorted = [];
  const visiting = new Set();
  const visit = (p) => {
    if (sorted.includes(p)) return;
    if (visiting.has(p)) throw new Error(`循環依存: ${p.manifest.name}`);
    visiting.add(p);
    for (const dep of Object.keys(p.manifest.dependencies ?? {})) {
      const internal = byName.get(dep);
      if (internal) visit(internal);
    }
    visiting.delete(p);
    sorted.push(p);
  };
  for (const p of pkgs) visit(p);
  return sorted;
}

/** npm 上の状態を返す。"missing" = パッケージ自体が無い、"published" = その版がある、"absent" = 版が無い */
function registryStatus(name, version) {
  const res = spawnSync("npm", ["view", name, "versions", "--json"], { cwd: root, encoding: "utf8" });
  if (res.status !== 0) {
    if (/E404|404 Not Found/.test(`${res.stdout}${res.stderr}`)) return "missing";
    throw new Error(`npm view ${name} に失敗しました:\n${res.stderr}`);
  }
  const versions = [JSON.parse(res.stdout)].flat();
  return versions.includes(version) ? "published" : "absent";
}

function tagExists(tag) {
  return spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { cwd: root }).status === 0;
}

const packDir = mkdtempSync(join(tmpdir(), "alter-ego-pack-"));
const published = [];
const skippedNew = [];

try {
  for (const { dir, manifest } of listPublicPackages()) {
    const { name, version } = manifest;
    const status = registryStatus(name, version);
    if (status === "published") {
      console.log(`- ${name}@${version} は公開済み。飛ばします`);
      continue;
    }
    if (status === "missing" && !allowNew) {
      console.warn(`! ${name} は npm にまだありません。初回は手元から --allow-new で公開してください（docs/release.md）`);
      skippedNew.push(name);
      continue;
    }

    execFileSync("pnpm", ["pack", "--pack-destination", packDir], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
    const tarball = join(packDir, `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`);
    if (!existsSync(tarball)) throw new Error(`tarball が見つかりません: ${tarball}`);

    const publishArgs = ["publish", tarball, "--access", "public"];
    // プレリリース版（0.2.0-next.0 など）は latest にしない
    if (version.includes("-")) publishArgs.push("--tag", "next");
    if (dryRun) publishArgs.push("--dry-run");
    console.log(`+ npm ${publishArgs.join(" ")}`);
    execFileSync("npm", publishArgs, { cwd: root, stdio: "inherit" });

    if (dryRun) continue;
    const tag = `${name}@${version}`;
    if (!tagExists(tag)) execFileSync("git", ["tag", tag], { cwd: root, stdio: "inherit" });
    published.push(tag);
  }
} finally {
  rmSync(packDir, { recursive: true, force: true });
}

for (const tag of published) console.log(`New tag: ${tag}`);
if (published.length === 0 && !dryRun) console.log("新しく公開した版はありません");
if (skippedNew.length > 0) console.warn(`初回公開待ち: ${skippedNew.join(", ")}`);
