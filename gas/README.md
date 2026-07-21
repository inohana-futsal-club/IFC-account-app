# IFC参加日数API プロキシ（Google Apps Script）

会計アプリ(IFC-account)のブラウザから、フットサル部の出欠管理アプリ「IFC」が提供する
参加日数API（`GET /api/external/participation`）を安全に呼び出すための、Google Apps Script製の
サーバー側プロキシです。

IFCのAPIキーはこのプロキシの中（Script Properties）にのみ保存され、ブラウザには一切渡りません。

```
ブラウザ(IFC-account) → このプロキシ(GAS Web App) → IFCの参加日数API
```

## デプロイ手順

1. [script.google.com](https://script.google.com/) で新しいプロジェクトを作成する。
2. プロジェクト内に以下の3ファイルを作り、このディレクトリの同名ファイル(`src/`以下)の中身をそのまま貼り付ける。
   - `Code.js`
   - `ifcParticipationClient.js`
   - `appsscript.json`(エディタ左の「⚙ プロジェクトの設定」→「"appsscript.json"マニフェストファイルをエディタで表示する」にチェックを入れると編集できるようになります)
3. 左メニューの「プロジェクトの設定」→「スクリプト プロパティ」で以下を追加する。

   | プロパティ名 | 値 |
   |---|---|
   | `IFC_BASE_URL` | IFCアプリのデプロイ先URL（例: `https://<cloud-run-service>.a.run.app`）。IFCアプリの管理者に確認してください |
   | `IFC_EXTERNAL_API_KEY` | IFCアプリの管理者から共有されるAPIキー |
   | `PROXY_ACCESS_TOKEN`(任意) | このプロキシ自体への簡易アクセス制限用の合言葉。設定した場合、`static/js/config.js`の`IFC_PROXY_TOKEN`にも同じ値を設定してください。設定しない場合はこのチェックを行いません。**注意**: IFC-accountはpublicリポジトリの内容をそのまま本番配信しているため、`static/js/config.js`に書いたこの値は事実上誰でも閲覧できます。IFC本体のAPIキーとは違い真の秘密にはならず、雑なbotによる無差別アクセスを軽く防ぐ程度の効果しかありません |

4. 右上の「デプロイ」→「新しいデプロイ」→種類を選択で「ウェブアプリ」を選ぶ。
   - 「次のユーザーとして実行」: **自分**
   - 「アクセスできるユーザー」: **全員**
5. デプロイすると発行される「ウェブアプリURL」(`https://script.google.com/macros/s/.../exec`)を、
   会計アプリ側の `static/js/config.js` の `IFC_PROXY_URL` に設定する。
6. コードを変更した場合は、再度「デプロイ」→「デプロイを管理」→編集(鉛筆アイコン)→
   「バージョン」を「新バージョン」にしてデプロイし直す(URLは変わらない)。

## 注意点

- GAS Web Appは仕様上、内部でどんなエラーが起きても呼び出し元には常にHTTP 200が返ります。
  そのため呼び出し側(会計アプリのフロントエンド)はHTTPステータスではなく、
  レスポンスJSON内の`success`フィールドを見て成功・失敗を判定します。
- `UrlFetchApp`（GASがHTTPリクエストを送るための仕組み）はリクエストごとのタイムアウト秒数を
  指定するAPIを提供していません。そのため実際のタイムアウト上限はGoogle側のプラットフォーム制約に
  依存します。IFC側の接続断・DNS失敗などUrlFetchApp自体が例外を投げるケースはCode.js側で
  catchしてエラーレスポンスに変換しています。
- 氏名の突き合わせ（表記ゆれ吸収）はブラウザ側(`static/js/ifc-participation.js`)で行っています。
  このプロキシは名寄せを一切行わず、IFCから返ってきたデータをそのまま中継します。

## テスト

```bash
npm install
npm test
```

`ifcParticipationClient.js`のURL組み立て・バリデーション・タイムアウト処理をJestで検証しています
（HTTPクライアントはモックに差し替えて、正常系・401・400・タイムアウトを確認）。
`Code.js`はGAS専用のためユニットテスト対象外です(デプロイ後の手動確認が必要です)。
