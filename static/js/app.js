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

function saveSheet(fn) {
  pendingSaves++;
  showSaveInd(true);
  const run = saveQueue.then(async () => {
    try { await fn(); }
    catch(e) {
      console.error(e);
      failedSaves.push({ id: Date.now() + Math.random(), fn, error: e });
      updateSaveFailBanner();
      if (e.isSessionExpired) showSessionExpiredModal();
      else toast('保存に失敗しました。再試行してください。');
    }
    finally {
      pendingSaves--;
      if (pendingSaves === 0) showSaveInd(false);
    }
  });
  saveQueue = run;
  return run;
}

function updateSaveFailBanner() {
  const el = document.getElementById('save-fail-ind');
  const countEl = document.getElementById('save-fail-count');
  if (!el || !countEl) return;
  if (failedSaves.length === 0) {
    el.style.display = 'none';
  } else {
    countEl.textContent = `⚠ 保存に失敗した変更が${failedSaves.length}件あります`;
    el.style.display = 'flex';
  }
}

async function retryFailedSaves() {
  const toRetry = failedSaves;
  failedSaves = [];
  updateSaveFailBanner();
  for (const item of toRetry) {
    await saveSheet(item.fn);
  }
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
    } else if (e.isSessionExpired) {
      // ローディング画面(z-index:499)の下に隠れないよう、先に非表示にしてからモーダルを出す
      setLoading(false);
      showSessionExpiredModal();
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

CLICK_ACTIONS.showPage = (el) => showPage(el.dataset.page);

/* ================================================================
   CALC
================================================================ */
// 会計年度fiscalYearの期首繰越＋その年度の増減で残高を計算する（省略時は選択中の年度）
function calcBal(fiscalYear = currentFiscalYear) {
  const range = getFiscalYearRange(fiscalYear);
  const opening = getOpeningBalance(fiscalYear);
  let cash = opening.cash, bank = opening.bank;
  S.txs.forEach(t => {
    if (!t.date || !range.some(m => t.date.startsWith(m))) return;
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
   MODAL / TOAST
================================================================ */
// セッション切れモーダルは「再ログインするまで表示し続ける」仕様のため、
// Escキー・オーバーレイクリックでは閉じない
const NON_DISMISSABLE_MODALS = ['m-session-expired'];

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.mbg').forEach(m => {
    if (NON_DISMISSABLE_MODALS.includes(m.id)) return;
    m.addEventListener('click', e => { if (e.target===m) closeM(m.id); });
  });

  // トグルボタン（.tbtn/.bs-tbtn）のaria-pressedを"on"クラスの状態と同期する
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.tbtn, .bs-tbtn');
    if (!btn) return;
    const group = btn.closest('.tog2, .tog3, .bs-tog2, .bs-tog3') || btn.parentElement;
    group.querySelectorAll('.tbtn, .bs-tbtn').forEach(b =>
      b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'));
  });

  // Escキーで開いているモーダルを閉じる（セッション切れモーダルを除く）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const openModal = document.querySelector('.mbg.open');
    if (!openModal || NON_DISMISSABLE_MODALS.includes(openModal.id)) return;
    closeM(openModal.id);
  });

  // ユーザーメニュー初期化
  const userNameEl = document.getElementById('user-name');
  if (userNameEl && userEmail) {
    userNameEl.textContent = userEmail.split('@')[0];
  }

  // グローバル会計年度初期化
  initGlobalFiscalYear();

  // 学年セレクトの選択肢を初期化
  populateGradeSelects();

  // メニュー自動クローズ
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    const btn = e.target.closest('[data-click-action="toggleUserMenu"]');
    if (!btn && !menu.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
});

/* ================================================================
   DATA-ACTION DISPATCHER
   onclick/onchange/oninput属性への文字列埋め込みを避けるため、HTML側は
   data-click-action="関数名" data-xxx="値" のような素のデータ属性のみを持ち、
   実際の関数呼び出しはここでイベント委譲して行う。
   引数を伴わない呼び出しはCLICK_ACTIONS/CHANGE_ACTIONS/INPUT_ACTIONSへの
   登録を省略でき、その場合data-*-action属性の値をそのままグローバル関数名として呼ぶ。
   click/change/inputで別々の属性名（data-click-action等）を使うのは、
   チェックボックスやファイル選択のようにclickとchangeの両方が同じ要素で
   発火する場合に、片方専用のハンドラをもう片方の委譲が誤って引数なしで
   呼んでしまう事故を防ぐため（実際にこれで一度バグを作った）。
================================================================ */
CLICK_ACTIONS.toggleGroup = (el) => {
  const group = el.closest('.tog2, .tog3, .bs-tog2, .bs-tog3') || el.parentElement;
  group.querySelectorAll('.tbtn, .bs-tbtn, .bs-abtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
};

CLICK_ACTIONS.triggerFileInput = (el) => {
  document.getElementById(el.dataset.target)?.click();
};

function dispatchAction(registry, action, el, e) {
  const handler = registry[action];
  if (handler) { handler(el, e); return; }
  if (typeof window[action] === 'function') { window[action](); return; }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-click-action]');
  if (!el) return;
  if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
  dispatchAction(CLICK_ACTIONS, el.dataset.clickAction, el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change-action]');
  if (!el) return;
  dispatchAction(CHANGE_ACTIONS, el.dataset.changeAction, el, e);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input-action]');
  if (!el) return;
  dispatchAction(INPUT_ACTIONS, el.dataset.inputAction, el, e);
});

/* ================================================================
   GLOBAL FISCAL YEAR MANAGEMENT
================================================================ */
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

  // ヘッダーの残高は年度をスコープにしているため、年度切替時に再描画する
  renderHdr();
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
  else if (pageId === 'page-report') { renderReport(); renderChart(); }
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
   CARRYOVER（前年度繰越）
================================================================ */
// 繰越登録の対象年度の候補。既存の会計年度に加え、まだ繰越が登録されていない
// 「次年度」も選べるようにする（年度末に当年度を締めて翌年度分を登録する運用を想定）
function getCarryoverYearOptions() {
  const years = new Set(getAvailableFiscalYears());
  years.add(currentFiscalYear);
  years.add(currentFiscalYear + 1);
  return Array.from(years).sort((a, b) => b - a);
}

function openCarryoverModal() {
  const select = document.getElementById('co-fiscal-year');
  const years = getCarryoverYearOptions();
  select.innerHTML = years.map(y => `<option value="${y}">${escapeHtml(getFiscalYearLabel(y))}</option>`).join('');
  // 当年度を締めて翌年度分を登録する操作が最も多いと想定し、デフォルトは翌年度
  const defaultYear = currentFiscalYear + 1;
  select.value = String(years.includes(defaultYear) ? defaultYear : years[0]);
  document.getElementById('co-date').value = toYMD(new Date());
  fillCarryoverForm();
  openM('m-carryover');
}

function onCarryoverYearChange() { fillCarryoverForm(); }

function fillCarryoverForm() {
  const fiscalYear = parseInt(document.getElementById('co-fiscal-year').value);
  const existing = S.carryoverRecords.find(r => r.fiscal_year === String(fiscalYear));
  const noteEl = document.getElementById('co-suggest-note');
  if (existing) {
    document.getElementById('co-cash').value = existing.cash;
    document.getElementById('co-bank').value = existing.bank;
    document.getElementById('co-note').value = existing.note;
    noteEl.textContent = `${getFiscalYearLabel(fiscalYear)}の繰越は既に登録されています。保存すると上書きされます。`;
  } else {
    const prevBal = calcBal(fiscalYear - 1);
    document.getElementById('co-cash').value = prevBal.cash;
    document.getElementById('co-bank').value = prevBal.bank;
    document.getElementById('co-note').value = '前年度繰越金';
    noteEl.textContent = `${getFiscalYearLabel(fiscalYear - 1)}の期末残高（現金${fmt(prevBal.cash)}・銀行${fmt(prevBal.bank)}）を提案値として入力しています。必要に応じて修正してください。`;
  }
}

async function saveCarryover() {
  const fiscalYear = document.getElementById('co-fiscal-year').value;
  const cash = Number(document.getElementById('co-cash').value) || 0;
  const bank = Number(document.getElementById('co-bank').value) || 0;
  const date = document.getElementById('co-date').value;
  const note = document.getElementById('co-note').value.trim() || '前年度繰越金';
  if (!date) { toast('登録日を入力してください'); return; }

  S.carryoverRecords = S.carryoverRecords.filter(r => r.fiscal_year !== fiscalYear);
  S.carryoverRecords.push({ fiscal_year: fiscalYear, date, cash, bank, note });

  closeM('m-carryover');
  render(); rerenderCurrentPage();
  toast('繰越を登録しました ✓');

  const rows = S.carryoverRecords.map(r => [r.fiscal_year, r.date, r.cash, r.bank, r.note]);
  await saveSheet(async () => {
    await sheetsClear(SH.CARRYOVER);
    if (rows.length > 0) await sheetsAppend(SH.CARRYOVER, rows);
  });
}
