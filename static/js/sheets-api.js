/* ================================================================
   SHEETS API HELPERS
================================================================ */
// 401はアクセストークンの失効を示すため、呼び出し元で判別できるようにフラグを付ける
function apiError(prefix, res) {
  const err = new Error(`${prefix} error: ${res.status}`);
  err.isSessionExpired = res.status === 401;
  return err;
}

async function sheetsGet(range) {
  const url = `${API_BASE}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${accessToken}` } });
  if (!res.ok) throw apiError('Sheets GET', res);
  return (await res.json()).values || [];
}

async function sheetsAppend(sheetName, rows) {
  const url = `${API_BASE}/values/${encodeURIComponent(sheetName+'!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw apiError('Sheets APPEND', res);
  return res.json();
}

async function sheetsClear(sheetName) {
  const url = `${API_BASE}/values/${encodeURIComponent(sheetName+'!A2:Z9999')}:clear`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
  });
  if (!res.ok) throw apiError('Sheets CLEAR', res);
}

async function sheetsUpdate(range, values) {
  const url = `${API_BASE}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw apiError('Sheets UPDATE', res);
}

// 前提: S.txs / S.members などの配列の並び順は、シートの行順と常に一致させる
// （並べ替えて表示する際は必ずコピーを作る。配列自体はappend順を保つ）。
// これにより「idから配列のindexを探す → row = index + 2」で対象行を特定でき、
// 保存のたびにシート全体を洗い替えなくて済む（＝他ユーザーの同時編集を上書きしない）。
//
// 楽観的ロック：保存直前に対象行を再取得し、自分がその行を最後に見た時点の値
// （expectedValues）から変わっていないか確認する。取引・部員関連のみ使用。
// チェック自体が失敗した場合（通信エラー等）は「変更なし」とみなし、実際の
// 保存処理側のエラーハンドリング（401ならセッション切れモーダル等）に委ねる。
async function assertRowUnchanged(sheetName, rowNum, expectedValues) {
  const range = `${sheetName}!A${rowNum}:${colLetter(expectedValues.length)}${rowNum}`;
  const current = (await sheetsGet(range))[0] || [];
  return expectedValues.every((v, i) => String(v ?? '') === String(current[i] ?? ''));
}

async function sheetsUpdateRow(sheetName, rowNum, values) {
  const range = `${sheetName}!A${rowNum}:${colLetter(values.length)}${rowNum}`;
  await sheetsUpdate(range, [values]);
}

async function sheetsDeleteRow(sheetName, rowNum) {
  await sheetsDeleteRows(sheetName, [rowNum]);
}

// rowNums: 1始まりの行番号（順不同可）。降順に並べ替えてから削除することで、
// 1回のbatchUpdate内で後続の削除対象行の番号がズレないようにする
async function sheetsDeleteRows(sheetName, rowNums) {
  if (rowNums.length === 0) return;
  const sheetId = sheetIdMap[sheetName];
  if (sheetId === undefined) throw new Error(`unknown sheet: ${sheetName}`);
  const requests = [...rowNums].sort((a,b) => b - a).map(rowNum => ({
    deleteDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: rowNum - 1, endIndex: rowNum },
    },
  }));
  const res = await fetch(`${API_BASE}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw apiError('Sheets DELETE ROW', res);
}

async function ensureSheets() {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`,
    { headers:{ Authorization:`Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = new Error('スプレッドシートにアクセスできません');
    // 403/404はアカウントにシートの閲覧・編集権限がないケースがほとんど
    err.isAccessDenied = res.status === 403 || res.status === 404;
    err.isSessionExpired = res.status === 401;
    throw err;
  }
  const meta     = await res.json();
  meta.sheets.forEach(s => { sheetIdMap[s.properties.title] = s.properties.sheetId; });
  const existing = meta.sheets.map(s => s.properties.title);
  const toAdd    = Object.values(SH).filter(n => !existing.includes(n));

  if (toAdd.length > 0) {
    const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ requests: toAdd.map(title => ({ addSheet:{ properties:{ title } } })) }),
    });
    const addJson = await addRes.json();
    addJson.replies.forEach((r, i) => { sheetIdMap[toAdd[i]] = r.addSheet.properties.sheetId; });
    const headers = {
      [SH.TX]:      [['id','date','type','acct','toAcct','amount','desc','classification','cat','note']],
      [SH.MEMBERS]: [['id','name','grade']],
      [SH.MEMBER_PERIODS]: [['id','member_id','start_ym','end_ym','attr']],
      [SH.FEE_REC]: [['id','member_id','ym','paid']],
      [SH.PRAC]:    [['id','member_id','ym','count']],
      [SH.FEE_SET]: [['id','attr','amount','type','from_ym','to_ym']],
      [SH.CATEGORIES]: [['type','classification','category','order']],
      [SH.BUDGET]: [['id','date','court_name','court_condition','hours','price_per_hour','amount','remarks']],
      [SH.BUDGET_SETTINGS]: [['id','court_name','court_condition','price_per_hour','remarks']],
      [SH.BUDGET_CATEGORY_RECORDS]: [['id','date','type','classification','category','amount','remarks']],
      [SH.CARRYOVER]: [['fiscal_year','date','cash','bank','note']],
    };
    for (const name of toAdd) await sheetsUpdate(`${name}!A1`, headers[name]);

    // 科目シートを新規作成した場合のみ、デフォルト科目を投入する
    if (toAdd.includes(SH.CATEGORIES)) {
      await sheetsAppend(SH.CATEGORIES, DEFAULT_CATEGORIES);
    }
  }
}
