# xcratch-st

[xcratch/scratch-editor](https://github.com/xcratch/scratch-editor) の `xcratch.github.io` ブランチ
（公式 https://xcratch.github.io/editor/ のビルド元）をベースに、
[tfabworks/xcratch-build](https://github.com/tfabworks/xcratch-build) の `1.patch` 相当の変更を適用したものです。

公開 URL:
- https://xcratch-st.699.jp/
- https://tfabworks.github.io/xcratch-st/ （上記へリダイレクト）

## 本家からの変更点

| URL パラメータ | 内容 |
| --- | --- |
| （bpa 未指定） | `?bpa=1` と同じ |
| `?bpa=0` | ブロックパレットの表示/非表示ボタンを出さない（常に表示） |
| `?bpa=1` | ブロックパレットの表示/非表示ボタンを有効化（初期状態は表示） |
| `?bpa=2` | ブロックパレットの表示/非表示ボタンを有効化（初期状態は非表示） |
| `?ss=1` | ステージを小さいサイズで開始 |
| `#<sb3 の URL>` | 指定したプロジェクトをロード（xcratch 標準機能） |

`bpa` はブラウザー内保存（IndexedDB）のプロジェクトヘッダーにも保存され、
プロジェクト一覧から開いたときや、前回のプロジェクトを自動で再開したときに URL へ復元されます
（保存時点の URL の値をそのまま写すので、`bpa` 無しで保存すれば消えます）。
書き出した .sb3 ファイルには含まれません。

例: `https://xcratch-st.699.jp/?bpa=2#https://699.jp/d/xcratch/xxxx.sb3`

変更ファイル（すべて `packages/scratch-gui/` 配下）:
- `src/lib/xcratch-st-bpa.ts` — `bpa` の読み書きヘルパー
- `src/containers/blocks.jsx` — パレット表示/非表示ボタン
- `src/lib/local-project-db.ts`, `src/lib/local-project-storage.ts` — ヘッダーへの `bpa` 保存
- `src/containers/project-library.jsx`, `src/playground/render-gui.jsx` — 開くときの `bpa` 復元
- `src/reducers/stage-size.js` — `?ss=1`
- `src/playground/index.ejs` — Google Analytics タグ
- `scripts/preload-rules.json` — 公式サイトと同じ拡張機能プリロード設定（xcratch.github.io/scripts/preload-rules.json のコピー）
- `static/favicon.ico` — 公式サイトの favicon

## デプロイ

`xcratch` ブランチへ push すると GitHub Actions（`.github/workflows/deploy-pages.yml`）が
公式サイトと同じ手順でビルドし、`packages/scratch-gui/build` を `gh-pages` ブランチへ配置します。

## 本家の更新を取り込む

```bash
git remote add upstream https://github.com/xcratch/scratch-editor.git   # 初回のみ
git fetch upstream
git merge upstream/xcratch.github.io
```

## ローカルで確認

```bash
NODE_ENV=development npm ci
npm run preload -w packages/scratch-gui
npm run build            # 全パッケージをビルド（初回は必須）
npm start -w packages/scratch-gui   # http://localhost:8601/
```

---

以下は scratch-editor 本家の README です。

# scratch-editor: The Scratch Editor Monorepo

If you'd like to use Scratch, please visit the [Scratch website](https://scratch.mit.edu/). You can build your own
Scratch project by pressing "Create" on that website or by visiting <https://scratch.mit.edu/projects/editor/>.

This is a source code repository for the packages that make up the Scratch editor and a few additional support
packages. Use this if you'd like to learn about how the Scratch editor works or to contribute to its development.

## What's in this repository?

The `packages` directory in this repository contains:

- `scratch-gui` provides the buttons, menus, and other elements that you interact with when creating and editing a
  project. It's also the "glue" that brings most of the other modules together at runtime.
- `scratch-render` draws backdrops, sprites, and clones on the stage.
- `scratch-svg-renderer` processes SVG (vector) images for use with Scratch projects.
- `scratch-vm` is the virtual machine that runs Scratch projects.

_Please add to this list as more packages are migrated to the monorepo._

Each package has its own `README.md` file with more information about that package.

## Monorepo migration

### What's going on?

We're migrating the Scratch editor packages into this monorepo. This will allow us to manage all the packages that
make up the Scratch editor in one place, making  it easier to manage dependencies and make changes that affect
multiple packages.

### Why are there only a few packages in this repo?

We're migrating packages in stages. The current plan, which is subject to change, has us migrating repositories in
four batches. We plan to complete the migration within 2025.

### What will happen to the existing repositories?

The existing repositories will be archived and made read-only. Those repositories contain valuable work and
information, including but not limited to issues and pull requests. We plan to keep that information available for
reference, and to selectively migrate it to this new repository.

## Thank you!

Scratch would not be what it is today without help from the global community of Scratchers and open-source
contributors. Thank you for your contributions and support. _[Scratch on!](https://scratch.mit.edu/projects/65347738/fullscreen/)_

## Donate

We provide [Scratch](https://scratch.mit.edu) free of charge, and want to keep it that way! Please consider making a
[donation](https://secure.donationpay.org/scratchfoundation/) to support our continued engineering, design, community,
and resource development efforts. Donations of any size are appreciated. Thank you!
