# X.com ブックマーク抽出ツール

![X.com Bookmark Extractor](screenshots/banner.png)

X.com（旧Twitter）のブックマークページから指定した件数のツイートを自動的にテキスト抽出するChrome拡張機能です。

[English README](README.en.md) is also available.

## 機能

- X.comのブックマークページで動作します
- 指定した件数のツイートを自動的に抽出します
- ツイート内容、ユーザー名、投稿日時を取得します
- エンゲージメント指標（リプライ数、リツイート数、いいね数、閲覧数）を取得します
- 抽出したデータをCSV形式でエクスポートできます
- 抽出したテキストをクリップボードにコピーできます

## スクリーンショット

![使用例](screenshots/usage.png)

## インストール方法

### Chrome ウェブストアからインストール（近日公開予定）

1. [Chrome ウェブストア](#)から拡張機能をインストールします（リンクは近日公開予定）
2. インストール後、X.comのブックマークページで使用できます

### 開発版をインストール

1. このリポジトリをダウンロードまたはクローンします
   ```
   git clone https://github.com/yourusername/x-bookmark-extractor.git
   ```
2. Chrome拡張機能のアイコンをクリックし、「拡張機能を管理」を選択します
3. 右上の「デベロッパーモード」をオンにします
4. 「パッケージ化されていない拡張機能を読み込む」をクリックします
5. ダウンロードしたフォルダを選択します

## 使い方

1. X.comにログインし、ブックマークページ（https://x.com/i/bookmarks または https://twitter.com/i/bookmarks）を開きます
2. Chrome拡張機能のアイコンをクリックします
3. 抽出したいツイート数を入力します
4. 「ブックマークからツイートを抽出」ボタンをクリックします
5. 抽出結果が表示されたら、以下の操作が可能です：
   - 「すべてコピー」ボタンでテキストをクリップボードにコピー
   - 「CSVをダウンロード」ボタンでデータをCSV形式で保存

## 取得されるデータ

本拡張機能では、以下のデータを取得します：

- ツイート本文
- 投稿者名（アカウント名）
- 投稿日時
- リプライ数
- リツイート数
- いいね数
- 閲覧数
- ツイートURL
- ツイートに含まれるリンク

## 注意事項

- この拡張機能はX.comのブックマークページでのみ動作します
- X.comのDOM構造が変更された場合、正常に動作しなくなる可能性があります
- 大量のツイートを抽出する場合、処理に時間がかかることがあります

## 開発

プロジェクトへの貢献に興味がある場合は、[CONTRIBUTING.md](CONTRIBUTING.md)をご覧ください。

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルをご覧ください。

## 作者

- [あなたの名前](https://github.com/yourusername)

## アイコンについて

拡張機能のアイコンは以下のサイズが必要です：
- 16x16 ピクセル (icon16.png)
- 48x48 ピクセル (icon48.png)
- 128x128 ピクセル (icon128.png)

これらのアイコンは `images` フォルダに配置されています。
