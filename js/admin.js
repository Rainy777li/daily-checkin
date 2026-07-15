/* ============================================
   管理员后台逻辑
   ============================================ */

const DEMO_MODE = typeof SUPABASE_CONFIGURED !== 'undefined' && !SUPABASE_CONFIGURED;
let adminUser = null;

// ---- 会话 + 权限检查 ----
async function checkAdmin() {
  if (DEMO_MODE) {
    const session = JSON.parse(localStorage.getItem('demo_session') || 'null');
    if (!session || !session.is_admin) { alert('无管理员权限'); window.location.href = 'index.html'; return; }
    adminUser = session;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (!profile?.is_admin) { alert('无管理员权限'); window.location.href = 'app.html'; return; }
    adminUser = { username: profile.username, is_admin: true };
  }
}

// ---- Tab 导航 ----
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.getElementById('sec' + tab.dataset.section.charAt(0).toUpperCase() + tab.dataset.section.slice(1)).classList.add('active');

    // 切换时刷新对应数据
    const sec = tab.dataset.section;
    if (sec === 'dashboard') refreshDashboard();
    else if (sec === 'tasks') refreshTasks();
    else if (sec === 'users') refreshUsers();
    else if (sec === 'rankings') refreshRankAdmin();
    else if (sec === 'submissions') refreshSubmissions();
  });
});

// ---- 返回应用 ----
document.getElementById('btnBackToApp').addEventListener('click', () => { window.location.href = 'app.html'; });

// ---- 辅助 ----
function demoLoad(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function demoSave(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

// ============================================
// 1. 仪表盘
// ============================================
function refreshDashboard() {
  const users = demoLoad('demo_users', {});
  const checkins = demoLoad('demo_checkins', {});
  const today = new Date().toISOString().split('T')[0];

  const userList = Object.entries(users).filter(([,u]) => !u.is_banned);
  const totalUsers = userList.length;
  const todayChecked = new Set();
  Object.values(checkins).forEach(c => { if (c.checkin_date === today) todayChecked.add(c.user_id); });

  // 统计卡片
  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${totalUsers}</div><div class="stat-desc">👥 总用户</div></div>
    <div class="stat-card"><div class="stat-num">${todayChecked.size}</div><div class="stat-desc">✅ 今日打卡人数</div></div>
    <div class="stat-card"><div class="stat-num">${totalUsers ? Math.round(todayChecked.size / totalUsers * 100) : 0}%</div><div class="stat-desc">📊 今日打卡率</div></div>
    <div class="stat-card"><div class="stat-num">${Object.keys(checkins).length}</div><div class="stat-desc">📝 总打卡记录</div></div>
  `;

  // TOP 5
  const userPoints = {};
  Object.values(checkins).forEach(c => {
    if (!userPoints[c.user_id]) userPoints[c.user_id] = 0;
    userPoints[c.user_id] += c.points_earned || 0;
  });
  const ranked = Object.entries(userPoints)
    .filter(([uid]) => users[uid] && !users[uid].is_banned)
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  document.getElementById('dashTop5').innerHTML = ranked.length === 0
    ? '<p style="text-align:center;color:var(--text-muted);padding:12px;">暂无数据</p>'
    : ranked.map(([uid, pts], i) => `
      <div class="ranking-item">
        <span class="ranking-rank">${['🥇','🥈','🥉'][i] || i+1}</span>
        <div class="ranking-info"><div class="ranking-name">${uid}</div></div>
        <span class="ranking-points" style="font-weight:700;">${pts} 分</span>
      </div>`).join('');
}

// ============================================
// 2. 任务管理
// ============================================
let editTaskId = null;

function refreshTasks() {
  const tasks = demoLoad('demo_tasks', [
    { id: 1, name: '运动 30 分钟', icon: '🏃', points: 10, sort_order: 1, is_active: true },
    { id: 2, name: '阅读 20 分钟', icon: '📖', points: 10, sort_order: 2, is_active: true },
    { id: 3, name: '喝 8 杯水',     icon: '💧', points: 10, sort_order: 3, is_active: true },
    { id: 4, name: '早睡 23:00',    icon: '😴', points: 15, sort_order: 4, is_active: true },
    { id: 5, name: '健康饮食',      icon: '🍎', points: 10, sort_order: 5, is_active: true },
    { id: 6, name: '冥想 10 分钟',  icon: '🧘', points: 10, sort_order: 6, is_active: true },
    { id: 7, name: '写日记',        icon: '📝', points: 10, sort_order: 7, is_active: true },
    { id: 8, name: '学习 1 小时',   icon: '🎯', points: 20, sort_order: 8, is_active: true },
  ]);

  document.getElementById('taskListAdmin').innerHTML = tasks.sort((a,b) => a.sort_order - b.sort_order).map(t => `
    <div class="admin-list-item">
      <span style="font-size:1.5rem;">${t.icon}</span>
      <div class="item-info">
        <div class="item-title">${t.name} <span class="tag ${t.is_active ? 'tag-active' : 'tag-inactive'}">${t.is_active ? '启用' : '禁用'}</span></div>
        <div class="item-sub">+${t.points} 积分 · 排序 ${t.sort_order}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-sm btn-outline" onclick="editTask(${t.id})">✏️</button>
        <button class="btn btn-sm btn-outline" onclick="toggleTask(${t.id})">${t.is_active ? '⏸' : '▶'}</button>
        <button class="btn btn-sm btn-outline" onclick="deleteTask(${t.id})" style="color:var(--danger);">🗑</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('btnSaveTask').addEventListener('click', () => {
  const name = document.getElementById('taskName').value.trim();
  const icon = document.getElementById('taskIcon').value.trim() || '✅';
  const points = parseInt(document.getElementById('taskPoints').value) || 10;
  const sort = parseInt(document.getElementById('taskSort').value) || 0;
  if (!name) return alert('请输入任务名称');

  const tasks = demoLoad('demo_tasks', []);

  if (editTaskId) {
    const idx = tasks.findIndex(t => t.id === editTaskId);
    if (idx >= 0) { tasks[idx].name = name; tasks[idx].icon = icon; tasks[idx].points = points; tasks[idx].sort_order = sort; }
  } else {
    const maxId = tasks.length ? Math.max(...tasks.map(t => t.id)) : 0;
    tasks.push({ id: maxId + 1, name, icon, points, sort_order: sort, is_active: true });
  }
  demoSave('demo_tasks', tasks);
  resetTaskForm();
  refreshTasks();
});

function editTask(id) {
  const tasks = demoLoad('demo_tasks', []);
  const t = tasks.find(task => task.id === id);
  if (!t) return;
  editTaskId = id;
  document.getElementById('taskFormTitle').textContent = '✏️ 编辑任务';
  document.getElementById('taskIcon').value = t.icon;
  document.getElementById('taskName').value = t.name;
  document.getElementById('taskPoints').value = t.points;
  document.getElementById('taskSort').value = t.sort_order;
  document.getElementById('editTaskId').value = id;
  document.getElementById('btnCancelEdit').classList.remove('hidden');
  document.querySelector('#secTasks .form-card').scrollIntoView({ behavior: 'smooth' });
}

function toggleTask(id) {
  const tasks = demoLoad('demo_tasks', []);
  const t = tasks.find(task => task.id === id);
  if (t) { t.is_active = !t.is_active; demoSave('demo_tasks', tasks); refreshTasks(); }
}

function deleteTask(id) {
  if (!confirm('确定删除此任务？')) return;
  let tasks = demoLoad('demo_tasks', []);
  tasks = tasks.filter(t => t.id !== id);
  demoSave('demo_tasks', tasks);
  if (editTaskId === id) resetTaskForm();
  refreshTasks();
}

function resetTaskForm() {
  editTaskId = null;
  document.getElementById('taskFormTitle').textContent = '➕ 新建任务';
  document.getElementById('taskIcon').value = '';
  document.getElementById('taskName').value = '';
  document.getElementById('taskPoints').value = '10';
  document.getElementById('taskSort').value = '0';
  document.getElementById('editTaskId').value = '';
  document.getElementById('btnCancelEdit').classList.add('hidden');
}

document.getElementById('btnCancelEdit').addEventListener('click', resetTaskForm);

// ============================================
// 3. 用户管理
// ============================================
function refreshUsers() {
  const users = demoLoad('demo_users', {});
  const checkins = demoLoad('demo_checkins', {});

  // 计算每个用户积分
  const userPoints = {};
  Object.values(checkins).forEach(c => {
    if (!userPoints[c.user_id]) userPoints[c.user_id] = 0;
    userPoints[c.user_id] += c.points_earned || 0;
  });

  document.getElementById('userListAdmin').innerHTML = Object.entries(users).map(([uname, u]) => `
    <div class="admin-list-item">
      <span style="font-size:1.5rem;">👤</span>
      <div class="item-info">
        <div class="item-title">${uname} ${u.is_admin ? '👑 管理员' : '👤 用户'} ${u.is_banned ? '<span class="tag tag-inactive">已封禁</span>' : ''}</div>
        <div class="item-sub">积分 ${userPoints[uname] || 0} · 连续 ${u.streak || 0} 天 · ${new Date(u.created_at).toLocaleDateString('zh-CN')} 注册</div>
      </div>
      <div class="item-actions">
        ${uname !== 'admin' ? `<button class="btn btn-sm btn-outline" onclick="toggleAdmin('${uname}')">
          ${u.is_admin ? '⬇ 降级' : '⬆ 提拔'}
        </button>` : ''}
        ${!u.is_admin ? `<button class="btn btn-sm btn-outline" onclick="toggleBan('${uname}')">
          ${u.is_banned ? '🔓 解禁' : '🔒 禁用'}
        </button>` : '<span style="font-size:0.7rem;color:var(--text-muted);">超级管理员</span>'}
      </div>
    </div>
  `).join('');
}

function toggleAdmin(username) {
  const users = demoLoad('demo_users', {});
  if (users[username] && username !== 'admin') {
    users[username].is_admin = !users[username].is_admin;
    demoSave('demo_users', users);
    refreshUsers();
  }
}

function toggleBan(username) {
  const users = demoLoad('demo_users', {});
  if (users[username] && !users[username].is_admin) {
    users[username].is_banned = !users[username].is_banned;
    demoSave('demo_users', users);
    refreshUsers();
  }
}

// ============================================
// 4. 榜单管理
// ============================================
const RANK_CATEGORIES = [
  { id: 1, name: '微博粉丝榜', icon: '📊' },
  { id: 2, name: '抖音播放榜', icon: '🎵' },
  { id: 3, name: '超话活跃榜', icon: '🔥' },
  { id: 4, name: 'B站涨粉榜',  icon: '📺' },
];

function refreshRankAdmin() {
  // 分类下拉
  document.getElementById('rankCatSelect').innerHTML = RANK_CATEGORIES.map(c =>
    `<option value="${c.id}">${c.icon} ${c.name}</option>`
  ).join('');

  // 现有条目
  const selectedCat = parseInt(document.getElementById('rankCatSelect').value) || 1;
  const items = demoLoad(`demo_rank_items_${selectedCat}`, []);
  const container = document.getElementById('rankItemsAdmin');

  container.innerHTML = `<h4 style="margin-top:12px;margin-bottom:8px;">📋 当前分类条目 (${items.length})</h4>` +
    (items.length === 0 ? '<p style="color:var(--text-muted);text-align:center;">暂无数据，请录入</p>' :
    items.sort((a, b) => b.value - a.value).map((item, i) => `
      <div class="admin-list-item">
        <span style="font-weight:800;width:24px;">${i + 1}</span>
        <div class="item-info">
          <div class="item-title">${item.name}</div>
          <div class="item-sub">当前: ${item.value.toLocaleString()} · 上次: ${item.prev_value.toLocaleString()} · 涨幅: ${item.change_amount > 0 ? '+' : ''}${item.change_amount.toLocaleString()}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-outline" onclick="editRankItem(${selectedCat},'${item.name}')">✏️</button>
          <button class="btn btn-sm btn-outline" onclick="deleteRankItem(${selectedCat},'${item.name}')" style="color:var(--danger);">🗑</button>
        </div>
      </div>
    `).join(''));
}

document.getElementById('rankCatSelect').addEventListener('change', refreshRankAdmin);

document.getElementById('btnSaveRankItem').addEventListener('click', () => {
  const catId = parseInt(document.getElementById('rankCatSelect').value);
  const name = document.getElementById('rankItemName').value.trim();
  const value = parseInt(document.getElementById('rankItemValue').value) || 0;
  let prevValue = parseInt(document.getElementById('rankItemPrevValue').value);

  if (!name) return alert('请输入条目名称');

  const items = demoLoad(`demo_rank_items_${catId}`, []);
  const existing = items.find(i => i.name === name);

  // 如果没填上一次数值，自动取上次记录的 value
  if (isNaN(prevValue) && existing) prevValue = existing.value;
  if (isNaN(prevValue)) prevValue = value;

  const change = value - prevValue;
  const percent = prevValue > 0 ? parseFloat(((change / prevValue) * 100).toFixed(1)) : 0;

  if (existing) {
    existing.value = value;
    existing.prev_value = prevValue;
    existing.change_amount = change;
    existing.change_percent = percent;
  } else {
    items.push({ name, value, prev_value: prevValue, change_amount: change, change_percent: percent });
  }
  demoSave(`demo_rank_items_${catId}`, items);

  // 同时更新 demo_prev 键（供榜单页面对比用）
  const existingIdx = items.findIndex(i => i.name === name);
  if (existingIdx >= 0) {
    localStorage.setItem(`demo_prev_${catId}_${existingIdx}`, value);
  }

  document.getElementById('rankItemName').value = '';
  document.getElementById('rankItemValue').value = '';
  document.getElementById('rankItemPrevValue').value = '';
  refreshRankAdmin();
  alert('✅ 数据已保存！切回榜单页刷新即可看到更新');
});

function editRankItem(catId, name) {
  const items = demoLoad(`demo_rank_items_${catId}`, []);
  const item = items.find(i => i.name === name);
  if (!item) return;
  document.getElementById('rankCatSelect').value = catId;
  document.getElementById('rankItemName').value = item.name;
  document.getElementById('rankItemValue').value = item.value;
  document.getElementById('rankItemPrevValue').value = item.prev_value;
  document.querySelector('#secRankings .form-card').scrollIntoView({ behavior: 'smooth' });
}

function deleteRankItem(catId, name) {
  if (!confirm(`确定删除「${name}」？`)) return;
  let items = demoLoad(`demo_rank_items_${catId}`, []);
  items = items.filter(i => i.name !== name);
  demoSave(`demo_rank_items_${catId}`, items);
  refreshRankAdmin();
}

// ============================================
// 5. 截图审核
// ============================================
function refreshSubmissions() {
  const submissions = demoLoad('demo_submissions', []);
  const container = document.getElementById('submissionsAdmin');

  if (submissions.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">暂无待审核截图</p>';
    return;
  }

  const pending = submissions.filter(s => s.status === 'pending');
  const done = submissions.filter(s => s.status !== 'pending');

  container.innerHTML = `
    ${pending.length > 0 ? `<h4 style="margin-bottom:8px;">⏳ 待审核 (${pending.length})</h4>` : ''}
    ${pending.map(s => `
      <div class="admin-list-item">
        <img class="screenshot-thumb" src="${s.screenshot}" onclick="previewImage('${s.screenshot}')" alt="截图">
        <div class="item-info">
          <div class="item-title">${s.username} · ${s.app_name}</div>
          <div class="item-sub">${new Date(s.submitted_at).toLocaleString('zh-CN')}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-success" onclick="reviewSubmission('${s.id}', true)">✅</button>
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;" onclick="reviewSubmission('${s.id}', false)">❌</button>
        </div>
      </div>
    `).join('')}
    ${done.length > 0 ? `<h4 style="margin:12px 0 8px;">📝 已处理 (${done.length})</h4>` : ''}
    ${done.slice(0, 20).map(s => `
      <div class="admin-list-item" style="opacity:0.7;">
        <div class="item-info">
          <div class="item-title">${s.username} · ${s.app_name}</div>
          <div class="item-sub">
            <span class="tag ${s.status === 'approved' ? 'tag-approved' : 'tag-rejected'}">${s.status === 'approved' ? '✅ 已通过' : '❌ 未通过'}</span>
            ${s.status === 'approved' ? `+${s.points_awarded}分` : s.review_comment || ''}
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

function reviewSubmission(subId, approve) {
  const comment = approve ? '' : (prompt('拒绝理由（可选）：') || '');
  const result = window.adminReviewSubmission ? window.adminReviewSubmission(subId, approve, comment) : adminReviewLocal(subId, approve, comment);
  if (result) {
    alert(approve ? '✅ 已通过，积分已发放' : '❌ 已拒绝');
    refreshSubmissions();
  }
}

function adminReviewLocal(subId, approve, comment) {
  const submissions = demoLoad('demo_submissions', []);
  const idx = submissions.findIndex(s => s.id === subId);
  if (idx === -1) return false;
  submissions[idx].status = approve ? 'approved' : 'rejected';
  submissions[idx].reviewed_at = new Date().toISOString();
  submissions[idx].review_comment = comment || '';
  if (approve) {
    submissions[idx].points_awarded = 5;
    const users = demoLoad('demo_users', {});
    const username = submissions[idx].username;
    if (users[username]) {
      users[username].total_points = (users[username].total_points || 0) + 5;
      demoSave('demo_users', users);
    }
  }
  demoSave('demo_submissions', submissions);
  return true;
}

function previewImage(src) {
  const overlay = document.createElement('div');
  overlay.className = 'img-preview-overlay';
  overlay.innerHTML = `<img src="${src}" alt="截图预览">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

// ============================================
// 启动
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  if (DEMO_MODE) {
    await checkAdmin();
  } else {
    // Supabase 模式：等待 SDK 就绪
    const timeout = setTimeout(() => { alert('SDK 加载超时'); }, 8000);
    await new Promise(resolve => {
      if (window.SUPABASE_CONFIGURED_FALLBACK === false || DEMO_MODE) resolve();
      else window.addEventListener('supabase-ready', resolve, { once: true });
    });
    clearTimeout(timeout);
    await checkAdmin();
  }
  refreshDashboard();
});
