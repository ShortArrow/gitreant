# ADR 0001: gitreant アーキテクチャ

## Status

Accepted (2026-07-08)

## Context

ローカルの git リポジトリのコミットグラフを、単一の SPA 上に複数まとめて表示する Web アプリを作る。参考実装は [k1LoW/mo](https://github.com/k1LoW/mo)。 `mo` は単一 Go バイナリに React SPA を `go:embed` で埋め込み、`net/http` + REST + SSE でローカルサーバを起動する。複数ファイルを引数で受けて 1 画面に並べ、二重起動時は既存サーバへ HTTP POST して追加する。

## Decision

同等の体験を Rust + TypeScript で構成する。

- **配布形態**: Rust 単一バイナリに Vite ビルド成果物を `rust-embed` で埋め込む。
- **表示単位**: 複数リポジトリ。`gitreant [PATH...]` で受け取り、引数無しならカレントディレクトリから上方向に `.git` を探索して 1 リポジトリを追加する。
- **二重起動検知**: 既にサーバが動いていれば、新しいバイナリ起動は `POST /api/repos` で既存セッションにリポジトリを追加してブラウザを開くだけにする。
- **git アクセス**: `gix` (gitoxide, pure Rust)。C ツールチェーン非依存でクロスコンパイル・単一バイナリ配布が容易。
- **バックエンド**: `axum` + `tokio`。REST API と SSE を提供。
- **グラフ描画**: レーン割当（線の分岐/合流の計算）は Rust ドメイン層で行い、 JSON で返す。フロントは React で自前 SVG レイアウトエンジンとして描画する。
- **フロント**: React + Vite + TypeScript。

## 依存方向

```
main (CLI) ──▶ server (axum) ──▶ app (session) ──▶ domain (graph)
                                        └──────────▶ git (gix adapter)
```

上位方針（domain）は下位詳細（gix, axum）に依存しない。domain はグラフの純粋なレーン割当アルゴリズムのみを持ち、外部 I/O を知らない。

## Consequences

- ドメインのレーン割当は純粋関数として TDD 可能（外部依存なし）。
- gix の API は発展途上のため、git アダプタ層で吸収し domain を汚さない。
- 単一バイナリ配布のため、リリースビルド前に frontend build が必要（`build.rs` もしくは Makefile で連携）。
