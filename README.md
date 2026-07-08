# gitreant

ローカル git リポジトリのコミットグラフを、単一の SPA 上にまとめて表示する
Web アプリ。[k1LoW/mo](https://github.com/k1LoW/mo) の体験を参考に、Rust 単一
バイナリに React 製 SPA を埋め込んで配布する。

```console
$ gitreant                 # カレントの .git を探して表示
$ gitreant ../foo ../bar   # 複数リポジトリをまとめて表示
```

別ディレクトリで `gitreant` を再実行すると、既に起動しているサーバへ
リポジトリが追加され、同じ画面に並んで表示される（mo と同様の単一インスタンス動作）。

## アーキテクチャ

単一バイナリ。バックエンドは Rust (`axum`)、フロントは TypeScript (React + Vite)。
詳細は [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md)。

```
main (CLI) ──▶ server (axum) ──▶ app (session) ──▶ domain (graph layout)
                                       └──────────▶ git (gix adapter)
```

- **domain**: コミット列を受けてレーン（列）と色を割り当てる純粋関数。外部 I/O なし。
- **git**: `gix` (gitoxide, pure Rust) でリポジトリを読み、トポロジカル順の
  コミット列に変換するアダプタ。
- **app**: 表示中リポジトリの集合を管理し、レイアウト結果とメタデータを合成して
  JSON ビューを生成。
- **server**: REST (`/api/repos`) と SSE (`/api/events`)、`rust-embed` による
  SPA 配信、単一インスタンス検知 (`/api/ping` + `POST /api/repos`)。
- **frontend**: レーン計算済みの JSON を受け取り、自前の SVG でグラフを描画。

## API

| Method | Path           | 説明                                        |
| ------ | -------------- | ------------------------------------------- |
| GET    | `/api/ping`    | 稼働マーカー（単一インスタンス検知用）      |
| GET    | `/api/repos`   | 表示中リポジトリのグラフ JSON               |
| POST   | `/api/repos`   | `{ "path": "..." }` をセッションに追加      |
| GET    | `/api/events`  | SSE。リポジトリ追加時に `update` を通知     |

## ビルド

要件: Rust (stable), Node.js + pnpm。

```console
$ make build     # frontend をビルドして release バイナリに埋め込む
$ ./target/release/gitreant
```

## 開発

```console
$ cargo run -- .                       # バックエンド（:4000）
$ cd frontend && pnpm dev              # フロント（Vite、/api を :4000 にプロキシ）
```

## テスト

```console
$ cargo test
```

- `domain`: レーン割当のユニットテスト（空・単線・分岐/合流・レーン再利用）。
- `git`: 実リポジトリを生成しての特性テスト。
- `server`: 実ソケット経由での ping / 追加 / 重複排除 / 404 フォールバック。

## オプション

```
gitreant [PATH...]
  -p, --port <PORT>   待受/接続ポート（既定 4000）
      --no-open       ブラウザを自動で開かない
```
