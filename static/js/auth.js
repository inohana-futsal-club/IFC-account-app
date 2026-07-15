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

// アクセストークン失効時に表示する。閉じるボタンは設けず、気づかず操作を
// 続けてしまわないようにする（再ログインで解消するまで表示し続ける）
function showSessionExpiredModal() {
  openM('m-session-expired');
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
