/* global PropertiesService, UrlFetchApp, ContentService */
/* ================================================================
   IFC参加日数API プロキシ（Web App エントリーポイント）

   会計アプリ(ブラウザ)からこのWeb Appを呼び出すことで、IFCの参加日数APIキーを
   ブラウザに一切渡さずにサーバー側(GAS)から参加日数を取得できるようにする。
   デプロイ手順は README.md を参照。

   注意: GAS Web Appはどんな結果でも常にHTTP 200を返す仕様のため、
   呼び出し側はHTTPステータスではなくレスポンスJSON内のsuccessを見て判定すること。
================================================================ */

function doGet(e) {
  const params = (e && e.parameter) || {};
  const props = PropertiesService.getScriptProperties();

  // PROXY_ACCESS_TOKENを設定した場合のみ、このプロキシ自体へのアクセスを軽く制限する
  // （未設定なら従来通りチェックしない＝任意の保護機能）
  const accessToken = props.getProperty('PROXY_ACCESS_TOKEN');
  if (accessToken && params.token !== accessToken) {
    return jsonOutput({ success: false, message: '認証に失敗しました' });
  }

  const baseUrl = props.getProperty('IFC_BASE_URL');
  const apiKey = props.getProperty('IFC_EXTERNAL_API_KEY');
  if (!baseUrl || !apiKey) {
    return jsonOutput({
      success: false,
      message: 'IFC連携が未設定です（Script PropertiesにIFC_BASE_URLとIFC_EXTERNAL_API_KEYを設定してください）',
    });
  }

  const validationError = validateYearMonth(params.yearMonth);
  if (validationError) return jsonOutput(validationError);

  const url = buildParticipationUrl(baseUrl, params.yearMonth, params.category || 'men');

  try {
    // UrlFetchAppは同期実行であり、リクエストごとのタイムアウト秒数を指定するAPIが
    // 存在しないため、実際の打ち切りはGoogle側のプラットフォーム制約に依存する。
    // muteHttpExceptions:trueにより、IFC側が返す401/400/500もここでは例外にせず
    // 通常のレスポンスとして受け取り、parseParticipationResponseでそのまま整形する。
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: buildAuthHeader(apiKey),
      muteHttpExceptions: true,
    });
    const result = parseParticipationResponse(res.getResponseCode(), res.getContentText());
    return jsonOutput(result);
  } catch (err) {
    // DNS解決失敗・接続断など、UrlFetchApp自体が例外を投げるケース
    return jsonOutput({
      success: false,
      status: 'network',
      message: `IFC参加日数APIへの接続に失敗しました: ${err && err.message ? err.message : err}`,
    });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
