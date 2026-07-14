/* ================================================================
   CONFIG
================================================================ */
const CLIENT_ID = '387302608037-et2svb68cnf7lm3gltpn67u3ovbplrjq.apps.googleusercontent.com';
const SHEET_ID  = '1J-kv2Lwc4qBxVAvBGn0JCFS1BSc8UuXTwg1G2xY0nqc';
const SCOPES    = 'https://www.googleapis.com/auth/spreadsheets';
const API_BASE  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

const SH = {
  TX:      'transactions',
  MEMBERS: 'members',
  MEMBER_PERIODS: 'member_periods',
  FEE_REC: 'fee_records',
  PRAC:    'practice_count',
  FEE_SET: 'fee_settings',
  CATEGORIES: 'categories',
  BUDGET: 'budget_records',
  BUDGET_SETTINGS: 'budget_settings',
  BUDGET_CATEGORY_RECORDS: 'budget_category_records',
  CARRYOVER: 'carryover_records',
};

/* ================================================================
   CONSTANTS
================================================================ */
const ATTR_L     = { male:'男プレ', female:'女プレ', manager:'マネージャー', exec:'幹部上' };
const ATTR_ORDER = { male:0, female:1, manager:2, exec:3 };
const GRADE_ORDER= { 26:0,25:1,24:2,23:3,22:4,21:5 };

/* ================================================================
   UTILITY FUNCTIONS - HTML Escaping
================================================================ */
const _ESCAPE_HTML_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => _ESCAPE_HTML_MAP[c]);
}

/* ================================================================
   UTILITY FUNCTIONS - CSS Helper Functions
================================================================ */
function getAmountClass(value, type = 'amount') {
  if (type === 'income-expense') {
    return value === 'income' ? 'text-income' : 'text-expense';
  } else if (type === 'positive-negative') {
    return value >= 0 ? 'text-income' : 'text-expense';
  }
  return '';
}

function getPaidStatusClasses(isPaid) {
  return isPaid ? 'bg-paid text-paid' : 'bg-unpaid text-unpaid';
}

/* ================================================================
   UTILITY FUNCTIONS - Fiscal Year Helpers
================================================================ */
// 会計年度は9月始まり（幹部代の準備期間である9月から新年度の収支として扱う）
function getFiscalYear(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= 9 ? year : year - 1;
}

function getFiscalYearRange(fiscalYear) {
  const months = [];
  for (let m = 9; m <= 12; m++) {
    months.push(`${fiscalYear}-${String(m).padStart(2, '0')}`);
  }
  for (let m = 1; m <= 8; m++) {
    months.push(`${fiscalYear + 1}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

function getFiscalYearLabel(fiscalYear) {
  return `${fiscalYear}年度`;
}

function getAvailableFiscalYears() {
  const years = new Set();
  const today = new Date();
  const currentYear = getFiscalYear(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  years.add(currentYear);

  S.budget.records.forEach(r => {
    if (r.date) years.add(getFiscalYear(r.date));
  });
  S.budget.categoryRecords.forEach(r => {
    if (r.date) years.add(getFiscalYear(r.date));
  });
  S.txs.forEach(t => {
    if (t.date) years.add(getFiscalYear(t.date));
  });
  return Array.from(years).sort((a, b) => b - a);
}

/* ================================================================
   AUTH STATE
================================================================ */
let accessToken = null;
let userEmail   = null;

/* シート名 -> 数値sheetId（行削除のbatchUpdateで必要）。ensureSheetsで取得 */
let sheetIdMap = {};

/* ================================================================
   BUDGET STATE
================================================================ */
let currentBudgetTab = 'court';
let editingBudgetRecordId = null;
let budgetCategoryType = 'income';
let currentFiscalYear = null;

/* ================================================================
   APP STATE
================================================================ */
let nid = 1;
let S = {
  txs:[], members:[], memberPeriods:[], feeRec:{}, feeRecs:[], pracCount:{}, pracCounts:[], categories:[],
  fee: { base:{ male:2000, female:2000, manager:1500, exec:500 }, adjs:[] },
  budget: { records:[], settings:[], categoryRecords:[] },
  carryoverRecords: [],
  acct: 'cash',
  type: 'income',
};
let trendChart    = null;
let currentLedger = 'cash';

/* ================================================================
   GOOGLE SIGN-IN
================================================================ */
window.addEventListener('load', () => {
  const waitGIS = setInterval(() => {
    if (typeof google !== 'undefined' && google.accounts) {
      clearInterval(waitGIS);
      initGIS();
    }
  }, 100);
});

function initGIS() {
  // URLハッシュにアクセストークンが含まれているか確認（リダイレクト後）
  const hashToken = parseTokenFromHash();
  if (hashToken) {
    accessToken = hashToken.token;
    // リダイレクト前に保存したメールアドレスを復元
    userEmail   = sessionStorage.getItem('pending_email') || '';
    sessionStorage.removeItem('pending_email');
    sessionStorage.setItem('gapi_token', JSON.stringify({
      token:  accessToken,
      email:  userEmail,
      expiry: Date.now() + (hashToken.expiresIn - 60) * 1000,
    }));
    // ハッシュをURLから除去（履歴に残さない）
    history.replaceState(null, '', location.pathname);
    startApp();
    return;
  }

  // sessionStorageに有効なトークンがあれば再利用
  tryRestoreToken();
}

function parseTokenFromHash() {
  const hash = location.hash.substring(1);
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const token  = params.get('access_token');
  const expires = parseInt(params.get('expires_in') || '3600');
  if (!token) return null;
  return { token, expiresIn: expires, email: '' };
}

function tryRestoreToken() {
  const saved = sessionStorage.getItem('gapi_token');
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj.expiry > Date.now()) {
        accessToken = obj.token;
        userEmail   = obj.email;
        startApp();
        return;
      }
    } catch(e) {
      sessionStorage.removeItem('gapi_token');
    }
  }
  showLoginScreen();
}

function showLoginScreen() {
  setLoading(false);
  document.getElementById('login-screen').style.display = 'flex';
  // Google One Tap ボタンをレンダリング（IDトークン取得用）
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: handleOneTap,
    auto_select: false,
  });
  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    { theme:'outline', size:'large', text:'signin_with', locale:'ja', shape:'pill' }
  );
}

function handleOneTap(response) {
  try {
    // 1. ペイロード部分（2番目のセグメント）を取得
    const base64Url = response.credential.split('.')[1];
    
    // 2. Base64URL から標準の Base64 形式に置換
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // 3. デコード（マルチバイト文字/日本語対応のため decodeURIComponent を使用）
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const payload = JSON.parse(jsonPayload);
    userEmail = payload.email;
    sessionStorage.setItem('pending_email', userEmail);
    
    // リダイレクト方式でアクセストークンを要求
    requestTokenViaRedirect();
  } catch (e) {
    console.error("IDトークンの解析に失敗しました:", e);
    toast("ログイン処理中にエラーが発生しました");
  }
}

function requestTokenViaRedirect() {
  const redirectUri = location.origin + location.pathname;
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'token',
    scope:         SCOPES,
    include_granted_scopes: 'true',
  });
  location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function showLoginError() {
  document.getElementById('login-error').style.display = 'block';
}

function signOut() {
  sessionStorage.removeItem('gapi_token');
  sessionStorage.removeItem('pending_email');
  accessToken = null;
  location.href = location.origin + location.pathname;
}

/* ================================================================
   SHEETS API HELPERS
================================================================ */
async function sheetsGet(range) {
  const url = `${API_BASE}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers:{ Authorization:`Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Sheets GET error: ${res.status}`);
  return (await res.json()).values || [];
}

async function sheetsAppend(sheetName, rows) {
  const url = `${API_BASE}/values/${encodeURIComponent(sheetName+'!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values: rows }),
  });
  if (!res.ok) throw new Error(`Sheets APPEND error: ${res.status}`);
  return res.json();
}

async function sheetsClear(sheetName) {
  const url = `${API_BASE}/values/${encodeURIComponent(sheetName+'!A2:Z9999')}:clear`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
  });
  if (!res.ok) throw new Error(`Sheets CLEAR error: ${res.status}`);
}

async function sheetsUpdate(range, values) {
  const url = `${API_BASE}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheets UPDATE error: ${res.status}`);
}

/* ================================================================
   行単位のCRUD
   前提: S.txs / S.members などの配列の並び順は、シートの行順と常に一致させる
   （並べ替えて表示する際は必ずコピーを作る。配列自体はappend順を保つ）。
   これにより「idから配列のindexを探す → row = index + 2」で対象行を特定でき、
   保存のたびにシート全体を洗い替えなくて済む（＝他ユーザーの同時編集を上書きしない）。
================================================================ */
function colLetter(colCount) {
  return String.fromCharCode(64 + colCount); // このアプリの全シートは列数<=26
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
  if (!res.ok) throw new Error(`Sheets DELETE ROW error: ${res.status}`);
}

async function ensureSheets() {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`,
    { headers:{ Authorization:`Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = new Error('スプレッドシートにアクセスできません');
    // 403/404はアカウントにシートの閲覧・編集権限がないケースがほとんど
    err.isAccessDenied = res.status === 403 || res.status === 404;
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
  }
}

/* ================================================================
   LOAD FROM SHEETS
================================================================ */
async function loadAll() {
  setLoading(true, 'データを読み込み中...');
  await ensureSheets();

  const [txRows, mRows, mpRows, frRows, pcRows, fsRows, catRows, budgetRecords, budgetSettings, budgetCategoryRecords, carryoverRows] = await Promise.all([
    sheetsGet(SH.TX      + '!A2:J'),
    sheetsGet(SH.MEMBERS + '!A2:D'),
    sheetsGet(SH.MEMBER_PERIODS + '!A2:F'),
    sheetsGet(SH.FEE_REC + '!A2:D'),
    sheetsGet(SH.PRAC    + '!A2:D'),
    sheetsGet(SH.FEE_SET + '!A2:F'),
    sheetsGet(SH.CATEGORIES + '!A2:D'),
    sheetsGet(SH.BUDGET + '!A2:H'),
    sheetsGet(SH.BUDGET_SETTINGS + '!A2:E'),
    sheetsGet(SH.BUDGET_CATEGORY_RECORDS + '!A2:G'),
    sheetsGet(SH.CARRYOVER + '!A2:E'),
  ]);

  S.txs = txRows
    .filter(r => r[0] && r[1] && r[2])  // id・date・typeが存在する行のみ
    .map(r => ({
      id:r[0]|0, date:String(r[1]), type:r[2], acct:r[3]||'cash',
      toAcct:r[4]||'', amount:Number(r[5])||0, desc:r[6]||'', classification:r[7]||'その他', cat:r[8]||'その他', note:r[9]||'',
    }));

  S.members = mRows
    .filter(r => r[0] && r[1])  // id・nameが存在する行のみ
    .map(r => ({ id:r[0]|0, name:String(r[1]), grade:r[2]||'' }));

  S.memberPeriods = mpRows
    .filter(r => r[0] && r[1] && r[2] && r[4])
    .map(r => ({
      id:r[0]|0,
      member_id:r[1]|0,
      start_ym:String(r[2]),
      end_ym:String(r[3]||''),
      attr:String(r[4])
    }));

  // S.feeRec / S.pracCount は画面表示・計算用の{ym: {member_id: 値}}のネスト構造。
  // S.feeRecs / S.pracCounts はシートの行順を保った配列で、個別の行のUPDATE/APPENDに使う。
  S.feeRec = {};
  S.feeRecs = frRows.map(r => {
    const ym = String(r[2]), mid = r[1]|0, paid = r[3]==='true' || r[3]===true || r[3]==='TRUE';
    if (!S.feeRec[ym]) S.feeRec[ym] = {};
    S.feeRec[ym][mid] = paid;
    return { id:r[0]|0, member_id:mid, ym, paid };
  });

  S.pracCount = {};
  S.pracCounts = pcRows.map(r => {
    const ym = String(r[2]), mid = r[1]|0, count = Number(r[3])||0;
    if (!S.pracCount[ym]) S.pracCount[ym] = {};
    S.pracCount[ym][mid] = count;
    return { id:r[0]|0, member_id:mid, ym, count };
  });

  S.fee = { base:{ male:2000, female:2000, manager:1500, exec:500 }, maxExec:2500, adjs:[] };
  fsRows.forEach(r => {
    if (r[3]==='base') S.fee.base[r[1]] = Number(r[2])||0;
    else if (r[3]==='maxExec') S.fee.maxExec = Number(r[2])||0;
    else S.fee.adjs.push({ id:r[0]|0, attr:r[1], amount:Number(r[2])||0, from:r[4], to:r[5] });
  });
  if (fsRows.length === 0) await saveFeeBase();

  S.categories = catRows
    .filter(r => r[0] && r[1] && r[2])
    .map(r => ({ type:r[0], classification:r[1], category:r[2], order:Number(r[3])||0 }))
    .sort((a,b) => a.order - b.order);

  S.budget.records = budgetRecords
    .filter(r => r[0] && r[1])
    .map(r => ({
      id:r[0]|0, date:String(r[1]), court_name:String(r[2]||''), court_condition:String(r[3]||''),
      hours:parseFloat(r[4])||0, price_per_hour:Number(r[5])||0, amount:Number(r[6])||0, remarks:r[7]||''
    }));

  S.budget.settings = budgetSettings
    .filter(r => r[0] && r[1] && r[2])
    .map(r => ({
      id:r[0]|0, court_name:String(r[1]), court_condition:String(r[2]),
      price_per_hour:Number(r[3])||0, remarks:r[4]||''
    }));

  S.budget.categoryRecords = budgetCategoryRecords
    .filter(r => r[0] && r[1])
    .map(r => ({
      id:r[0]|0, date:String(r[1]), type:String(r[2]||'expense'), classification:String(r[3]||''), category:String(r[4]||''),
      amount:Number(r[5])||0, remarks:r[6]||''
    }));

  S.carryoverRecords = carryoverRows
    .filter(r => r[0] && r[1])
    .map(r => ({
      fiscal_year: String(r[0]),
      date: String(r[1]),
      cash: Number(r[2])||0,
      bank: Number(r[3])||0,
      note: r[4]||'前年度繰越金'
    }));

  // idを主キーとして行を探すエンティティすべてを反映してnidを初期化する
  // （txs/membersだけを見ていると、他エンティティで既に使われているidと衝突し、
  //   誤った行を更新・削除してしまう恐れがある）
  const maxIdIn = arr => arr.reduce((m,x) => Math.max(m, x.id), 0);
  nid = Math.max(
    maxIdIn(S.txs),
    maxIdIn(S.members),
    maxIdIn(S.memberPeriods),
    maxIdIn(S.feeRecs),
    maxIdIn(S.pracCounts),
    maxIdIn(S.fee.adjs),
    maxIdIn(S.budget.records),
    maxIdIn(S.budget.settings),
    maxIdIn(S.budget.categoryRecords),
  ) + 1;

  setLoading(false);
}

/* ================================================================
   SAVE TO SHEETS
================================================================ */
// 保存を直列キューで実行する。同時に複数の保存が発生しても、後発の保存が
// 「実行中だから」と無視されて消えることがないようにする（以前は isSaving フラグで
// 実行中の呼び出しをまるごと捨てており、連続操作時に保存が抜け落ちることがあった）
let saveQueue = Promise.resolve();
let pendingSaves = 0;

function saveSheet(fn) {
  pendingSaves++;
  showSaveInd(true);
  const run = saveQueue.then(async () => {
    try { await fn(); }
    catch(e) { console.error(e); toast('保存に失敗しました。再試行してください。'); }
    finally {
      pendingSaves--;
      if (pendingSaves === 0) showSaveInd(false);
    }
  });
  saveQueue = run;
  return run;
}

function txToRow(t) {
  return [t.id, t.date, t.type, t.acct, t.toAcct||'', t.amount, t.desc, t.classification||'', t.cat, t.note||''];
}

function memberToRow(m) {
  return [m.id, m.name, m.grade];
}

function periodToRow(p) {
  return [p.id, p.member_id, p.start_ym, p.end_ym || '', p.attr];
}

function feeRecToRow(r) {
  return [r.id, r.member_id, r.ym, r.paid];
}

function pracCountToRow(r) {
  return [r.id, r.member_id, r.ym, r.count];
}

// FEE_SETシートはヘッダーの次、行2〜6が固定で「基本額×4属性 + 幹部上の最大月額」、
// 行7以降がユーザーが増減する一時調整(adjs)というレイアウト。
// 固定部分は範囲更新、adjsは追加・削除それぞれ該当行だけを操作する（シート全体は洗い替えない）
function feeBaseRows() {
  const rows = [];
  let rid = 1;
  Object.entries(S.fee.base).forEach(([attr,amt]) => rows.push([rid++,attr,amt,'base','','']));
  rows.push([rid++,'exec',S.fee.maxExec,'maxExec','','']);
  return rows;
}

function adjToRow(a) {
  return [a.id, a.attr, a.amount, 'adj', a.from, a.to];
}

const FEE_SET_ADJ_START_ROW = 7; // ヘッダー(1) + 固定5行(2〜6) の次

function saveFeeBase() {
  return saveSheet(() => sheetsUpdate(`${SH.FEE_SET}!A2:F6`, feeBaseRows()));
}

function budgetRecordToRow(r) {
  return [r.id, r.date, r.court_name, r.court_condition, r.hours, r.price_per_hour, r.amount, r.remarks||''];
}

function budgetSettingToRow(s) {
  return [s.id, s.court_name, s.court_condition, s.price_per_hour, s.remarks||''];
}

function showSaveInd(on) {
  const saveInd = document.getElementById('save-ind');
  const hbals = document.querySelector('.hbals');
  if (saveInd) {
    saveInd.style.display = on ? 'block' : 'none';
    saveInd.style.opacity = on ? '1' : '0';
  }
  if (hbals) {
    hbals.style.display = on ? 'none' : 'flex';
  }
}

/* ================================================================
   START APP
================================================================ */
async function startApp() {
  setLoading(true, 'データを読み込み中...');
  try {
    await loadAll();
    document.getElementById('main-app').style.display = 'flex';
    // DOMContentLoaded時点ではuserEmailが未確定のため、ここで確定後に表示を更新する
    const userNameEl = document.getElementById('user-name');
    if (userNameEl && userEmail) userNameEl.textContent = userEmail.split('@')[0];
    const today = new Date(), ym = toYM(today);
    document.getElementById('tx-date').value   = toYMD(today);
    document.getElementById('bs-date').value   = toYMD(today);
    document.getElementById('tr-date').value   = toYMD(today);
    document.getElementById('fee-month').value = ym;
    render();
    setType('income');
    initializeCategories();
    // DOMContentLoaded時点ではデータ未読み込みで選択肢が今年度のみになるため、
    // データ読み込み完了後に選択肢を再構築する（currentFiscalYearが既に決まっていれば上書きしない）
    initGlobalFiscalYear();
  } catch(e) {
    console.error(e);
    if (e.isAccessDenied) {
      // 権限のないアカウントなので、別アカウントで選び直せるようログイン画面に戻す
      sessionStorage.removeItem('gapi_token');
      sessionStorage.removeItem('pending_email');
      accessToken = null;
      showLoginScreen();
      showLoginError();
    } else {
      setLoading(true, 'データ読み込みに失敗しました。ページを再読み込みしてください。');
    }
  }
}

function setLoading(on, msg='') {
  const el = document.getElementById('loading-screen');
  el.style.display = on ? 'flex' : 'none';
  if (msg) document.getElementById('loading-msg').textContent = msg;
}

/* ================================================================
   UTIL
================================================================ */
const toYM   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
// ローカルタイムゾーン基準で YYYY-MM-DD を返す（toISOString()はUTCになるため使わない）
const toYMD  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const prevYM = ym => { const d=new Date(ym+'-01'); d.setMonth(d.getMonth()-1); return toYM(d); };
const fmt    = n => '¥' + Number(n).toLocaleString();
const fmtN   = n => Number(n).toLocaleString();

/* ================================================================
   NAVIGATION
================================================================ */
const PAGE_NAMES = ['dashboard','transactions','ledger','members','fees','budget','report'];

function showPage(n) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + n).classList.add('active');
  const idx = PAGE_NAMES.indexOf(n);
  document.querySelectorAll('.bnav-btn')[idx]?.classList.add('active');
  render();
  if (n === 'ledger') showLedger(currentLedger);
  if (n === 'report') renderChart();
  if (n === 'budget') {
    const today = new Date();
    document.getElementById('budget-month').value = toYM(today);
    renderBudget();
  }
  if (n === 'categories') renderCategoriesPage();
}

/* ================================================================
   CALC
================================================================ */
function calcBal() {
  let cash=0, bank=0;
  S.txs.forEach(t => {
    if (t.type==='income')
      { if(t.acct==='cash') cash+=t.amount; else bank+=t.amount; }
    else if (t.type==='expense')
      { if(t.acct==='cash') cash-=t.amount; else bank-=t.amount; }
    else if (t.type==='transfer') {
      if (t.acct==='cash') cash-=t.amount; else bank-=t.amount;
      if (t.toAcct==='cash') cash+=t.amount; else if (t.toAcct==='bank') bank+=t.amount;
    }
  });
  return { cash, bank, total:cash+bank };
}

function calcFee(attr, ym, pc) {
  const adj = S.fee.adjs.find(a => a.attr===attr && a.from<=ym && ym<=a.to);
  if (attr==='exec') {
    const per = adj ? adj.amount : S.fee.base.exec;
    const total = per * (pc||0);
    return Math.min(total, S.fee.maxExec||2500);
  }
  return adj ? adj.amount : (S.fee.base[attr]||0);
}

function getMemberAttrInMonth(memberId, ym) {
  const period = S.memberPeriods.find(p =>
    p.member_id === memberId &&
    p.start_ym <= ym &&
    (!p.end_ym || ym <= p.end_ym)
  );
  return period ? period.attr : null;
}

function getPrevMonth(ym) {
  const [year, month] = ym.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function getMemberStatus(memberId, currentYm) {
  const attr = getMemberAttrInMonth(memberId, currentYm);
  if (attr) return 'active';  // 現役

  // OB/OG判定：最後の期間の終了月が今月より前の部員
  const periods = S.memberPeriods.filter(p => p.member_id === memberId);
  if (periods.length === 0) return 'unknown';  // 期間が登録されていない

  const lastPeriod = periods.sort((a, b) => (b.end_ym || '9999').localeCompare(a.end_ym || '9999'))[0];
  if (lastPeriod.end_ym && lastPeriod.end_ym < currentYm) {
    return 'ob';  // OB/OG
  }

  return 'unknown';
}

function getMemberLastAttr(memberId) {
  const periods = S.memberPeriods.filter(p => p.member_id === memberId);
  if (periods.length === 0) return null;

  const lastPeriod = periods.sort((a, b) => (b.end_ym || b.start_ym).localeCompare(a.end_ym || a.start_ym))[0];
  return lastPeriod.attr;
}

function sortedMembers() {
  // 属性の正はmember_periods側にあるため、現時点の属性で第2ソートキーを求める
  const currentYm = toYM(new Date());
  return [...S.members].sort((a,b) => {
    const gd = GRADE_ORDER[parseInt(a.grade)] - GRADE_ORDER[parseInt(b.grade)];
    if (gd !== 0) return gd;
    const aOrder = ATTR_ORDER[getMemberAttrInMonth(a.id, currentYm)] ?? 99;
    const bOrder = ATTR_ORDER[getMemberAttrInMonth(b.id, currentYm)] ?? 99;
    return aOrder - bOrder;
  });
}

/* ================================================================
   RENDER ALL
================================================================ */
function render() {
  renderHdr(); renderDash(); renderTx(); renderMembers();
  renderFee(); renderFeeView(); renderReport();
}

/* ================================================================
   HEADER
================================================================ */
function renderHdr() {
  const { cash, bank, total } = calcBal();
  document.getElementById('h-cash').textContent  = fmt(cash);
  document.getElementById('h-bank').textContent  = fmt(bank);
  document.getElementById('h-total').textContent = fmt(total);
}

/* ================================================================
   DASHBOARD
================================================================ */
function renderDash() {
  const { cash, bank } = calcBal();
  let ym = toYM(new Date());
  const range = getFiscalYearRange(currentFiscalYear);

  // 当月が会計年度外なら会計年度内の最初の月を使用
  if (!range.includes(ym)) {
    ym = range[0];
  }

  let inc=0,exp=0,ci=0,co=0,bi=0,bo=0;
  S.txs.forEach(t => {
    if (!t.date || !t.date.startsWith(ym)) return;
    // 会計年度フィルタ追加
    if (!range.some(m => t.date.startsWith(m))) return;
    if (t.type==='income')  { inc+=t.amount; t.acct==='cash'?ci+=t.amount:bi+=t.amount; }
    if (t.type==='expense') { exp+=t.amount; t.acct==='cash'?co+=t.amount:bo+=t.amount; }
  });

  document.getElementById('dash-sg').innerHTML = `
    <div class="sc"><div class="lb"><span class="dot" style="background:var(--csh)"></span>現金残高</div><div class="vl text-income">${fmt(cash)}</div></div>
    <div class="sc"><div class="lb"><span class="dot" style="background:var(--bnk)"></span>銀行残高</div><div class="vl" style="color:var(--bnk)">${fmt(bank)}</div></div>
    <div class="sc"><div class="lb">今月収入</div><div class="vl text-income">${fmt(inc)}</div></div>
    <div class="sc"><div class="lb">今月支出</div><div class="vl text-expense">${fmt(exp)}</div></div>`;

  document.getElementById('acct-bd').innerHTML = `
    <div>
      <div class="text-sm font-semibold mb-7 flex flex-gap-5" style="color:var(--csh);align-items:center">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--csh);display:inline-block"></span>現金
      </div>
      <div class="flex flex-between text-sm p-4-0 border-b"><span class="text-secondary-color">収入</span><span class="text-income number-mono">${fmt(ci)}</span></div>
      <div class="flex flex-between text-sm p-4-0"><span class="text-secondary-color">支出</span><span class="text-expense number-mono">${fmt(co)}</span></div>
    </div>
    <div>
      <div class="text-sm font-semibold mb-7 flex flex-gap-5" style="color:var(--bnk);align-items:center">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--bnk);display:inline-block"></span>銀行預金
      </div>
      <div class="flex flex-between text-sm p-4-0 border-b"><span class="text-secondary-color">収入</span><span class="text-income number-mono">${fmt(bi)}</span></div>
      <div class="flex flex-between text-sm p-4-0"><span class="text-secondary-color">支出</span><span class="text-expense number-mono">${fmt(bo)}</span></div>
    </div>`;

  const fym = document.getElementById('fee-month')?.value || ym;
  const rec = S.feeRec[fym] || {};
  // 退部済み部員を分母・分子から除外するため、その月に在籍している部員に限定する
  const activeMembers = S.members.filter(m => getMemberAttrInMonth(m.id, fym) !== null);
  const tot = activeMembers.length;
  const paid = activeMembers.filter(m => rec[m.id]).length;
  const pct  = tot>0 ? Math.round(paid/tot*100) : 0;
  document.getElementById('fee-dash-text').textContent = `${paid}名 / ${tot}名 納入済み（${pct}%）`;
  document.getElementById('fee-prog').style.width = pct + '%';

  const recent = [...S.txs].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('recent-list').innerHTML = recent.length===0
    ? '<div class="empty">まだ取引がありません</div>'
    : recent.map(txRow).join('');
}

/* ================================================================
   TX ROW / RENDER
================================================================ */
function txRow(t) {
  if (!t || !t.date) return '';
  let acctBadge, amtStr, amtCls, catLabel;
  if (t.type === 'transfer') {
    acctBadge = `<span class="bdg transfer">振替</span>`;
    amtStr    = fmt(t.amount);
    amtCls    = 'transfer';
    catLabel  = `${t.acct==='cash'?'現金':'銀行'}→${t.toAcct==='cash'?'現金':'銀行'}`;
  } else {
    acctBadge = `<span class="bdg ${t.acct}">${t.acct==='cash'?'現金':'銀行'}</span>`;
    amtStr    = (t.type==='income'?'+':'-') + fmt(t.amount);
    amtCls    = t.type;
    catLabel  = t.classification ? `${escapeHtml(t.classification)} > ${escapeHtml(t.cat)}` : escapeHtml(t.cat);
  }
  // 日付を m/d 形式に変換
  const dateParts = t.date.slice(5).split('-');
  const dateLabel = dateParts.length === 2
    ? `${parseInt(dateParts[0])}/${parseInt(dateParts[1])}`
    : t.date.slice(5);

  return `<div class="txr">
    <div class="txr-row1">
      <span class="txdate">${dateLabel}</span>
      ${acctBadge}
      <span class="txcat">${catLabel}</span>
    </div>
    <div class="txr-row2">
      <span class="txdesc">${escapeHtml(t.desc)}</span>
      <span class="txamt ${amtCls}">${amtStr}</span>
      <button class="btn bs sm btn-sm-custom flex-shrink" onclick="openEditTx(${t.id})">編集</button>
      <button class="btn bd sm btn-sm-custom flex-shrink" onclick="delTx(${t.id})">削除</button>
    </div>
  </div>`;
}

/* ================================================================
   TYPE / ACCT TOGGLE
================================================================ */
function setType(t) {
  S.type = t;
  ['income','expense','transfer'].forEach(x =>
    document.getElementById('t-'+x).classList.toggle('on', x===t));
  document.getElementById('normal-fields').style.display   = t==='transfer' ? 'none'  : 'block';
  document.getElementById('transfer-fields').style.display = t==='transfer' ? 'block' : 'none';

  // 科目分類を type に基づいて更新
  if (t !== 'transfer') {
    const txCls = document.getElementById('tx-cls');
    if (txCls) {
      const classifications = [...new Set(S.categories.filter(c => c.type === t).map(c => c.classification))];
      txCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
      updateTxCategories();
    }
  }
}

function setAcct(a) {
  S.acct = a;
  document.getElementById('a-cash').classList.toggle('on', a==='cash');
  document.getElementById('a-bank').classList.toggle('on', a==='bank');
}

/* ================================================================
   CATEGORY SELECTION
================================================================ */
function initializeCategories() {
  // PC版の科目分類初期化
  const txCls = document.getElementById('tx-cls');
  if (txCls) {
    const classifications = [...new Set(S.categories.filter(c => c.type === 'income').map(c => c.classification))];
    txCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
    updateTxCategories();
  }

  // モバイル版の科目分類初期化
  const bsCls = document.getElementById('bs-cls');
  if (bsCls) {
    const classifications = [...new Set(S.categories.filter(c => c.type === 'income').map(c => c.classification))];
    bsCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
    updateBsCategories();
  }

  // 編集画面の科目分類初期化
  const etxCls = document.getElementById('etx-cls');
  if (etxCls) {
    const classifications = [...new Set(S.categories.filter(c => c.type === 'income').map(c => c.classification))];
    etxCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
  }
}

function updateTxCategories() {
  const cls = document.getElementById('tx-cls')?.value || '';
  const cats = S.categories.filter(c => c.type === S.type && c.classification === cls).sort((a, b) => a.order - b.order);
  const catSelect = document.getElementById('tx-cat');
  if (catSelect) {
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  }
}

function updateBsCategories() {
  const cls = document.getElementById('bs-cls')?.value || '';
  const cats = S.categories.filter(c => c.type === S.type && c.classification === cls).sort((a, b) => a.order - b.order);
  const catSelect = document.getElementById('bs-cat');
  if (catSelect) {
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  }
}

function updateEditCategories() {
  const cls = document.getElementById('etx-cls')?.value || '';
  const cats = S.categories.filter(c => c.type === S.type && c.classification === cls).sort((a, b) => a.order - b.order);
  const catSelect = document.getElementById('etx-cat');
  if (catSelect) {
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  }
}

/* ================================================================
   ADD / DELETE TX
================================================================ */
async function addTx() {
  let t;
  if (S.type==='transfer') {
    const date   = document.getElementById('tr-date').value;
    const amount = parseInt(document.getElementById('tr-amt').value);
    const from   = document.getElementById('tr-from').value;
    const to     = document.getElementById('tr-to').value;
    const desc   = document.getElementById('tr-desc').value.trim() || `${from==='cash'?'現金':'銀行'}→${to==='cash'?'現金':'銀行'}`;
    const note   = document.getElementById('tr-note').value.trim();
    if (!date)           { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (from===to)       { toast('移動元と移動先が同じです'); return; }
    t = { id:nid++, date, type:'transfer', acct:from, toAcct:to, amount, desc, cat:'振替', note };
    S.txs.push(t);
    ['tr-amt','tr-desc','tr-note'].forEach(id => document.getElementById(id).value='');
  } else {
    const date   = document.getElementById('tx-date').value;
    const amount = parseInt(document.getElementById('tx-amt').value);
    const desc   = document.getElementById('tx-desc').value.trim();
    const classification = document.getElementById('tx-cls').value;
    const cat    = document.getElementById('tx-cat').value;
    const note   = document.getElementById('tx-note').value.trim();
    if (!date)           { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (!desc)           { toast('摘要を入力してください'); return; }
    t = { id:nid++, date, type:S.type, acct:S.acct, amount, desc, classification, cat, note };
    S.txs.push(t);
    ['tx-amt','tx-desc','tx-note'].forEach(id => document.getElementById(id).value='');
  }
  toast('追加しました ✓');
  render();
  await saveSheet(() => sheetsAppend(SH.TX, [txToRow(t)]));
}

function openEditTx(id) {
  const t = S.txs.find(t => t.id === id);
  if (!t) return;
  document.getElementById('etx-id').value    = id;
  document.getElementById('etx-date').value  = t.date;
  document.getElementById('etx-amt').value   = t.amount;
  document.getElementById('etx-desc').value  = t.desc;
  document.getElementById('etx-note').value  = t.note || '';

  const isTransfer = t.type === 'transfer';
  document.getElementById('etx-normal').style.display   = isTransfer ? 'none' : 'block';
  document.getElementById('etx-transfer').style.display = isTransfer ? 'block' : 'none';

  if (isTransfer) {
    document.getElementById('etx-date').value    = t.date;
    document.getElementById('etx-amt').value     = t.amount;
    document.getElementById('etx-date-tr').value = t.date;
    document.getElementById('etx-amt-tr').value  = t.amount;
    document.getElementById('etx-tr-from').value = t.acct;
    document.getElementById('etx-tr-to').value   = t.toAcct;
    document.getElementById('etx-tr-desc').value = t.desc;
  } else {
    // 種別ボタン & S.type 更新
    S.type = t.type;
    ['income','expense'].forEach(tp => {
      document.getElementById('etx-t-' + tp).classList.toggle('on', t.type === tp);
    });
    // 口座ボタン
    ['cash','bank'].forEach(ac => {
      document.getElementById('etx-a-' + ac).classList.toggle('on', t.acct === ac);
    });
    // 科目分類と科目
    const etxCls = document.getElementById('etx-cls');
    const classifications = [...new Set(S.categories.filter(c => c.type === t.type).map(c => c.classification))];
    etxCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
    etxCls.value = t.classification || classifications[0];
    updateEditCategories();
    const catSelect = document.getElementById('etx-cat');
    catSelect.value = t.cat || catSelect.options[0]?.value || '';
  }
  openM('m-edit-tx');
}

async function saveEditTx() {
  const id = parseInt(document.getElementById('etx-id').value);
  const t  = S.txs.find(t => t.id === id);
  if (!t) return;

  const isTransfer = t.type === 'transfer';
  if (isTransfer) {
    const date   = document.getElementById('etx-date').value;
    const amount = parseInt(document.getElementById('etx-amt').value);
    const acct   = document.getElementById('etx-tr-from').value;
    const toAcct = document.getElementById('etx-tr-to').value;
    const desc   = document.getElementById('etx-tr-desc').value.trim() ||
               `${acct==='cash'?'現金':'銀行'}→${toAcct==='cash'?'現金':'銀行'}`;
    if (!date)              { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (acct === toAcct)    { toast('移動元と移動先が同じです'); return; }
    t.date = date; t.amount = amount; t.acct = acct; t.toAcct = toAcct; t.desc = desc;
  } else {
    const typeOn = ['income','expense'].find(tp =>
      document.getElementById('etx-t-' + tp).classList.contains('on'));
    const acctOn = ['cash','bank'].find(ac =>
      document.getElementById('etx-a-' + ac).classList.contains('on'));
    const date   = document.getElementById('etx-date').value;
    const amount = parseInt(document.getElementById('etx-amt').value);
    const desc   = document.getElementById('etx-desc').value.trim();
    if (!date)              { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (!desc)              { toast('摘要を入力してください'); return; }
    t.type   = typeOn || t.type;
    t.acct   = acctOn || t.acct;
    t.date   = date;
    t.amount = amount;
    t.desc   = desc;
    t.classification = document.getElementById('etx-cls').value;
    t.cat    = document.getElementById('etx-cat').value;
    t.note   = document.getElementById('etx-note').value.trim();
  }
  closeM('m-edit-tx');
  toast('更新しました ✓');
  render();
  const row = S.txs.findIndex(x => x.id === id) + 2;
  await saveSheet(() => sheetsUpdateRow(SH.TX, row, txToRow(t)));
}

async function delTx(id) {
  if (!confirm('この取引を削除しますか？')) return;
  const row = S.txs.findIndex(t => t.id === id) + 2;
  S.txs = S.txs.filter(t => t.id!==id);
  render();
  await saveSheet(() => sheetsDeleteRow(SH.TX, row));
  toast('削除しました');
}

/* ================================================================
   LEDGER
================================================================ */
function showLedger(type) {
  currentLedger = type;
  document.querySelectorAll('#ledger-tabs .pill').forEach((p,i) =>
    p.classList.toggle('active', ['cash','bank','cat','summary'][i]===type));
  const el = document.getElementById('ledger-content');
  if      (type==='cash')    el.innerHTML = renderCashLedger('cash','現金出納帳');
  else if (type==='bank')    el.innerHTML = renderCashLedger('bank','預金出納帳');
  else if (type==='cat')     el.innerHTML = renderCatLedger();
  else                       el.innerHTML = renderSummaryStatement();
}

function renderCashLedger(acct, title) {
  const range = getFiscalYearRange(currentFiscalYear);
  const txs = S.txs.filter(t => {
    // 会計年度フィルタ追加
    if (!t.date || !range.some(m => t.date.startsWith(m))) return false;
    if (t.type==='transfer') return t.acct===acct || t.toAcct===acct;
    return t.acct===acct;
  }).sort((a,b) => a.date.localeCompare(b.date));

  let bal=0, totalIn=0, totalOut=0, rows='';
  txs.forEach(t => {
    let inAmt=0, outAmt=0, label=t.desc;
    if (t.type==='income')  { inAmt=t.amount; bal+=t.amount; totalIn+=t.amount; }
    else if (t.type==='expense') { outAmt=t.amount; bal-=t.amount; totalOut+=t.amount; }
    else if (t.type==='transfer') {
      if (t.acct===acct)  { outAmt=t.amount; bal-=t.amount; totalOut+=t.amount; label=`振替出金→${t.toAcct==='cash'?'現金':'銀行'}`; }
      else                { inAmt=t.amount;  bal+=t.amount; totalIn+=t.amount;  label=`振替入金←${t.acct==='cash'?'現金':'銀行'}`; }
    }
    rows += `<tr>
      <td class="num">${t.date.replace(/-/g, '/')}</td>
      <td>${escapeHtml(t.cat)||'—'}</td>
      <td>${escapeHtml(label)}</td>
      <td class="num text-income">${inAmt?fmtN(inAmt):''}</td>
      <td class="num text-expense">${outAmt?fmtN(outAmt):''}</td>
      <td class="num ${bal>=0?'bal-pos':'bal-neg'}">${fmtN(bal)}</td>
      <td class="text-center"><button class="btn bs sm" onclick="openEditTx(${t.id})">編集</button></td>
      <td class="text-center"><button class="btn bd sm" onclick="if(confirm('削除しますか？'))delTx(${t.id})">削除</button></td>
    </tr>`;
  });
  return `<div class="card card-no-pad overflow-hidden">
    <div class="card-header">${title}</div>
    <div class="overflow-x-auto"><table class="ltbl">
      <thead><tr><th>日付</th><th>科目</th><th>摘要</th><th class="text-right">収入金額</th><th class="text-right">支出金額</th><th class="text-right">差引残高</th><th>編集</th><th>削除</th></tr></thead>
      <tbody>${rows||'<tr><td colspan="8" class="empty">データがありません</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3" class="font-bold">合計</td>
        <td class="num text-income">${fmtN(totalIn)}</td>
        <td class="num text-expense">${fmtN(totalOut)}</td>
        <td class="num">${fmtN(bal)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table></div></div>`;
}

function renderCatLedger() {
  const range = getFiscalYearRange(currentFiscalYear);
  const clss = {};
  S.txs.filter(t => t.type!=='transfer' && t.date && range.some(m => t.date.startsWith(m))).forEach(t => {
    if (!clss[t.classification]) clss[t.classification] = [];
    clss[t.classification].push(t);
  });
  let html = '';
  Object.keys(clss).sort().forEach(cls => {
    const txs = clss[cls].sort((a,b) => a.date.localeCompare(b.date));
    let total=0, rows='';
    txs.forEach(t => {
      const amt = t.type==='income' ? t.amount : -t.amount;
      total += amt;
      rows += `<tr>
        <td class="num">${t.date.replace(/-/g, '/')}</td><td>${escapeHtml(t.desc)}</td>
        <td class="num text-secondary">${escapeHtml(t.classification)} > ${escapeHtml(t.cat)}</td>
        <td><span class="bdg ${t.acct}">${t.acct==='cash'?'現金':'銀行'}</span></td>
        <td class="num ${t.type==='income'?'text-income':'text-expense'}">${t.type==='income'?'+':'-'}${fmtN(t.amount)}</td>
      </tr>`;
    });
    html += `<div class="card mb-10 card-no-pad overflow-hidden">
      <div class="flex flex-between card-header">
        <span>${escapeHtml(cls)}</span>
        <span class="number-mono ${total>=0?'text-income':'text-expense'}">${total>=0?'+':''}${fmtN(total)}</span>
      </div>
      <div class="overflow-x-auto"><table class="ltbl">
        <thead><tr><th>日付</th><th>摘要</th><th class="text-center">科目</th><th>口座</th><th class="text-right">金額</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  });
  return html || '<div class="empty">データがありません</div>';
}

function renderSummaryStatement() {
  let incTotal=0, expTotal=0;
  const catInc={}, catExp={};
  S.txs.filter(t => t.type!=='transfer').forEach(t => {
    if (t.type==='income')  { catInc[t.cat]=(catInc[t.cat]||0)+t.amount; incTotal+=t.amount; }
    else                    { catExp[t.cat]=(catExp[t.cat]||0)+t.amount; expTotal+=t.amount; }
  });
  const incRows = Object.keys(catInc).sort().map(c =>
    `<tr><td style="padding-left:24px">${escapeHtml(c)}</td><td class="num text-income">${fmtN(catInc[c])}</td></tr>`).join('');
  const expRows = Object.keys(catExp).sort().map(c =>
    `<tr><td class="pl-24">${escapeHtml(c)}</td><td class="num text-expense">${fmtN(catExp[c])}</td></tr>`).join('');
  const net = incTotal - expTotal;
  return `<div class="card card-no-pad overflow-hidden">
    <div class="card-header">収支計算書（全期間）</div>
    <div class="overflow-x-auto"><table class="ltbl"><tbody>
      <tr><td class="font-bold bg-income p-8-14">【収入の部】</td><td class="num font-bold bg-income">${fmtN(incTotal)}</td></tr>
      ${incRows}
      <tr><td class="font-bold bg-expense p-8-14">【支出の部】</td><td class="num font-bold bg-expense">${fmtN(expTotal)}</td></tr>
      ${expRows}
      <tr style="border-top:2px solid var(--bdr)">
        <td class="font-bold" style="font-size:15px;padding:12px 14px">当期収支差額</td>
        <td class="num font-bold ${net>=0?'text-income':'text-expense'}" style="font-size:15px">${net>=0?'+':''}${fmtN(net)}</td>
      </tr>
    </tbody></table></div></div>`;
}

/* ================================================================
   MEMBERS
================================================================ */
const badge     = (cls,lbl) => `<span class="bdg ${cls}">${lbl}</span>`;
const attrBadge = attr => badge(attr, ATTR_L[attr]);
const obBadge   = () => badge('ob', 'OB/OG');

function renderMembers() {
  const fa = document.getElementById('f-attr')?.value  || '';
  const fg = document.getElementById('f-grade')?.value || '';
  const today = new Date();
  const currentYm = toYM(today);

  let ms   = sortedMembers();

  // フィルタリング
  if (fa) ms = ms.filter(m => {
    const status = getMemberStatus(m.id, currentYm);
    if (fa === 'ob') {
      return status === 'ob';
    } else {
      const attr = getMemberAttrInMonth(m.id, currentYm);
      return attr === fa;
    }
  });

  // 学年でフィルター
  if (fg) ms = ms.filter(m => m.grade===fg);

  const tb = document.getElementById('m-tbody');
  if (!tb) return;

  tb.innerHTML = ms.length===0
    ? '<tr><td colspan="5" class="empty">部員がいません</td></tr>'
    : ms.map(m => {
        const currentAttr = getMemberAttrInMonth(m.id, currentYm);
        const status = getMemberStatus(m.id, currentYm);

        let attrDisplay;
        if (status === 'ob') {
          attrDisplay = obBadge();
        } else if (currentAttr) {
          attrDisplay = attrBadge(currentAttr);
        } else {
          attrDisplay = '<span style="color:var(--tx3)">-</span>';
        }

        return `<tr class="member-row" id="member-row-${m.id}">
          <td class="text-center"><input type="checkbox" class="member-checkbox" value="${m.id}" onchange="updateMemberRowStyle(${m.id}); updateBulkButtons()"></td>
          <td class="text-center text-secondary-color">${m.grade}</td>
          <td class="font-semibold">${escapeHtml(m.name)}</td>
          <td class="text-center">${attrDisplay}</td>
          <td class="text-center"><button class="btn bs sm" onclick="openEdit(${m.id})">編集</button></td>
        </tr>`;
      }).join('');
  updateBulkButtons();
}

function updateMemberRowStyle(memberId) {
  const row = document.getElementById(`member-row-${memberId}`);
  const checkbox = row?.querySelector('.member-checkbox');
  if (row && checkbox?.checked) {
    row.classList.add('member-row-selected');
  } else if (row) {
    row.classList.remove('member-row-selected');
  }
}

async function addMember() {
  const firstName = document.getElementById('ma-first-name').value.trim();
  const lastName  = document.getElementById('ma-last-name').value.trim();
  const grade     = document.getElementById('ma-grade').value;
  const attr      = document.getElementById('ma-attr').value;
  const startYm   = document.getElementById('ma-start-ym').value;
  if (!firstName) { toast('姓を入力してください'); return; }
  if (!lastName)  { toast('名を入力してください'); return; }
  if (!startYm)   { toast('入部月を入力してください'); return; }
  const name = `${firstName} ${lastName}`;
  const newMemberId = nid++;
  // 属性の正はmember_periods側で持つため、member自体にはattrを持たせない
  const m = { id:newMemberId, name, grade };
  S.members.push(m);

  // 期間情報を追加
  const p = { id: nid++, member_id: newMemberId, start_ym: startYm, end_ym: '', attr: attr };
  S.memberPeriods.push(p);

  document.getElementById('ma-first-name').value = '';
  document.getElementById('ma-last-name').value = '';
  document.getElementById('ma-start-ym').value = '';
  closeM('m-add'); toast('追加しました ✓');
  render();
  await Promise.all([
    saveSheet(() => sheetsAppend(SH.MEMBERS, [memberToRow(m)])),
    saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, [periodToRow(p)])),
  ]);
}

function openEdit(id) {
  const m = S.members.find(m => m.id===id); if (!m) return;
  document.getElementById('me-id').value = id;
  const [firstName, lastName] = (m.name + ' ').split(' ');
  document.getElementById('me-first-name').value = firstName;
  document.getElementById('me-last-name').value = lastName.trim();
  document.getElementById('me-grade').value = m.grade;

  // 現在の属性を表示
  const today = new Date();
  const currentYm = toYM(today);
  const currentAttr = getMemberAttrInMonth(m.id, currentYm);
  if (currentAttr) {
    document.getElementById('me-current-attr').innerHTML = attrBadge(currentAttr);
    document.getElementById('new-period-attr').value = currentAttr;
  } else {
    document.getElementById('me-current-attr').innerHTML = '<span style="color:var(--tx3)">未設定</span>';
    document.getElementById('new-period-attr').value = 'male';
  }

  switchEditTab('basic');
  renderMemberPeriods(id);
  openM('m-edit');
}

function switchEditTab(tab) {
  const tabBasic = document.getElementById('tab-basic');
  const tabPeriods = document.getElementById('tab-periods');
  const contentBasic = document.getElementById('tab-basic-content');
  const contentPeriods = document.getElementById('tab-periods-content');

  if (tab === 'basic') {
    tabBasic?.classList.remove('bs');
    tabBasic?.classList.add('bp');
    tabPeriods?.classList.remove('bp');
    tabPeriods?.classList.add('bs');
    contentBasic.style.display = 'block';
    contentPeriods.style.display = 'none';
  } else {
    tabBasic?.classList.remove('bp');
    tabBasic?.classList.add('bs');
    tabPeriods?.classList.remove('bs');
    tabPeriods?.classList.add('bp');
    contentBasic.style.display = 'none';
    contentPeriods.style.display = 'block';
  }
}

function renderMemberPeriods(memberId) {
  const periods = S.memberPeriods.filter(p => p.member_id === memberId);
  const el = document.getElementById('periods-list');

  if (periods.length === 0) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:12px;margin-bottom:12px">期間がありません</div>';
    return;
  }

  el.innerHTML = periods.map(p => `
    <div style="margin-bottom:12px;padding:10px;background:var(--sur);border-radius:6px;border:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--tx2);margin-bottom:4px">${p.start_ym}${p.end_ym ? '〜' + p.end_ym : '〜継続中'}</div>
          <div style="font-weight:600">${ATTR_L[p.attr]}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn bs sm" onclick="openEditPeriod(${p.id})">編集</button>
          <button class="btn bd sm" onclick="deleteMemberPeriod(${p.id})">削除</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function addMemberPeriod() {
  const memberId = parseInt(document.getElementById('me-id').value);
  const startYm = document.getElementById('new-period-start').value;
  const endYm = document.getElementById('new-period-end').value;
  const attr = document.getElementById('new-period-attr').value;
  const btn = document.getElementById('new-period-btn');
  const editingPeriodId = btn.dataset.editingPeriodId ? parseInt(btn.dataset.editingPeriodId) : null;

  if (!startYm) { toast('開始月を入力してください'); return; }
  if (endYm && startYm > endYm) { toast('開始月と終了月の順序が正しくありません'); return; }

  if (editingPeriodId) {
    // 編集モード：既存期間を更新
    // 期間重複チェック（編集対象を除く）
    const overlapping = S.memberPeriods.find(p =>
      p.member_id === memberId &&
      p.id !== editingPeriodId &&
      p.start_ym <= (endYm || startYm) &&
      (!p.end_ym || p.end_ym >= startYm)
    );

    if (overlapping) {
      toast('指定された期間は既存の期間と重複しています');
      return;
    }

    const period = S.memberPeriods.find(p => p.id === editingPeriodId);
    if (period) {
      period.start_ym = startYm;
      period.end_ym = endYm || '';
      period.attr = attr;
    }
    toast('更新しました ✓');
    cancelEditPeriod();
    renderMemberPeriods(memberId);
    if (period) {
      const row = S.memberPeriods.findIndex(p => p.id === editingPeriodId) + 2;
      await saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(period)));
    }
    return;
  } else {
    // 追加モード：新しい期間を追加
    // 新しい期間の開始月より前で、終了月がない期間を自動で終了させる
    const continuingPeriods = S.memberPeriods.filter(p =>
      p.member_id === memberId &&
      p.start_ym < startYm &&
      !p.end_ym
    );

    // 期間重複チェック（自動終了される期間を除く）
    const overlapping = S.memberPeriods.find(p =>
      p.member_id === memberId &&
      !continuingPeriods.some(cp => cp.id === p.id) &&
      p.start_ym <= (endYm || startYm) &&
      (!p.end_ym || p.end_ym >= startYm)
    );

    if (overlapping) {
      toast('指定された期間は既存の期間と重複しています');
      return;
    }

    // 最後の継続中の期間を終了させる
    let closedPeriod = null;
    if (continuingPeriods.length > 0) {
      const lastContinuingPeriod = continuingPeriods.sort((a, b) => b.start_ym.localeCompare(a.start_ym))[0];
      const prevMonth = getPrevMonth(startYm);
      lastContinuingPeriod.end_ym = prevMonth;
      closedPeriod = lastContinuingPeriod;
      toast(`${ATTR_L[lastContinuingPeriod.attr]}の終了月を${prevMonth}に自動設定しました`);
    }

    const newPeriod = { id: nid++, member_id: memberId, start_ym: startYm, end_ym: endYm || '', attr: attr };
    S.memberPeriods.push(newPeriod);
    document.getElementById('new-period-start').value = '';
    document.getElementById('new-period-end').value = '';
    document.getElementById('new-period-attr').value = 'male';
    toast('期間を追加しました ✓');

    renderMemberPeriods(memberId);
    const ops = [saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, [periodToRow(newPeriod)]))];
    if (closedPeriod) {
      const closedRow = S.memberPeriods.findIndex(p => p.id === closedPeriod.id) + 2;
      ops.push(saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, closedRow, periodToRow(closedPeriod))));
    }
    await Promise.all(ops);
  }
}

async function deleteMemberPeriod(periodId) {
  if (!confirm('この期間を削除しますか？')) return;
  const memberId = parseInt(document.getElementById('me-id').value);
  const row = S.memberPeriods.findIndex(p => p.id === periodId) + 2;
  S.memberPeriods = S.memberPeriods.filter(p => p.id !== periodId);
  toast('削除しました');
  renderMemberPeriods(memberId);
  await saveSheet(() => sheetsDeleteRow(SH.MEMBER_PERIODS, row));
}

function openEditPeriod(periodId) {
  const period = S.memberPeriods.find(p => p.id === periodId);
  if (!period) return;

  // 入力欄に値を入力
  document.getElementById('new-period-start').value = period.start_ym;
  document.getElementById('new-period-end').value = period.end_ym || '';
  document.getElementById('new-period-attr').value = period.attr;

  // 編集モードに切り替え
  const btn = document.getElementById('new-period-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  btn.textContent = '保存';
  btn.dataset.editingPeriodId = periodId;
  cancelBtn.style.display = 'flex';

  // スクロールして入力欄を見やすく
  document.getElementById('new-period-start').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('new-period-start').focus();
}

function cancelEditPeriod() {
  // 入力欄をクリア
  document.getElementById('new-period-start').value = '';
  document.getElementById('new-period-end').value = '';
  document.getElementById('new-period-attr').value = 'male';

  // 追加モードに戻す
  const btn = document.getElementById('new-period-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  btn.textContent = '期間を追加';
  delete btn.dataset.editingPeriodId;
  cancelBtn.style.display = 'none';
}

async function saveMember() {
  const id = parseInt(document.getElementById('me-id').value);
  const m  = S.members.find(m => m.id===id); if (!m) return;
  const firstName = document.getElementById('me-first-name').value.trim();
  const lastName  = document.getElementById('me-last-name').value.trim();
  if (!firstName) { toast('姓を入力してください'); return; }
  if (!lastName)  { toast('名を入力してください'); return; }
  m.name  = `${firstName} ${lastName}`;
  m.grade = document.getElementById('me-grade').value;
  closeM('m-edit'); toast('更新しました ✓');
  render();
  const row = S.members.findIndex(x => x.id === id) + 2;
  await saveSheet(() => sheetsUpdateRow(SH.MEMBERS, row, memberToRow(m)));
}

// 部員は削除せず、在籍中の期間を終了させて「退部」扱いにする
// （会計記録・練習回数等が孤児化し、部費回収率が実態と乖離するのを防ぐため）
async function deleteMember() {
  const id = parseInt(document.getElementById('me-id').value);
  const m  = S.members.find(m => m.id===id);
  const openPeriod = S.memberPeriods.find(p => p.member_id === id && !p.end_ym);
  if (!openPeriod) { toast('この部員は既に退部済みです'); return; }
  if (!confirm(`「${m?.name}」を退部にしますか？（部員情報や会計記録は保持されます）`)) return;

  const prevMonth = getPrevMonth(toYM(new Date()));
  openPeriod.end_ym = prevMonth;
  closeM('m-edit'); toast('退部にしました');
  render();
  const row = S.memberPeriods.findIndex(p => p.id === openPeriod.id) + 2;
  await saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(openPeriod)));
}

/* ===== BULK OPERATIONS ===== */
function getSelectedMembers() {
  const checkboxes = document.querySelectorAll('.member-checkbox:checked');
  return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

function updateBulkButtons() {
  const selected = getSelectedMembers();
  const changeBtn = document.getElementById('bulk-change-btn');
  const deleteBtn = document.getElementById('bulk-delete-btn');
  if (changeBtn) changeBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
  if (deleteBtn) deleteBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.member-checkbox').forEach(cb => {
    cb.checked = checked;
    const memberId = parseInt(cb.value);
    updateMemberRowStyle(memberId);
  });
  updateBulkButtons();
}

function handleBulkAddFile(event) {
  const files = event.target?.files || event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file.name.toLowerCase().endsWith('.csv')) {
    toast('CSVファイルを選択してください');
    return;
  }
  readBulkAddFile(file);
}

function readBulkAddFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      document.getElementById('bulk-members-text').value = text;
      toast('CSVファイルを読み込みました ✓');
    } catch (err) {
      toast('ファイルの読み込みに失敗しました');
      console.error(err);
    }
  };
  reader.onerror = () => {
    toast('ファイルの読み込みに失敗しました');
  };
  reader.readAsText(file);
}

async function bulkAddMembers() {
  const text = document.getElementById('bulk-members-text').value.trim();
  if (!text) { toast('入力してください'); return; }
  const lines = text.split('\n').filter(l => l.trim());
  let added = 0;

  // 属性の日本語⇔英語マッピング
  const attrMap = {
    '男プレ': 'male',
    '女プレ': 'female',
    'マネージャー': 'manager',
    '幹部上': 'exec'
  };

  const today = new Date();
  const currentYm = toYM(today);
  const newMembers = [];
  const newPeriods = [];

  for (const line of lines) {
    const [firstName, lastName, grade, attrInput] = line.split(',').map(s => s.trim());
    if (!firstName || !lastName || !grade || !attrInput) {
      toast(`形式が違う行があります: ${line}`);
      return;
    }
    if (!['26','25','24','23','22','21'].includes(grade)) {
      toast(`学年が不正です: ${grade}`);
      return;
    }

    // 属性を日本語から英語コードに変換
    const attr = attrMap[attrInput] || attrInput;
    if (!['male','female','manager','exec'].includes(attr)) {
      toast(`属性が不正です: ${attrInput}`);
      return;
    }

    const name = `${firstName} ${lastName}`;
    const newMemberId = nid++;
    // 属性の正はmember_periods側で持つため、member自体にはattrを持たせない
    const m = { id:newMemberId, name, grade };
    S.members.push(m);
    newMembers.push(m);

    // memberPeriodsに期間を追加
    const p = { id: nid++, member_id: newMemberId, start_ym: currentYm, end_ym: '', attr: attr };
    S.memberPeriods.push(p);
    newPeriods.push(p);

    added++;
  }

  closeM('m-bulk-add');
  document.getElementById('bulk-members-text').value = '';
  toast(`${added}名追加しました ✓`);
  render();
  await Promise.all([
    saveSheet(() => sheetsAppend(SH.MEMBERS, newMembers.map(memberToRow))),
    saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, newPeriods.map(periodToRow))),
  ]);
}

function bulkChangeAttr() {
  const selected = getSelectedMembers();
  if (selected.length === 0) { toast('部員を選択してください'); return; }
  const preview = document.getElementById('bulk-change-preview');
  const names = selected.map(id => S.members.find(m => m.id===id)?.name).join(', ');
  preview.textContent = `選択中の部員: ${names}`;
  openM('m-bulk-change-attr');
}

async function confirmBulkChangeAttr() {
  const selected = getSelectedMembers();
  const newAttr = document.getElementById('bulk-change-to-attr').value;
  const startYm = document.getElementById('bulk-change-start-ym').value;

  if (!newAttr) { toast('属性を選択してください'); return; }
  if (!startYm) { toast('開始月を入力してください'); return; }

  let addedCount = 0;
  const closedPeriods = [];
  const newPeriods = [];
  selected.forEach(id => {
    // 新しい期間の開始月より前で、終了月がない期間を自動で終了させる
    const continuingPeriods = S.memberPeriods.filter(p =>
      p.member_id === id &&
      p.start_ym < startYm &&
      !p.end_ym
    );

    if (continuingPeriods.length > 0) {
      const lastContinuingPeriod = continuingPeriods.sort((a, b) => b.start_ym.localeCompare(a.start_ym))[0];
      const prevMonth = getPrevMonth(startYm);
      lastContinuingPeriod.end_ym = prevMonth;
      closedPeriods.push(lastContinuingPeriod);
    }

    // 新しい期間を追加
    const p = { id: nid++, member_id: id, start_ym: startYm, end_ym: '', attr: newAttr };
    S.memberPeriods.push(p);
    newPeriods.push(p);
    addedCount++;
  });

  closeM('m-bulk-change-attr');
  document.getElementById('bulk-change-start-ym').value = '';
  document.getElementById('bulk-change-to-attr').value = '';
  toast(`${addedCount}名の期間を追加しました ✓`);
  render();
  const ops = [saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, newPeriods.map(periodToRow)))];
  closedPeriods.forEach(cp => {
    const row = S.memberPeriods.findIndex(p => p.id === cp.id) + 2;
    ops.push(saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(cp))));
  });
  await Promise.all(ops);
}

// 部員は削除せず、在籍中の期間を終了させて「退部」扱いにする（deleteMember()と同じ方針）
async function bulkDelete() {
  const selected = getSelectedMembers();
  if (selected.length === 0) { toast('部員を選択してください'); return; }

  const prevMonth = getPrevMonth(toYM(new Date()));
  const targets = selected
    .map(id => ({ id, openPeriod: S.memberPeriods.find(p => p.member_id === id && !p.end_ym) }))
    .filter(t => t.openPeriod);
  if (targets.length === 0) { toast('選択した部員は既に退部済みです'); return; }

  const names = targets.map(t => S.members.find(m => m.id===t.id)?.name).join(', ');
  if (!confirm(`以下の${targets.length}名を退部にしますか？（部員情報や会計記録は保持されます）\n${names}`)) return;

  targets.forEach(t => { t.openPeriod.end_ym = prevMonth; });
  toast(`${targets.length}名を退部にしました`);
  render();
  await Promise.all(targets.map(t => {
    const row = S.memberPeriods.findIndex(p => p.id === t.openPeriod.id) + 2;
    return saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(t.openPeriod)));
  }));
}

/* ================================================================
   FEES
================================================================ */
function renderFee() {
  let ym = document.getElementById('fee-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);
  if (!range.includes(ym)) {
    ym = range[0];
    document.getElementById('fee-month').value = ym;
  }

  if (!S.feeRec[ym]) {
    S.feeRec[ym] = {};
    S.members.forEach(m => {
      S.feeRec[ym][m.id] = false;
    });
  }
  if (!S.pracCount[ym]) S.pracCount[ym] = {};

  // フィルター値を取得
  const fa = document.getElementById('fee-f-attr')?.value  || '';
  const fg = document.getElementById('fee-f-grade')?.value || '';

  // フィルタリング
  let members = sortedMembers();
  if (fa) members = members.filter(m => {
    const attr = getMemberAttrInMonth(m.id, ym);
    return attr === fa;
  });
  if (fg) members = members.filter(m => m.grade === fg);

  const rec=S.feeRec[ym], pc=S.pracCount[ym];
  let paid=0,unpaid=0,coll=0,rem=0;
  members.forEach(m => {
    const attr = getMemberAttrInMonth(m.id, ym);

    // その月に該当する属性がない場合はスキップ（期間外）
    if (!attr) return;

    const fee = calcFee(attr, ym, pc[m.id]||0);
    if (rec[m.id]) { paid++; coll+=fee; } else { unpaid++; rem+=fee; }
  });
  document.getElementById('fp-c').textContent = paid;
  document.getElementById('fu-c').textContent = unpaid;
  document.getElementById('fc-a').textContent = fmt(coll);
  document.getElementById('fr-a').textContent = fmt(rem);

  const tb = document.getElementById('fee-tbody'); if (!tb) return;
  tb.innerHTML = members.map((m, idx) => {
    const attr = getMemberAttrInMonth(m.id, ym);

    // その月に該当する属性がない場合は表示しない（期間外）
    if (!attr) return '';

    const isPaid = !!rec[m.id];
    const fee    = calcFee(attr, ym, pc[m.id]||0);
    const pi = attr==='exec'
      ? `<input type="number" name="practice-count" class="practice-input" data-member-id="${m.id}" data-month="${ym}" min="0" max="31" value="${pc[m.id]||0}"
           style="width:40px;padding:8px;border:1px solid var(--bdr);border-radius:6px;font-size:16px;text-align:center"
           autocomplete="off"
           onchange="setPrac(${m.id},'${ym}',this.value)">`
      : `<span class="text-tertiary text-sm text-center">—</span>`;
    return `<tr>
      <td class="text-tertiary">${m.grade}<br><span class="text-amount">${escapeHtml(m.name)}</span></td>
      <td>${attrBadge(attr)}</td>
      <td class="text-center">${pi}</td>
      <td class="text-right amount-text">${fmt(fee)}</td>
      <td class="text-center">
        <button class="btn sm ${getPaidStatusClasses(isPaid)} btn-min-width"
          onclick="toggleFee(${m.id},'${ym}')">${isPaid?'✓ 済み':'✕ 未納'}</button>
      </td>
    </tr>`;
  }).join('');
  renderExecUnpaid();
}

async function setPrac(id, ym, v) {
  const count = parseInt(v)||0;
  if (!S.pracCount[ym]) S.pracCount[ym] = {};
  S.pracCount[ym][id] = count;

  if (!S.feeRec[ym]) {
    S.feeRec[ym] = {};
    sortedMembers().forEach(m => {
      S.feeRec[ym][m.id] = false;
    });
  }

  renderFee();

  const idx = S.pracCounts.findIndex(r => r.member_id === id && r.ym === ym);
  if (idx >= 0) {
    const rec = S.pracCounts[idx];
    rec.count = count;
    await saveSheet(() => sheetsUpdateRow(SH.PRAC, idx + 2, pracCountToRow(rec)));
  } else {
    const rec = { id: nid++, member_id: id, ym, count };
    S.pracCounts.push(rec);
    await saveSheet(() => sheetsAppend(SH.PRAC, [pracCountToRow(rec)]));
  }
}

async function toggleFee(id, ym) {
  if (!S.feeRec[ym]) S.feeRec[ym] = {};
  const paid = !S.feeRec[ym][id];
  S.feeRec[ym][id] = paid;
  renderFee(); renderDash();

  const idx = S.feeRecs.findIndex(r => r.member_id === id && r.ym === ym);
  if (idx >= 0) {
    const rec = S.feeRecs[idx];
    rec.paid = paid;
    await saveSheet(() => sheetsUpdateRow(SH.FEE_REC, idx + 2, feeRecToRow(rec)));
  } else {
    const rec = { id: nid++, member_id: id, ym, paid };
    S.feeRecs.push(rec);
    await saveSheet(() => sheetsAppend(SH.FEE_REC, [feeRecToRow(rec)]));
  }
}

function renderExecUnpaid() {
  const el = document.getElementById('exec-unpaid-wrap'); if (!el) return;
  const today = new Date();
  const currentYm = toYM(today);
  const execMembers = sortedMembers().filter(m => getMemberAttrInMonth(m.id, currentYm) === 'exec');
  if (execMembers.length===0) { el.innerHTML='<div class="empty">幹部上の部員がいません</div>'; return; }

  const months = [...new Set(Object.keys(S.feeRec))].sort();
  const data   = {};
  execMembers.forEach(m => {
    const unpaid = {};
    months.forEach(ym => {
      if (S.feeRec[ym]?.[m.id]===false) {
        const pc  = (S.pracCount[ym]||{})[m.id]||0;
        const fee = calcFee('exec', ym, pc);
        if (fee > 0) unpaid[ym] = fee;
      }
    });
    if (Object.keys(unpaid).length>0) data[m.id] = unpaid;
  });

  const active = execMembers.filter(m => data[m.id]);
  if (active.length===0) {
    el.innerHTML = `<div class="card"><div style="text-align:center;color:var(--grn);padding:20px;font-size:13px">✓ 未納の幹部上はいません</div></div>`;
    return;
  }

  const cols = [...new Set(active.flatMap(m => Object.keys(data[m.id])))].sort();
  const thead = `<tr><th>学年</th>${cols.map(ym=>`<th>${ym}</th>`).join('')}<th>合計</th></tr>`;
  const tbody = active.map(m => {
    let total=0;
    const cells = cols.map(ym => {
      const fee = data[m.id]?.[ym];
      if (fee!==undefined&&fee>0) { total+=fee; return `<td>${fmtN(fee)}</td>`; }
      return `<td class="text-tertiary">—</td>`;
    }).join('');
    return `<tr>
      <td class="text-tertiary">${m.grade}<br><span class="text-amount">${escapeHtml(m.name)}</span></td>
      ${cells}
      <td class="total-col">${fmtN(total)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="card card-no-pad overflow-hidden">
    <div class="unp-wrap"><table class="unp-tbl min-w-full">
      <thead>${thead}</thead><tbody>${tbody}</tbody>
    </table></div></div>`;
}

/* ================================================================
   FEE SETTINGS
================================================================ */
function renderFeeView() {
  const ym = toYM(new Date());
  document.getElementById('fee-setting-view').innerHTML =
    ['male','female','manager','exec'].map(attr => {
      const adj  = S.fee.adjs.find(a => a.attr===attr && a.from<=ym && ym<=a.to);
      const base = attr==='exec' ? `${fmt(S.fee.base.exec)}/回` : fmt(S.fee.base[attr]);
      const adjHtml = adj
        ? `<div style="margin-top:4px;font-size:11px;color:var(--amb);background:var(--amb-l);padding:2px 7px;border-radius:4px">
             調整中: ${fmt(adj.amount)}${attr==='exec'?'/回':''}
           </div>` : '';
      return `<div class="fat-c">
        <div style="margin-bottom:6px">${attrBadge(attr)}</div>
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:500">${base}</div>
        ${attr==='exec'?'<div style="font-size:10px;color:var(--tx3)">回数×単価</div>':''}
        ${adjHtml}
      </div>`;
    }).join('');
}

function openFeeModal() {
  const b = S.fee.base;
  ['male','female','manager','exec'].forEach(k =>
    document.getElementById('fs-'+k).value = b[k]);
  document.getElementById('fs-max-exec').value = S.fee.maxExec || 2500;
  renderAdjList(); openM('m-fee');
}

async function saveFee() {
  S.fee.base = {
    male:    parseInt(document.getElementById('fs-male').value)    || 0,
    female:  parseInt(document.getElementById('fs-female').value)  || 0,
    manager: parseInt(document.getElementById('fs-manager').value) || 0,
    exec:    parseInt(document.getElementById('fs-exec').value)    || 0,
  };
  S.fee.maxExec = parseInt(document.getElementById('fs-max-exec').value) || 2500;
  closeM('m-fee'); toast('部費設定を保存しました ✓');
  render(); await saveFeeBase();
}

function renderAdjList() {
  const el = document.getElementById('adj-list'); if (!el) return;
  el.innerHTML = S.fee.adjs.length===0
    ? '<div style="color:var(--tx3);font-size:12px;margin-bottom:8px">一時調整なし</div>'
    : S.fee.adjs.map(a => `
        <div class="adj-item">
          <span>${attrBadge(a.attr)} <span style="font-family:'DM Mono',monospace;font-size:12px">${fmt(a.amount)}</span></span>
          <span class="text-xs-muted">${a.from}〜${a.to}</span>
          <button class="btn bd sm" onclick="delAdj(${a.id})">削除</button>
        </div>`).join('');
}

async function addAdj() {
  const attr   = document.getElementById('adj-attr').value;
  const amount = parseInt(document.getElementById('adj-amt').value);
  const from   = document.getElementById('adj-from').value;
  const to     = document.getElementById('adj-to').value;
  if (!amount||amount<0) { toast('金額を入力してください'); return; }
  if (!from||!to)        { toast('期間を入力してください'); return; }
  if (from>to)           { toast('開始・終了月を正しく設定してください'); return; }
  const a = { id:nid++, attr, amount, from, to };
  S.fee.adjs.push(a);
  ['adj-amt','adj-from','adj-to'].forEach(id => document.getElementById(id).value='');
  renderAdjList(); toast('一時調整を追加しました ✓');
  await saveSheet(() => sheetsAppend(SH.FEE_SET, [adjToRow(a)]));
}

async function delAdj(id) {
  const idx = S.fee.adjs.findIndex(a => a.id === id);
  if (idx < 0) return;
  const row = idx + FEE_SET_ADJ_START_ROW;
  S.fee.adjs = S.fee.adjs.filter(a => a.id!==id);
  renderAdjList(); renderFeeView(); renderFee();
  await saveSheet(() => sheetsDeleteRow(SH.FEE_SET, row));
}

/* ================================================================
   CATEGORIES MANAGEMENT
================================================================ */
let currentCatType = 'income';
let categoriesEdited = {};
let currentCatEditIndex = -1;

function openCategoryModal() {
  currentCatType = 'income';
  currentCatEditIndex = -1;
  categoriesEdited = JSON.parse(JSON.stringify(S.categories));
  document.getElementById('cat-type-income').classList.add('on');
  document.getElementById('cat-type-expense').classList.remove('on');
  renderCategoriesList();
  openM('m-categories');
}

function switchCatType(type, element) {
  currentCatType = type;
  element.closest('.tog2').querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
  element.classList.add('on');
  renderCategoriesList();
}

function renderCategoriesList() {
  const cats = categoriesEdited.filter(c => c.type === currentCatType);
  const grouped = {};
  cats.forEach(c => {
    if (!grouped[c.classification]) grouped[c.classification] = [];
    grouped[c.classification].push(c);
  });

  const el = document.getElementById('categories-list');

  // 編集中の場合
  if (currentCatEditIndex >= 0) {
    const editCat = categoriesEdited[currentCatEditIndex];
    el.innerHTML = `
      <div style="padding:12px;background:var(--sur2);border-radius:8px;border:2px solid var(--grn)">
        <div style="font-weight:600;margin-bottom:12px;font-size:13px">科目を編集</div>
        <div class="fg" style="margin-bottom:12px">
          <div class="fi">
            <label class="text-sm">科目分類</label>
            <input type="text" id="edit-cat-cls" value="${escapeHtml(editCat.classification)}" class="form-control">
          </div>
          <div class="fi">
            <label class="text-sm">科目名</label>
            <input type="text" id="edit-cat-name" value="${escapeHtml(editCat.category)}" class="form-control">
          </div>
        </div>
        <div class="flex flex-gap-6">
          <button class="btn bs sm flex-1" onclick="cancelEditCategory()">キャンセル</button>
          <button class="btn bp sm flex-1" onclick="saveEditCategory(${currentCatEditIndex})">保存</button>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = Object.keys(grouped).length === 0
    ? '<div style="color:var(--tx3);font-size:12px">科目がありません</div>'
    : Object.entries(grouped).map(([cls, items]) => `
        <div style="margin-bottom:12px;padding:10px;background:var(--sur);border-radius:6px;border:1px solid var(--bdr)">
          <div style="font-weight:600;margin-bottom:8px;font-size:12px;color:var(--tx2)">${escapeHtml(cls)}</div>
          ${items.map((cat, idx) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg);border-radius:4px;margin-bottom:4px;font-size:12px">
              <span>${escapeHtml(cat.category)}</span>
              <div class="flex flex-gap-4">
                <button class="btn bs sm btn-xs" onclick="editCategory(${categoriesEdited.indexOf(cat)})">編集</button>
                <button class="btn bd sm btn-xs" onclick="deleteCategoryByRef(${categoriesEdited.indexOf(cat)})">削除</button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');
}

function addCategory() {
  const cls = document.getElementById('cat-cls-input').value.trim();
  const cat = document.getElementById('cat-name-input').value.trim();

  if (!cls) { toast('科目分類を入力してください'); return; }
  if (!cat) { toast('科目名を入力してください'); return; }

  const maxOrder = Math.max(0, ...categoriesEdited.filter(c => c.type === currentCatType).map(c => c.order || 0));
  categoriesEdited.push({
    type: currentCatType,
    classification: cls,
    category: cat,
    order: maxOrder + 1
  });

  document.getElementById('cat-cls-input').value = '';
  document.getElementById('cat-name-input').value = '';
  renderCategoriesList();
  toast('科目を追加しました');
}

function deleteCategoryByRef(index) {
  const cat = categoriesEdited[index];
  if (!cat) return;
  if (!confirm(`「${cat.classification}」の「${cat.category}」を削除しますか？`)) return;
  categoriesEdited.splice(index, 1);
  renderCategoriesList();
  toast('科目を削除しました');
}

function editCategory(index) {
  currentCatEditIndex = index;
  renderCategoriesList();
}

function cancelEditCategory() {
  currentCatEditIndex = -1;
  renderCategoriesList();
}

function saveEditCategory(index) {
  const newCls = document.getElementById('edit-cat-cls').value.trim();
  const newCat = document.getElementById('edit-cat-name').value.trim();

  if (!newCls) { toast('科目分類を入力してください'); return; }
  if (!newCat) { toast('科目名を入力してください'); return; }

  categoriesEdited[index].classification = newCls;
  categoriesEdited[index].category = newCat;
  currentCatEditIndex = -1;
  renderCategoriesList();
  toast('科目を更新しました');
}

// 科目(categories)にはidが無く、並び替え時に配列順=シート行順の前提も崩れるため、
// 他エンティティのような行単位の追加・更新・削除ではなく、保存時に一括で洗い替える。
// 編集は「保存」を押すまでcategoriesEditedという作業コピー上で行われるため、
// 連打や複数タブでの同時編集さえなければ実務上のリスクは小さい。
async function saveCategories() {
  try {
    const rows = categoriesEdited.map(c => [c.type, c.classification, c.category, c.order || 0]);
    await saveSheet(async () => {
      await sheetsClear(SH.CATEGORIES);
      if (rows.length > 0) {
        await sheetsAppend(SH.CATEGORIES, rows);
      }
    });
    S.categories = categoriesEdited;
    initializeCategories();
    render();
    closeM('m-categories');
    toast('科目設定を保存しました ✓');
    renderCategoriesPage();
  } catch (e) {
    console.error('科目設定の保存に失敗しました:', e);
    toast('保存に失敗しました');
  }
}

/* ================================================================
   REPORT
================================================================ */
function renderReport() {
  const monthly = {};
  S.txs.forEach(t => {
    if (!t.date) return;
    const ym = t.date.slice(0,7);
    if (!monthly[ym]) monthly[ym] = { inc:0,exp:0,ci:0,co:0,bi:0,bo:0 };
    if (t.type==='income')  { monthly[ym].inc+=t.amount; t.acct==='cash'?monthly[ym].ci+=t.amount:monthly[ym].bi+=t.amount; }
    if (t.type==='expense') { monthly[ym].exp+=t.amount; t.acct==='cash'?monthly[ym].co+=t.amount:monthly[ym].bo+=t.amount; }
  });
  const ms = Object.keys(monthly).sort().reverse();

  const mel = document.getElementById('r-monthly');
  if (mel) mel.innerHTML = ms.length===0 ? '<div class="empty">データがありません</div>'
    : ms.map(ym => {
        const d=monthly[ym], bal=d.inc-d.exp;
        return `<div class="p-7-bdr">
          <div class="flex flex-between mb-2">
            <span class="text-sm-mono">${ym}</span>
            <span class="text-sm font-semibold ${bal>=0?'text-income':'text-expense'}">${bal>=0?'+':''}${fmt(bal)}</span>
          </div>
          <div class="text-xs text-secondary-color">
            現金 <span class="text-income">${fmt(d.ci)}</span>/<span class="text-expense">${fmt(d.co)}</span>
            銀行 <span class="text-income">${fmt(d.bi)}</span>/<span class="text-expense">${fmt(d.bo)}</span>
          </div></div>`;
      }).join('');

  const clss = {};
  S.txs.filter(t => t.type!=='transfer').forEach(t => {
    if (!clss[t.classification]) clss[t.classification] = { inc:0,exp:0 };
    if (t.type==='income') clss[t.classification].inc+=t.amount;
    else clss[t.classification].exp+=t.amount;
  });
  const cel = document.getElementById('r-cats');
  if (cel) cel.innerHTML = Object.keys(clss).sort().length===0 ? '<div class="empty">データがありません</div>'
    : Object.keys(clss).sort().map(k => {
        const d=clss[k];
        return `<div class="flex flex-center flex-between p-7-bdr">
          <span class="text-sm" style="background:var(--sur2);padding:2px 8px;border-radius:20px">${escapeHtml(k)}</span>
          <span class="text-sm">
            ${d.inc?`<span class="text-income">${fmt(d.inc)}</span> `:''}
            ${d.exp?`<span class="text-expense">-${fmt(d.exp)}</span>`:''}
          </span>
        </div>`;
      }).join('');

  renderTrendTable(monthly);
}

function renderTrendTable(monthly) {
  const el = document.getElementById('trend-table'); if (!el) return;
  const ms = Object.keys(monthly).sort();
  if (ms.length===0) { el.innerHTML='<tr><td class="empty">データがありません</td></tr>'; return; }
  let cum=0;
  el.innerHTML = `<thead><tr>
    <th>月</th>
    <th class="text-right">収入</th>
    <th class="text-right">支出</th>
    <th class="text-right">差引</th>
    <th class="text-right">累計残高</th>
  </tr></thead><tbody>${
    ms.map(ym => {
      const d=monthly[ym], bal=d.inc-d.exp; cum+=bal;
      return `<tr>
        <td class="text-sm-mono">${ym}</td>
        <td class="num text-income">${fmtN(d.inc)}</td>
        <td class="num text-expense">${fmtN(d.exp)}</td>
        <td class="num font-semibold ${bal>=0?'text-income':'text-expense'}">${bal>=0?'+':''}${fmtN(bal)}</td>
        <td class="num font-bold">${fmtN(cum)}</td>
      </tr>`;
    }).join('')
  }</tbody>`;
}

function renderChart() {
  const monthly = {};
  S.txs.filter(t => t.type!=='transfer').forEach(t => {
    const ym = t.date.slice(0,7);
    if (!monthly[ym]) monthly[ym] = { inc:0,exp:0 };
    if (t.type==='income') monthly[ym].inc+=t.amount;
    else monthly[ym].exp+=t.amount;
  });
  const labels  = Object.keys(monthly).sort();
  const incData = labels.map(l => monthly[l].inc);
  const expData = labels.map(l => monthly[l].exp);
  let cum=0;
  const balData = labels.map(l => { cum+=monthly[l].inc-monthly[l].exp; return cum; });
  const ctx = document.getElementById('trend-chart'); if (!ctx) return;
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    data: { labels, datasets: [
      { type:'bar',  label:'収入', data:incData, backgroundColor:'rgba(45,106,79,.65)', borderRadius:4, order:2 },
      { type:'bar',  label:'支出', data:expData, backgroundColor:'rgba(192,57,43,.65)', borderRadius:4, order:2 },
      { type:'line', label:'累計残高', data:balData, borderColor:'#1d4ed8', backgroundColor:'rgba(29,78,216,.08)', borderWidth:2, pointRadius:3, fill:true, tension:.3, order:1, yAxisID:'y2' },
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction: { mode:'index', intersect:false },
      plugins: { legend: { labels: { font:{ size:11 }, boxWidth:12 } } },
      scales: {
        x:  { ticks:{ font:{ size:11 } }, grid:{ display:false } },
        y:  { ticks:{ font:{ size:11 }, callback:v=>'¥'+v.toLocaleString() }, grid:{ color:'rgba(0,0,0,.05)' } },
        y2: { position:'right', ticks:{ font:{ size:11 }, callback:v=>'¥'+v.toLocaleString() }, grid:{ display:false } },
      },
    },
  });
}

/* ================================================================
   EXPORT
================================================================ */
function exportCSV() {
  const h = ['日付','口座','移動先','種別','金額','摘要','科目','備考'];
  const rows = S.txs
    .sort((a,b) => a.date.localeCompare(b.date))
    .map(t => [
      t.date,
      t.acct==='cash'?'現金':'銀行預金',
      t.type==='transfer'?(t.toAcct==='cash'?'現金':'銀行預金'):'',
      t.type==='income'?'収入':t.type==='expense'?'支出':'口座振替',
      t.amount, t.desc, t.cat, t.note,
    ]);
  // ダブルクォートのエスケープと、Excelで数式実行されるのを防ぐCSVインジェクション対策
  const csvCell = v => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv  = [h,...rows].map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `部活会計_${toYMD(new Date())}.csv`;
  a.click();
  toast('CSVをダウンロードしました ✓');
}

/* ================================================================
   MODAL / TOAST
================================================================ */
function openM(id)  { document.getElementById(id).classList.add('open'); }
function closeM(id) { document.getElementById(id).classList.remove('open'); }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mbg').forEach(m =>
    m.addEventListener('click', e => { if (e.target===m) m.classList.remove('open'); }));

  // ユーザーメニュー初期化
  const userNameEl = document.getElementById('user-name');
  if (userNameEl && userEmail) {
    userNameEl.textContent = userEmail.split('@')[0];
  }

  // グローバル会計年度初期化
  initGlobalFiscalYear();

  // メニュー自動クローズ
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    const btn = e.target.closest('button[onclick="toggleUserMenu()"]');
    if (!btn && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
});

let toastTimeout = null;
function toast(msg) {
  const el = document.getElementById('toast');

  // 前のタイムアウトをクリア
  if (toastTimeout) clearTimeout(toastTimeout);

  el.textContent = msg;
  el.classList.add('show');

  toastTimeout = setTimeout(() => {
    el.classList.remove('show');
    el.textContent = '';
  }, 2200);
}

/* ================================================================
   BOTTOM SHEET — スマホ収支入力
================================================================ */

let bsType = 'income';
let bsAcct = 'cash';

function openBottomSheet() {
  const today = new Date();
  document.getElementById('bs-date').value    = toYMD(today);
  document.getElementById('bs-tr-date').value = toYMD(today);
  document.getElementById('bs-sheet').classList.add('open');
  document.getElementById('bs-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  // 金額欄にフォーカス
  setTimeout(() => document.getElementById('bs-amt')?.focus(), 350);
}

function closeBottomSheet() {
  document.getElementById('bs-sheet').classList.remove('open');
  document.getElementById('bs-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function setBsType(type, el) {
  S.type = type;
  bsType = type;
  el.closest('.bs-tog3').querySelectorAll('.bs-tbtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('bs-normal').style.display   = type === 'transfer' ? 'none' : 'block';
  document.getElementById('bs-transfer').style.display = type === 'transfer' ? 'block' : 'none';

  // 科目分類を type に基づいて更新
  if (type !== 'transfer') {
    const bsCls = document.getElementById('bs-cls');
    if (bsCls) {
      const classifications = [...new Set(S.categories.filter(c => c.type === type).map(c => c.classification))];
      bsCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
      updateBsCategories();
    }
  }
}

function setBsAcct(acct, el) {
  bsAcct = acct;
  el.closest('.bs-tog2').querySelectorAll('.bs-abtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

async function addTxFromSheet() {
  let t;
  if (bsType === 'transfer') {
    const amount = parseInt(document.getElementById('bs-tr-amt').value);
    const from   = document.getElementById('bs-tr-from').value;
    const to     = document.getElementById('bs-tr-to').value;
    const date   = document.getElementById('bs-tr-date').value;
    const desc   = document.getElementById('bs-tr-desc').value.trim() ||
                   `${from === 'cash' ? '現金' : '銀行'}→${to === 'cash' ? '現金' : '銀行'}`;
    if (!amount || amount <= 0) { toast('金額を入力してください'); return; }
    if (!date)                  { toast('日付を入力してください'); return; }
    if (from === to)            { toast('移動元と移動先が同じです'); return; }
    t = { id: nid++, date, type: 'transfer', acct: from, toAcct: to, amount, desc, cat: '振替', note: '' };
    S.txs.push(t);
    document.getElementById('bs-tr-amt').value  = '';
    document.getElementById('bs-tr-desc').value = '';
  } else {
    const amount = parseInt(document.getElementById('bs-amt').value);
    const desc   = document.getElementById('bs-desc').value.trim();
    const date   = document.getElementById('bs-date').value;
    const classification = document.getElementById('bs-cls').value;
    const cat    = document.getElementById('bs-cat').value;
    const note   = document.getElementById('bs-note').value.trim();
    if (!amount || amount <= 0) { toast('金額を入力してください'); return; }
    if (!desc)                  { toast('摘要を入力してください'); return; }
    if (!date)                  { toast('日付を入力してください'); return; }
    t = { id: nid++, date, type: bsType, acct: bsAcct, amount, desc, classification, cat, note };
    S.txs.push(t);
    document.getElementById('bs-amt').value  = '';
    document.getElementById('bs-desc').value = '';
    document.getElementById('bs-note').value = '';
  }
  closeBottomSheet();
  toast('追加しました ✓');
  render();
  await saveSheet(() => sheetsAppend(SH.TX, [txToRow(t)]));
}

/* PCフィルタとSPフィルタの両方を見て、両方のリストに反映する */
function renderTx() {
  // PCフィルタ
  const fa = document.getElementById('f-acct')?.value || '';
  const ft = document.getElementById('f-type')?.value || '';
  // SPフィルタ（存在する場合）
  const faSp = document.getElementById('f-acct-sp')?.value || '';
  const ftSp = document.getElementById('f-type-sp')?.value || '';

  const filterAcct = fa || faSp;
  const filterType = ft || ftSp;

  let txs = [...S.txs].sort((a, b) => b.date.localeCompare(a.date));
  if (filterAcct) txs = txs.filter(t => t.acct === filterAcct || (t.type === 'transfer' && t.toAcct === filterAcct));
  if (filterType) txs = txs.filter(t => t.type === filterType);

  const html = txs.length === 0
    ? '<div class="empty">取引がありません</div>'
    : txs.map(txRow).join('');

  const pcList = document.getElementById('tx-list');
  const spList = document.getElementById('tx-list-sp');
  if (pcList) pcList.innerHTML = html;
  if (spList) spList.innerHTML = html;
}

/* スワイプで閉じる（任意） */
(function initSwipeClose() {
  let startY = 0;
  const sheet = document.getElementById('bs-sheet');
  if (!sheet) return;
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) closeBottomSheet();
  }, { passive: true });
})();

/* FAB は常時表示（スクロール制御なし） */

/* ================================================================
   CATEGORIES PAGE — 科目管理画面に一覧表示
================================================================ */

function renderCategoriesPage() {
  const el = document.getElementById('categories-page-content');
  if (!el) return;

  const incCats = S.categories.filter(c => c.type === 'income');
  const expCats = S.categories.filter(c => c.type === 'expense');

  function groupHtml(cats, type) {
    if (cats.length === 0) {
      return '<div class="empty" style="padding:20px 0">科目がありません</div>';
    }
    const grouped = {};
    cats.forEach(c => {
      if (!grouped[c.classification]) grouped[c.classification] = [];
      grouped[c.classification].push(c);
    });
    return Object.entries(grouped).map(([cls, items]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:var(--tx3);text-transform:uppercase;
             letter-spacing:.5px;margin-bottom:6px;padding:0 4px">${escapeHtml(cls)}</div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${items.map(cat => `
            <div class="flex flex-between card-item">
              <span class="text-base">${escapeHtml(cat.category)}</span>
              <div class="flex flex-gap-5">
                <button class="btn bs sm btn-xs-custom"
                  onclick="openCategoryModalWithEdit('${type}','${escHtml(cls)}','${escHtml(cat.category)}')">編集</button>
                <button class="btn bd sm btn-xs-custom"
                  onclick="deleteCategoryDirect('${type}','${escHtml(cls)}','${escHtml(cat.category)}')">削除</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  el.innerHTML = `
    <div class="cat-page-grid">
      <div class="card">
        <div class="flex-between-mb-14">
          <div class="flex-center-gap-8">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--grn);display:inline-block"></span>
            <span class="text-base-bold">収入科目</span>
          </div>
          <button class="btn bp sm" onclick="openCategoryModalForType('income')">＋ 追加</button>
        </div>
        ${groupHtml(incCats, 'income')}
      </div>
      <div class="card">
        <div class="flex-between-mb-14">
          <div class="flex-center-gap-8">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></span>
            <span class="text-base-bold">支出科目</span>
          </div>
          <button class="btn bp sm" onclick="openCategoryModalForType('expense')">＋ 追加</button>
        </div>
        ${groupHtml(expCats, 'expense')}
      </div>
    </div>`;
}

// onclick="...('${escHtml(x)}')" のようにHTML属性内のJS文字列リテラルへ埋め込むためのエスケープ。
// JS文字列としてのクォート/バックスラッシュを先にエスケープしてから、属性値としてHTMLエスケープする
// （ブラウザが属性値をHTMLデコードしてからJSとして評価するため、この順序でないと "/'`" によるインジェクションを防げない）
function escHtml(str) {
  const jsEscaped = String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return escapeHtml(jsEscaped);
}

// 科目管理ページから直接削除
async function deleteCategoryDirect(type, cls, catName) {
  if (!confirm(`「${cls}」の「${catName}」を削除しますか？`)) return;
  S.categories = S.categories.filter(c =>
    !(c.type === type && c.classification === cls && c.category === catName));
  const rows = S.categories.map(c => [c.type, c.classification, c.category, c.order || 0]);
  try {
    await saveSheet(async () => {
      await sheetsClear(SH.CATEGORIES);
      if (rows.length > 0) await sheetsAppend(SH.CATEGORIES, rows);
    });
    initializeCategories();
    renderCategoriesPage();
    toast('科目を削除しました');
  } catch(e) {
    console.error(e);
    toast('削除に失敗しました');
  }
}

// 種別を指定してモーダルを開く
function openCategoryModalForType(type) {
  openCategoryModal();
  setTimeout(() => {
    if (type === 'expense') {
      const btn = document.getElementById('cat-type-expense');
      if (btn) switchCatType('expense', btn);
    }
  }, 50);
}

// 編集状態でモーダルを開く
function openCategoryModalWithEdit(type, cls, catName) {
  openCategoryModal();
  setTimeout(() => {
    if (type === 'expense') {
      const btn = document.getElementById('cat-type-expense');
      if (btn) switchCatType('expense', btn);
    }
    setTimeout(() => {
      const idx = categoriesEdited.findIndex(c =>
        c.type === type && c.classification === cls && c.category === catName);
      if (idx >= 0) editCategory(idx);
    }, 50);
  }, 50);
}

/* ================================================================
   BUDGET MANAGEMENT
================================================================ */

function openBudgetSettingsModal() {
  renderBudgetSettingsList();
  document.getElementById('budget-court-name').value = '';
  document.getElementById('budget-court-condition').value = '';
  document.getElementById('budget-price-per-hour').value = '';
  document.getElementById('budget-court-remarks').value = '';
  openM('m-budget-settings');
}

function openBudgetRecordModal(recordId = null) {
  editingBudgetRecordId = recordId;

  const titleEl = document.getElementById('budget-record-modal-title');
  const submitBtn = document.getElementById('budget-record-submit-btn');
  const courtSelect = document.getElementById('budget-record-court');

  if (S.budget.settings.length === 0) {
    toast('コート代設定がありません。先に設定を追加してください。');
    return;
  }
  // 選択肢の再構築はvalue設定より先に行う（後で作り直すと選択状態が失われるため）
  courtSelect.innerHTML = S.budget.settings.map((s, idx) =>
    `<option value="${idx}">${escapeHtml(s.court_name)} (${escapeHtml(s.court_condition)})</option>`
  ).join('');

  if (recordId) {
    const record = S.budget.records.find(r => r.id === recordId);
    if (!record) return;

    titleEl.textContent = '予算を編集';
    submitBtn.textContent = '保存する';

    document.getElementById('budget-record-date').value = record.date;
    document.getElementById('budget-record-hours').value = record.hours;
    document.getElementById('budget-record-remarks').value = record.remarks;

    const settingIdx = S.budget.settings.findIndex(s =>
      s.court_name === record.court_name && s.court_condition === record.court_condition
    );
    if (settingIdx >= 0) {
      courtSelect.value = settingIdx;
    } else {
      // 対応するコート設定が削除済み。先頭のコートを誤って選んだまま保存すると
      // 別コート・別単価で上書きされてしまうため、編集自体を中止し警告する
      toast('この記録のコート設定が見つかりません（削除された可能性があります）。編集できません。');
      return;
    }
  } else {
    titleEl.textContent = '予算を追加';
    submitBtn.textContent = '追加する';

    const today = new Date();
    document.getElementById('budget-record-date').value = toYMD(today);
    document.getElementById('budget-record-hours').value = '';
    document.getElementById('budget-record-remarks').value = '';
  }

  updateBudgetCourtInfo();
  openM('m-budget-record');
}

async function addBudgetSetting() {
  const courtName = document.getElementById('budget-court-name').value.trim();
  const courtCondition = document.getElementById('budget-court-condition').value.trim();
  const pricePerHour = parseInt(document.getElementById('budget-price-per-hour').value);
  const remarks = document.getElementById('budget-court-remarks').value.trim();

  if (!courtName) { toast('コート名を入力してください'); return; }
  if (!courtCondition) { toast('条件を入力してください'); return; }
  if (!pricePerHour || pricePerHour <= 0) { toast('単価を正しく入力してください'); return; }

  const s = {
    id: nid++,
    court_name: courtName,
    court_condition: courtCondition,
    price_per_hour: pricePerHour,
    remarks: remarks
  };
  S.budget.settings.push(s);

  toast('コート設定を追加しました ✓');
  renderBudgetSettingsList();
  await saveSheet(() => sheetsAppend(SH.BUDGET_SETTINGS, [budgetSettingToRow(s)]));
}

async function deleteBudgetSetting(id) {
  if (!confirm('このコート設定を削除しますか？')) return;
  const row = S.budget.settings.findIndex(s => s.id === id) + 2;
  S.budget.settings = S.budget.settings.filter(s => s.id !== id);
  toast('削除しました');
  renderBudgetSettingsList();
  await saveSheet(() => sheetsDeleteRow(SH.BUDGET_SETTINGS, row));
}

// コート設定は追加・削除のたびに即保存されるので、モーダルの「保存」ボタンは閉じるだけでよい
function saveBudgetSettings() {
  closeM('m-budget-settings');
}

function renderBudgetSettingsList() {
  const el = document.getElementById('budget-settings-list');
  if (!el) return;

  if (S.budget.settings.length === 0) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:12px">設定がありません</div>';
    return;
  }

  el.innerHTML = S.budget.settings.map(s => `
    <div style="margin-bottom:12px;padding:10px;background:var(--sur);border-radius:6px;border:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${escapeHtml(s.court_name)}</div>
          <div style="font-size:12px;color:var(--tx2);margin-bottom:4px">${escapeHtml(s.court_condition)}</div>
          <div style="font-size:13px;font-family:'DM Mono',monospace;color:var(--red);font-weight:500">¥${fmtN(s.price_per_hour)}/時間</div>
          ${s.remarks ? `<div style="font-size:11px;color:var(--tx3);margin-top:4px">${escapeHtml(s.remarks)}</div>` : ''}
        </div>
        <button class="btn bd sm" onclick="deleteBudgetSetting(${s.id})" style="margin-left:10px">削除</button>
      </div>
    </div>
  `).join('');
}

function updateBudgetCourtInfo() {
  const idx = parseInt(document.getElementById('budget-record-court').value);
  const setting = S.budget.settings[idx];
  if (!setting) return;

  const hours = parseFloat(document.getElementById('budget-record-hours').value) || 0;
  const amount = Math.round(hours * setting.price_per_hour);
  document.getElementById('budget-record-amount-display').textContent = fmt(amount);
}

document.addEventListener('DOMContentLoaded', () => {
  const hoursInput = document.getElementById('budget-record-hours');
  if (hoursInput) {
    hoursInput.addEventListener('input', updateBudgetCourtInfo);
  }
  const courtSelect = document.getElementById('budget-record-court');
  if (courtSelect) {
    courtSelect.addEventListener('change', updateBudgetCourtInfo);
  }

  const budgetMonth = document.getElementById('budget-month');
  if (budgetMonth && !budgetMonth.value) {
    budgetMonth.value = toYM(new Date());
  }

  const budgetCategoryMonth = document.getElementById('budget-category-month');
  if (budgetCategoryMonth && !budgetCategoryMonth.value) {
    budgetCategoryMonth.value = toYM(new Date());
  }

  const tabBtn1 = document.getElementById('tab-budget-court');
  if (tabBtn1) {
    tabBtn1.classList.add('active');
  }

  renderBudget();
});

async function addBudgetRecord() {
  const date = document.getElementById('budget-record-date').value;
  const courtIdx = parseInt(document.getElementById('budget-record-court').value);
  const hours = parseFloat(document.getElementById('budget-record-hours').value);
  const remarks = document.getElementById('budget-record-remarks').value.trim();

  if (!date) { toast('日付を入力してください'); return; }
  if (courtIdx < 0 || courtIdx >= S.budget.settings.length) { toast('コート設定を選択してください'); return; }
  if (!hours || hours <= 0) { toast('使用時間を正しく入力してください'); return; }

  const setting = S.budget.settings[courtIdx];
  const amount = Math.round(hours * setting.price_per_hour);

  let saveOp;
  if (editingBudgetRecordId) {
    const record = S.budget.records.find(r => r.id === editingBudgetRecordId);
    if (record) {
      record.date = date;
      record.court_name = setting.court_name;
      record.court_condition = setting.court_condition;
      record.hours = hours;
      record.price_per_hour = setting.price_per_hour;
      record.amount = amount;
      record.remarks = remarks;
      toast('予算を更新しました ✓');
      const row = S.budget.records.findIndex(r => r.id === editingBudgetRecordId) + 2;
      saveOp = () => sheetsUpdateRow(SH.BUDGET, row, budgetRecordToRow(record));
    }
  } else {
    const record = {
      id: nid++,
      date: date,
      court_name: setting.court_name,
      court_condition: setting.court_condition,
      hours: hours,
      price_per_hour: setting.price_per_hour,
      amount: amount,
      remarks: remarks
    };
    S.budget.records.push(record);
    toast('予算を追加しました ✓');
    saveOp = () => sheetsAppend(SH.BUDGET, [budgetRecordToRow(record)]);
  }

  closeM('m-budget-record');
  editingBudgetRecordId = null;
  renderBudget();
  if (saveOp) await saveSheet(saveOp);
}

async function deleteBudgetRecord(id) {
  if (!confirm('この予算記録を削除しますか？')) return;
  const row = S.budget.records.findIndex(r => r.id === id) + 2;
  S.budget.records = S.budget.records.filter(r => r.id !== id);
  toast('削除しました');
  renderBudget();
  await saveSheet(() => sheetsDeleteRow(SH.BUDGET, row));
}

function renderBudget() {
  renderBudgetSummary();
  if (currentBudgetTab === 'court') {
    renderCourtBudget();
  } else if (currentBudgetTab === 'category') {
    renderCategoryBudget();
  }
}

function renderBudgetSummary() {
  const ym = document.getElementById('budget-month')?.value || document.getElementById('budget-category-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);

  const courtRecords = S.budget.records.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));
  const courtTotal = courtRecords.reduce((s, r) => s + r.amount, 0);

  const categoryRecords = S.budget.categoryRecords.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));
  const categoryTotal = categoryRecords.reduce((s, r) => s + r.amount, 0);

  const grandTotal = courtTotal + categoryTotal;

  // コートタブ用
  document.getElementById('budget-court-total-court').textContent = fmt(courtTotal);
  document.getElementById('budget-category-total-court').textContent = fmt(categoryTotal);
  document.getElementById('budget-grand-total-court').textContent = fmt(grandTotal);

  // 他の科目タブ用
  document.getElementById('budget-court-total-category').textContent = fmt(courtTotal);
  document.getElementById('budget-category-total-category').textContent = fmt(categoryTotal);
  document.getElementById('budget-grand-total-category').textContent = fmt(grandTotal);
}

function renderCourtBudget() {
  const ym = document.getElementById('budget-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);
  const records = S.budget.records.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));

  const tableHtml = records.length === 0
    ? '<div class="empty">予算記録がありません</div>'
    : `<div class="card card-no-pad overflow-hidden">
        <div style="overflow-x:auto"><table class="ltbl">
          <thead><tr>
            <th>日付</th><th>コート</th><th>時間</th><th>単価</th><th class="text-right">金額</th><th></th>
          </tr></thead>
          <tbody>
            ${records.sort((a,b) => a.date.localeCompare(b.date))
              .map(r => `<tr>
                <td>${r.date.slice(5)}</td>
                <td style="font-size:13px">${escapeHtml(r.court_name)}<br><span style="color:var(--tx2);font-size:11px">${escapeHtml(r.court_condition)}</span></td>
                <td>${r.hours}h</td>
                <td>${fmt(r.price_per_hour)}/h</td>
                <td class="text-right" style="color:var(--red);font-weight:600">${fmt(r.amount)}</td>
                <td style="white-space:nowrap"><button class="btn bs sm" onclick="openBudgetRecordModal(${r.id})" style="margin-right:4px">編集</button><button class="btn bd sm" onclick="deleteBudgetRecord(${r.id})">削除</button></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

  document.getElementById('budget-court-content').innerHTML = tableHtml;
}

function renderCategoryBudget() {
  const ym = document.getElementById('budget-category-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);
  const records = S.budget.categoryRecords.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));

  const tableHtml = records.length === 0
    ? '<div class="empty">記録がありません</div>'
    : `<div class="card card-no-pad overflow-hidden">
        <div style="overflow-x:auto"><table class="ltbl">
          <thead><tr>
            <th>日付</th><th>分類</th><th>科目</th><th class="text-right">金額</th><th></th>
          </tr></thead>
          <tbody>
            ${records.sort((a,b) => a.date.localeCompare(b.date))
              .map(r => `<tr>
                <td>${r.date.slice(5)}</td>
                <td>${escapeHtml(r.classification)}</td>
                <td>${escapeHtml(r.category)}</td>
                <td class="text-right" style="color:var(--red);font-weight:600">${fmt(r.amount)}</td>
                <td style="white-space:nowrap"><button class="btn bs sm" onclick="openBudgetCategoryRecordModal(${r.id})" style="margin-right:4px">編集</button><button class="btn bd sm" onclick="deleteBudgetCategoryRecord(${r.id})">削除</button></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

  document.getElementById('budget-category-content').innerHTML = tableHtml;
}

/* ================================================================
   GLOBAL FISCAL YEAR MANAGEMENT
================================================================ */

function toggleUserMenu() {
  const menu = document.getElementById('user-menu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

function switchGlobalFiscalYear() {
  const select = document.getElementById('global-fiscal-year');
  if (!select) return;

  currentFiscalYear = parseInt(select.value);

  const range = getFiscalYearRange(currentFiscalYear);
  ['budget-month', 'budget-category-month', 'fee-month'].forEach(id => {
    const input = document.getElementById(id);
    if (input && !range.includes(input.value)) {
      input.value = range[0];
    }
  });

  rerenderCurrentPage();
}

function rerenderCurrentPage() {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;

  const pageId = activePage.id;
  if (pageId === 'page-dashboard') renderDash();
  else if (pageId === 'page-ledger') showLedger(currentLedger);
  else if (pageId === 'page-fees') renderFee();
  else if (pageId === 'page-budget') renderBudget();
}

function initGlobalFiscalYear() {
  const availableYears = getAvailableFiscalYears();
  const today = new Date();
  const currentYear = getFiscalYear(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);

  if (currentFiscalYear === null) {
    currentFiscalYear = availableYears.includes(currentYear) ? currentYear : availableYears[0];
  }

  const fiscalSelect = document.getElementById('global-fiscal-year');
  if (fiscalSelect) {
    fiscalSelect.innerHTML = '';
    availableYears.forEach(year => {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = getFiscalYearLabel(year);
      if (year === currentFiscalYear) option.selected = true;
      fiscalSelect.appendChild(option);
    });
  }
}

/* ================================================================
   YEARLY BUDGET VIEW (within renderBudget or separate)
================================================================ */

function switchBudgetTab(tab) {
  currentBudgetTab = tab;

  const tab1 = document.getElementById('tab-budget-court');
  const tab2 = document.getElementById('tab-budget-category');
  const content1 = document.getElementById('tab-content-court');
  const content2 = document.getElementById('tab-content-category');

  if (tab === 'court') {
    tab1?.classList.remove('bs');
    tab1?.classList.add('bp');
    tab2?.classList.remove('bp');
    tab2?.classList.add('bs');
    content1.style.display = 'block';
    content2.style.display = 'none';
  } else {
    tab1?.classList.remove('bp');
    tab1?.classList.add('bs');
    tab2?.classList.remove('bs');
    tab2?.classList.add('bp');
    content1.style.display = 'none';
    content2.style.display = 'block';
  }

  renderBudget();
}


/* ================================================================
   CATEGORY BUDGET MANAGEMENT
================================================================ */

let editingBudgetCategoryRecordId = null;

function openBudgetCategoryRecordModal(recordId = null) {
  editingBudgetCategoryRecordId = recordId;

  const titleEl = document.getElementById('budget-cat-record-modal-title');
  const submitBtn = document.getElementById('budget-cat-submit-btn');

  if (recordId) {
    const record = S.budget.categoryRecords.find(r => r.id === recordId);
    if (!record) return;

    titleEl.textContent = '他の科目を編集';
    submitBtn.textContent = '保存する';

    budgetCategoryType = record.type || 'income';
    document.getElementById('budget-cat-date').value = record.date;
    document.getElementById('budget-cat-amount').value = record.amount;
    document.getElementById('budget-cat-remarks').value = record.remarks || '';
  } else {
    titleEl.textContent = '他の科目を追加';
    submitBtn.textContent = '追加';

    budgetCategoryType = 'income';
    const today = new Date();
    document.getElementById('budget-cat-date').value = toYMD(today);
    document.getElementById('budget-cat-amount').value = '';
    document.getElementById('budget-cat-remarks').value = '';
  }

  const typeButtons = document.querySelectorAll('.tbtn.income, .tbtn.expense');
  typeButtons.forEach(btn => btn.classList.remove('on'));
  if (budgetCategoryType === 'income') {
    document.getElementById('budget-cat-t-income').classList.add('on');
  } else {
    document.getElementById('budget-cat-t-expense').classList.add('on');
  }

  const classifications = [...new Set(S.categories.filter(c => c.type === budgetCategoryType).map(c => c.classification))];
  const classifySelect = document.getElementById('budget-cat-classification');
  classifySelect.innerHTML = classifications.map((c, idx) => `<option value="${escapeHtml(c)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  updateBudgetCategoryList();
  openM('m-budget-category-record');
}

function switchBudgetCategoryType(type) {
  budgetCategoryType = type;

  const incomeBtn = document.getElementById('budget-cat-t-income');
  const expenseBtn = document.getElementById('budget-cat-t-expense');

  if (type === 'income') {
    incomeBtn.classList.add('on');
    expenseBtn.classList.remove('on');
  } else {
    incomeBtn.classList.remove('on');
    expenseBtn.classList.add('on');
  }

  renderBudgetCategoryClassifications();
}

function renderBudgetCategoryClassifications() {
  const classifications = [...new Set(S.categories.filter(c => c.type === budgetCategoryType).map(c => c.classification))];
  const classifySelect = document.getElementById('budget-cat-classification');
  classifySelect.innerHTML = classifications.map((c, idx) => `<option value="${escapeHtml(c)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  updateBudgetCategoryList();
}

function updateBudgetCategoryList() {
  const classifyValue = document.getElementById('budget-cat-classification').value;
  const categories = S.categories.filter(c => c.type === budgetCategoryType && c.classification === classifyValue);
  const categorySelect = document.getElementById('budget-cat-category');
  categorySelect.innerHTML = categories.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
}

async function addBudgetCategoryRecord() {
  const date = document.getElementById('budget-cat-date').value;
  const classification = document.getElementById('budget-cat-classification').value;
  const category = document.getElementById('budget-cat-category').value;
  const amount = parseInt(document.getElementById('budget-cat-amount').value);
  const remarks = document.getElementById('budget-cat-remarks').value.trim();

  if (!date) { toast('日付を入力してください'); return; }
  if (!classification || !category) { toast('科目を選択してください'); return; }
  if (!amount || amount <= 0) { toast('金額を正しく入力してください'); return; }

  let saveOp;
  if (editingBudgetCategoryRecordId) {
    const record = S.budget.categoryRecords.find(r => r.id === editingBudgetCategoryRecordId);
    if (record) {
      record.date = date;
      record.type = budgetCategoryType;
      record.classification = classification;
      record.category = category;
      record.amount = amount;
      record.remarks = remarks;
      toast('更新しました ✓');
      const row = S.budget.categoryRecords.findIndex(r => r.id === editingBudgetCategoryRecordId) + 2;
      saveOp = () => sheetsUpdateRow(SH.BUDGET_CATEGORY_RECORDS, row, budgetCategoryRecordToRow(record));
    }
  } else {
    const record = {
      id: nid++,
      date: date,
      type: budgetCategoryType,
      classification: classification,
      category: category,
      amount: amount,
      remarks: remarks
    };
    S.budget.categoryRecords.push(record);
    toast('追加しました ✓');
    saveOp = () => sheetsAppend(SH.BUDGET_CATEGORY_RECORDS, [budgetCategoryRecordToRow(record)]);
  }

  closeM('m-budget-category-record');
  editingBudgetCategoryRecordId = null;
  renderBudget();
  if (saveOp) await saveSheet(saveOp);
}

async function deleteBudgetCategoryRecord(id) {
  if (!confirm('この記録を削除しますか？')) return;
  const row = S.budget.categoryRecords.findIndex(r => r.id === id) + 2;
  S.budget.categoryRecords = S.budget.categoryRecords.filter(r => r.id !== id);
  toast('削除しました');
  renderBudget();
  await saveSheet(() => sheetsDeleteRow(SH.BUDGET_CATEGORY_RECORDS, row));
}

function budgetCategoryRecordToRow(r) {
  return [r.id, r.date, r.type || 'expense', r.classification, r.category, r.amount, r.remarks || ''];
}