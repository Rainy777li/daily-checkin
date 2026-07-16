/* ============================================
   认证逻辑 — 登录 / 注册 / 退出
   支持 Supabase 模式 + 离线演示模式
   ============================================ */

// ---- 演示模式检测 ----
const DEMO_MODE = typeof SUPABASE_CONFIGURED !== 'undefined' && !SUPABASE_CONFIGURED;

// 检测当前是否应该用演示模式（SDK 加载失败时也降级）
function isDemoMode() {
  return DEMO_MODE || !supabase || window.SUPABASE_CONFIGURED_FALLBACK === false;
}
if (isDemoMode()) {
  console.log('🔧 演示模式 — 数据存储在本地浏览器，配置 Supabase 后自动切换');
  // 初始化演示数据 + 确保 admin 账号永远存在
  const users = JSON.parse(localStorage.getItem('demo_users') || '{}');
  if (!users['admin']) {
    users['admin'] = {
      password: 'admin123',
      is_admin: true,
      is_banned: false,
      created_at: new Date().toISOString()
    };
  }
  localStorage.setItem('demo_users', JSON.stringify(users));
}

// ---- 演示模式认证函数 ----
function demoGetUsers() {
  return JSON.parse(localStorage.getItem('demo_users') || '{}');
}

function demoSaveUsers(users) {
  localStorage.setItem('demo_users', JSON.stringify(users));
}

function demoLogin(username, password) {
  const users = demoGetUsers();
  const user = users[username];
  if (!user) return { ok: false, msg: '用户名不存在' };
  if (user.password !== password) return { ok: false, msg: '密码错误' };
  if (user.is_banned) return { ok: false, msg: '账号已被禁用，请联系管理员' };

  localStorage.setItem('demo_session', JSON.stringify({
    username,
    is_admin: user.is_admin || false,
    login_time: Date.now()
  }));
  return { ok: true };
}

function demoRegister(username, password) {
  const users = demoGetUsers();

  // 禁止注册 "admin" 用户名（系统保留）
  if (username.toLowerCase() === 'admin') {
    return { ok: false, msg: '该用户名为系统保留，请换一个' };
  }

  if (users[username]) return { ok: false, msg: '用户名已被注册，请换一个' };

  // 默认注册为普通用户，只有管理员才能提拔
  users[username] = {
    password,
    is_admin: false,
    is_banned: false,
    created_at: new Date().toISOString()
  };
  demoSaveUsers(users);

  localStorage.setItem('demo_session', JSON.stringify({
    username,
    is_admin: users[username].is_admin,
    login_time: Date.now()
  }));
  return { ok: true };
}

function demoGetSession() {
  const session = localStorage.getItem('demo_session');
  if (!session) return null;
  try {
    const data = JSON.parse(session);
    // 会话不过期
    return data;
  } catch { return null; }
}

// ---- DOM 元素 ----
const tabLogin    = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const formLogin   = document.getElementById('formLogin');
const formRegister= document.getElementById('formRegister');
const authMessage = document.getElementById('authMessage');
const btnLogin    = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');

// ---- Tab 切换 ----
tabLogin.addEventListener('click', () => switchTab('login'));
tabRegister.addEventListener('click', () => switchTab('register'));

function switchTab(tab) {
  const isLogin = tab === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabRegister.classList.toggle('active', !isLogin);
  formLogin.classList.toggle('active', isLogin);
  formRegister.classList.toggle('active', !isLogin);
  hideMessage();
  formLogin.reset();
  formRegister.reset();
}

// ---- 消息提示 ----
function showMessage(text, type) {
  authMessage.textContent = text;
  authMessage.className = `auth-message visible ${type}`;
}

function hideMessage() {
  authMessage.className = 'auth-message';
}

// ---- 辅助 ----
function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.origText = btn.textContent;
    btn.textContent = '处理中...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.origText || btn.textContent;
  }
}

function goApp() {
  window.location.href = 'app.html';
}

// ---- 表单提交：登录 ----
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    showMessage('请填写用户名和密码', 'error');
    return;
  }

  setLoading(btnLogin, true);

  // --- 演示模式登录 ---
  if (isDemoMode()) {
    const result = demoLogin(username, password);
    if (!result.ok) {
      showMessage(result.msg, 'error');
      setLoading(btnLogin, false);
      return;
    }
    showMessage('登录成功，正在跳转...', 'success');
    setTimeout(goApp, 400);
    return;
  }

  // --- Supabase 登录 ---
  try {
    const email = username + EMAIL_DOMAIN;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showMessage(error.message.includes('Invalid login') ? '用户名或密码错误' : error.message, 'error');
      setLoading(btnLogin, false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles').select('is_banned').eq('id', data.user.id).single();

    if (profile?.is_banned) {
      await supabase.auth.signOut();
      showMessage('账号已被禁用，请联系管理员', 'error');
      setLoading(btnLogin, false);
      return;
    }

    showMessage('登录成功，正在跳转...', 'success');
    setTimeout(goApp, 400);
  } catch (err) {
    showMessage('网络错误，请稍后重试', 'error');
    setLoading(btnLogin, false);
  }
});

// ---- 表单提交：注册 ----
formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessage();

  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const password2 = document.getElementById('regPassword2').value;

  if (!username || !password) {
    showMessage('请填写所有字段', 'error');
    return;
  }
  if (username.length < 2) {
    showMessage('用户名至少 2 个字符', 'error');
    return;
  }
  if (!/^[一-龥a-zA-Z0-9_]+$/.test(username)) {
    showMessage('用户名只能包含中文、英文、数字和下划线', 'error');
    return;
  }
  if (password.length < 6) {
    showMessage('密码至少 6 位', 'error');
    return;
  }
  if (password !== password2) {
    showMessage('两次输入的密码不一致', 'error');
    return;
  }

  setLoading(btnRegister, true);

  // --- 演示模式注册 ---
  if (isDemoMode()) {
    const result = demoRegister(username, password);
    if (!result.ok) {
      showMessage(result.msg, 'error');
      setLoading(btnRegister, false);
      return;
    }
    showMessage('注册成功！正在跳转...', 'success');
    setTimeout(goApp, 400);
    return;
  }

  // --- Supabase 注册 ---
  try {
    const email = username + EMAIL_DOMAIN;

    const { data: existing } = await supabase
      .from('profiles').select('id').eq('username', username).maybeSingle();

    if (existing) {
      showMessage('用户名已被注册，请换一个', 'error');
      setLoading(btnRegister, false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { username } }
    });

    if (error) {
      showMessage(error.message, 'error');
      setLoading(btnRegister, false);
      return;
    }

    if (data.user) {
      showMessage('注册成功！正在跳转...', 'success');
      setTimeout(goApp, 400);
    } else {
      showMessage('注册成功！请登录', 'success');
      switchTab('login');
      document.getElementById('loginUsername').value = username;
      setLoading(btnRegister, false);
    }
  } catch (err) {
    console.error('注册错误:', err);
    showMessage(err.message || '网络错误，请稍后重试', 'error');
    setLoading(btnRegister, false);
  }
});

// ---- 演示模式：显示管理员信息和重置按钮 ----
if (isDemoMode()) {
  document.addEventListener('DOMContentLoaded', () => {
    const users = demoGetUsers();
    const adminUser = Object.entries(users).find(([, u]) => u.is_admin);
    const hint = document.getElementById('adminHint');
    const footer = document.getElementById('authFooter');

    if (adminUser) {
      hint.innerHTML = `👑 管理员：<strong>${adminUser[0]}</strong>（默认密码见下方说明）`;
      hint.style.color = '#C8956C';
    }
    // 始终显示默认管理员提示
    hint.innerHTML = '👑 默认管理员：<strong>admin</strong> / 密码：<strong>admin123</strong>（请登录后修改密码）';
    hint.style.color = '#C8956C';

    if (footer) {
      footer.innerHTML = '🛡️ 演示模式 · 数据存储在本地浏览器 '
        + '<a href="#" id="resetDemo" style="color:var(--danger);font-weight:600;">[重置全部数据]</a>';
      document.getElementById('resetDemo').addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('⚠️ 确定要清空所有演示数据吗？（包括用户、打卡记录、积分等）\n\n此操作不可恢复！')) {
          localStorage.clear();
          alert('✅ 数据已清空！页面将刷新。');
          window.location.reload();
        }
      });
    }
  });
}

// ---- 就绪后检查登录状态 ----
function whenReady(fn) {
  if (isDemoMode()) { fn(); return; }
  if (window.SUPABASE_CONFIGURED_FALLBACK === false) {
    console.warn('⚠️ 降级为演示模式');
    fn();
    return;
  }
  window.addEventListener('supabase-ready', fn, { once: true });
}

whenReady(async function() {
  const actualDemo = isDemoMode();

  if (actualDemo) {
    if (demoGetSession()) goApp();
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) goApp();
});
