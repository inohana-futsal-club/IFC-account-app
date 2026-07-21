/* ================================================================
   IFC参加日数API クライアント（Google Apps Script / Node 共通ロジック）

   GAS環境・Node(Jestテスト)環境のどちらからも読み込まれるため、
   どちらのグローバルオブジェクトにも依存しない書き方にすること。
================================================================ */

const DEFAULT_TIMEOUT_MS = 10000;

const YEAR_MONTH_PATTERN = /^\d{4}\/(0[1-9]|1[0-2])$/;

function validateYearMonth(yearMonth) {
  if (typeof yearMonth !== 'string' || !YEAR_MONTH_PATTERN.test(yearMonth)) {
    return { success: false, message: "yearMonthは 'YYYY/MM' 形式で指定してください" };
  }
  return null;
}

function buildParticipationUrl(baseUrl, yearMonth, category) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const query = `yearMonth=${encodeURIComponent(yearMonth)}&category=${encodeURIComponent(category || 'men')}`;
  return `${base}/api/external/participation?${query}`;
}

function buildAuthHeader(apiKey) {
  return { Authorization: `Bearer ${apiKey}` };
}

// status: HTTPステータスコード, bodyText: レスポンスボディ（JSON文字列 or 既にパース済みオブジェクト）
function parseParticipationResponse(status, bodyText) {
  let body;
  try {
    body = typeof bodyText === 'string' ? JSON.parse(bodyText) : bodyText;
  } catch (e) {
    return { success: false, status, message: 'IFC参加日数APIから不正な応答がありました' };
  }
  if (!body || typeof body !== 'object') {
    return { success: false, status, message: 'IFC参加日数APIから不正な応答がありました' };
  }
  return Object.assign({ status }, body);
}

// fetcher(url, options) -> Promise<{ status, body }> を注入する設計。
// タイムアウトはPromise.raceで実装しているため、Node（Jestテスト含む）では
// 実際に指定したtimeoutMsで打ち切られる。
// 一方GAS本番環境のUrlFetchAppは同期実行のため、この関数を使わず
// Code.js側で直接UrlFetchAppを呼んでいる（詳細はCode.jsのコメント参照）。
async function fetchParticipation({ baseUrl, apiKey, yearMonth, category, timeoutMs, fetcher }) {
  const validationError = validateYearMonth(yearMonth);
  if (validationError) return validationError;

  const url = buildParticipationUrl(baseUrl, yearMonth, category);
  const headers = buildAuthHeader(apiKey);
  const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;

  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({ success: false, status: 'timeout', message: 'IFC参加日数APIへの接続がタイムアウトしました' });
    }, timeout);
  });

  try {
    return await Promise.race([
      Promise.resolve(fetcher(url, { method: 'GET', headers }))
        .then((res) => parseParticipationResponse(res.status, res.body)),
      timeoutPromise,
    ]);
  } catch (e) {
    return { success: false, status: 'network', message: `IFC参加日数APIの呼び出しに失敗しました: ${e && e.message ? e.message : e}` };
  } finally {
    clearTimeout(timer);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_TIMEOUT_MS,
    validateYearMonth,
    buildParticipationUrl,
    buildAuthHeader,
    parseParticipationResponse,
    fetchParticipation,
  };
}
