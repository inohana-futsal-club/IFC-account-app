let accessToken = null;

let userEmail   = null;

/* シート名 -> 数値sheetId（行削除のbatchUpdateで必要）。ensureSheetsで取得 */
let sheetIdMap = {};

let currentBudgetTab = 'court';

let editingBudgetRecordId = null;

let budgetCategoryType = 'income';

let editingBudgetCategoryRecordId = null;

let currentFiscalYear = null;

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

// 保存を直列キューで実行する。同時に複数の保存が発生しても、後発の保存が
// 「実行中だから」と無視されて消えることがないようにする（以前は isSaving フラグで
// 実行中の呼び出しをまるごと捨てており、連続操作時に保存が抜け落ちることがあった）
let saveQueue = Promise.resolve();

let pendingSaves = 0;

// 保存に失敗した操作を記録しておき、リロード前に気づいて再試行できるようにする
// （失敗してもローカルの表示上のデータは変更しない＝巻き戻しはしない）
let failedSaves = [];

let currentCatType = 'income';

let categoriesEdited = {};

let currentCatEditIndex = -1;

let modalTriggerEl = null;

let toastTimeout = null;

let bsType = 'income';

let bsAcct = 'cash';

// data-click-action/data-change-action/data-input-action属性から呼び出す
// ハンドラのレジストリ。各ドメインファイルが自分の担当分をここに登録する
// （onclick属性への文字列埋め込みを避けるため）。
const CLICK_ACTIONS  = {};
const CHANGE_ACTIONS = {};
const INPUT_ACTIONS  = {};
