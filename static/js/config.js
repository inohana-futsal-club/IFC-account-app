/* ================================================================
   CONFIG
================================================================ */
const CLIENT_ID = '387302608037-et2svb68cnf7lm3gltpn67u3ovbplrjq.apps.googleusercontent.com';

const SHEET_ID  = '1J-kv2Lwc4qBxVAvBGn0JCFS1BSc8UuXTwg1G2xY0nqc';

// drive.fileはアプリが作成/開いたファイルのみにアクセスできる限定スコープ（バックアップの複製作成に使用）
const SCOPES    = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';

const API_BASE  = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

// IFC参加日数APIプロキシ（Google Apps Script Webアプリ）のexec URL。
// APIキーはこのプロキシの中(Script Properties)にのみ保存され、ブラウザには渡さない。
// デプロイ手順は gas/README.md を参照。未設定(空文字)の間はIFC連携ボタンは無効。
const IFC_PROXY_URL = '';

// gas側でPROXY_ACCESS_TOKENを設定した場合のみ、ここに同じ値を設定する（任意）
const IFC_PROXY_TOKEN = '';

const IFC_PROXY_TIMEOUT_MS = 10000;

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

// categoriesシートを新規作成した場合の初期科目（空だと科目セレクトが空になりclassificationが保存できないため）
const DEFAULT_CATEGORIES = [
  ['income',  '部費',     '部費',       0],
  ['income',  'その他収入', '繰越金',    0],
  ['income',  'その他収入', '雑収入',    1],
  ['expense', '活動費',   'コート代',    0],
  ['expense', '活動費',   '用具費',     1],
  ['expense', '活動費',   '大会参加費',  2],
  ['expense', '運営費',   '交通費',     0],
  ['expense', '運営費',   '雑費',      1],
];
