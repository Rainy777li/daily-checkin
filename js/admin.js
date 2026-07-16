/* ============================================
   管理员后台逻辑（Supabase + 演示模式双支持）
   ============================================ */

const DEMO_MODE = typeof SUPABASE_CONFIGURED !== 'undefined' && !SUPABASE_CONFIGURED;
function isDemoMode() { return DEMO_MODE || !supabase || window.SUPABASE_CONFIGURED_FALLBACK === false; }
let adminUser = null;

// ---- 辅助 ----
function dLoad(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function dSave(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

// ---- 会话 + 权限检查 ----
async function checkAdmin() {
  if (isDemoMode()) {
    const session = JSON.parse(localStorage.getItem('demo_session') || 'null');
    if (!session || !session.is_admin) { alert('无管理员权限'); window.location.href = 'index.html'; return; }
    adminUser = session;
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = 'index.html'; return; }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
    if (!profile?.is_admin) { alert('无管理员权限'); window.location.href = 'app.html'; return; }
    adminUser = { id: profile.id, username: profile.username, is_admin: true };
  }
}

// ---- Tab 导航 ----
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const secId = 'sec' + tab.dataset.section.charAt(0).toUpperCase() + tab.dataset.section.slice(1);
    document.getElementById(secId).classList.add('active');
    const sec = tab.dataset.section;
    if (sec === 'dashboard') refreshDashboard();
    else if (sec === 'tasks') refreshTasks();
    else if (sec === 'users') refreshUsers();
    else if (sec === 'rankings') refreshRankAdmin();
    else if (sec === 'submissions') refreshSubmissions();
  });
});

document.getElementById('btnBackToApp').addEventListener('click', () => { window.location.href = 'app.html'; });

// ============================================
// 1. 仪表盘
// ============================================
async function refreshDashboard() {
  if (isDemoMode()) {
    refreshDashboardDemo(); return;
  }
  // Supabase 模式
  const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_banned', false);
  const today = new Date().toISOString().split('T')[0];
  const { count: todayChecked } = await supabase.from('checkins').select('*', { count: 'exact', head: true }).eq('checkin_date', today);
  const { count: totalCheckins } = await supabase.from('checkins').select('*', { count: 'exact', head: true });

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${totalUsers || 0}</div><div class="stat-desc">👥 总用户</div></div>
    <div class="stat-card"><div class="stat-num">${todayChecked || 0}</div><div class="stat-desc">✅ 今日打卡人数</div></div>
    <div class="stat-card"><div class="stat-num">${totalUsers ? Math.round((todayChecked||0) / totalUsers * 100) : 0}%</div><div class="stat-desc">📊 今日打卡率</div></div>
    <div class="stat-card"><div class="stat-num">${totalCheckins || 0}</div><div class="stat-desc">📝 总打卡记录</div></div>
  `;

  // TOP 5
  const { data: profiles } = await supabase.from('profiles').select('username, total_points').order('total_points', { ascending: false }).limit(5);
  document.getElementById('dashTop5').innerHTML = profiles && profiles.length > 0
    ? profiles.map((p, i) => `
      <div class="ranking-item">
        <span class="ranking-rank">${['🥇','🥈','🥉'][i] || i+1}</span>
        <div class="ranking-info"><div class="ranking-name">${p.username}</div></div>
        <span style="font-weight:700;">${p.total_points} 分</span>
      </div>`).join('')
    : '<p style="text-align:center;color:var(--text-muted);padding:12px;">暂无数据</p>';
}

function refreshDashboardDemo() {
  const users = dLoad('demo_users', {});
  const checkins = dLoad('demo_checkins', {});
  const today = new Date().toISOString().split('T')[0];
  const todayChecked = new Set();
  Object.values(checkins).forEach(c => { if (c.checkin_date === today) todayChecked.add(c.user_id); });
  const totalUsers = Object.keys(users).filter(u => !users[u].is_banned).length;
  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card"><div class="stat-num">${totalUsers}</div><div class="stat-desc">👥 总用户</div></div>
    <div class="stat-card"><div class="stat-num">${todayChecked.size}</div><div class="stat-desc">✅ 今日打卡人数</div></div>
    <div class="stat-card"><div class="stat-num">${totalUsers ? Math.round(todayChecked.size/totalUsers*100) : 0}%</div><div class="stat-desc">📊 今日打卡率</div></div>
    <div class="stat-card"><div class="stat-num">${Object.keys(checkins).length}</div><div class="stat-desc">📝 总打卡记录</div></div>
  `;
}

// ============================================
// 2. 任务管理
// ============================================
let editTaskId = null;

async function refreshTasks() {
  let tasks;
  if (isDemoMode()) {
    tasks = dLoad('demo_tasks', getDefaultTasks());
  } else {
    const { data } = await supabase.from('tasks').select('*').order('sort_order');
    tasks = data || [];
  }
  renderTaskList(tasks);
}

function getDefaultTasks() {
  return [
    { id: 1, name: '运动 30 分钟', icon: '🏃', points: 10, sort_order: 1, is_active: true },
    { id: 2, name: '阅读 20 分钟', icon: '📖', points: 10, sort_order: 2, is_active: true },
    { id: 3, name: '喝 8 杯水',     icon: '💧', points: 10, sort_order: 3, is_active: true },
    { id: 4, name: '早睡 23:00',    icon: '😴', points: 15, sort_order: 4, is_active: true },
    { id: 5, name: '健康饮食',      icon: '🍎', points: 10, sort_order: 5, is_active: true },
    { id: 6, name: '冥想 10 分钟',  icon: '🧘', points: 10, sort_order: 6, is_active: true },
    { id: 7, name: '写日记',        icon: '📝', points: 10, sort_order: 7, is_active: true },
    { id: 8, name: '学习 1 小时',   icon: '🎯', points: 20, sort_order: 8, is_active: true },
  ];
}

function renderTaskList(tasks) {
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

document.getElementById('btnSaveTask').addEventListener('click', async () => {
  const name = document.getElementById('taskName').value.trim();
  const icon = document.getElementById('taskIcon').value.trim() || '✅';
  const points = parseInt(document.getElementById('taskPoints').value) || 10;
  const sort = parseInt(document.getElementById('taskSort').value) || 0;
  if (!name) return alert('请输入任务名称');

  if (isDemoMode()) {
    const tasks = dLoad('demo_tasks', []);
    if (editTaskId) {
      const idx = tasks.findIndex(t => t.id === editTaskId);
      if (idx >= 0) { tasks[idx].name = name; tasks[idx].icon = icon; tasks[idx].points = points; tasks[idx].sort_order = sort; }
    } else {
      tasks.push({ id: Date.now(), name, icon, points, sort_order: sort, is_active: true });
    }
    dSave('demo_tasks', tasks);
  } else {
    if (editTaskId) {
      await supabase.from('tasks').update({ name, icon, points, sort_order: sort }).eq('id', editTaskId);
    } else {
      await supabase.from('tasks').insert({ name, icon, points, sort_order: sort, is_active: true });
    }
  }
  resetTaskForm();
  refreshTasks();
});

async function editTask(id) {
  let task;
  if (isDemoMode()) {
    task = dLoad('demo_tasks', []).find(t => t.id === id);
  } else {
    const { data } = await supabase.from('tasks').select('*').eq('id', id).single();
    task = data;
  }
  if (!task) return;
  editTaskId = id;
  document.getElementById('taskFormTitle').textContent = '✏️ 编辑任务';
  document.getElementById('taskIcon').value = task.icon;
  document.getElementById('taskName').value = task.name;
  document.getElementById('taskPoints').value = task.points;
  document.getElementById('taskSort').value = task.sort_order;
  document.getElementById('editTaskId').value = id;
  document.getElementById('btnCancelEdit').classList.remove('hidden');
  document.querySelector('#secTasks .form-card').scrollIntoView({ behavior: 'smooth' });
}

async function toggleTask(id) {
  if (isDemoMode()) {
    const tasks = dLoad('demo_tasks', []);
    const t = tasks.find(t => t.id === id);
    if (t) { t.is_active = !t.is_active; dSave('demo_tasks', tasks); }
  } else {
    const { data: t } = await supabase.from('tasks').select('is_active').eq('id', id).single();
    if (t) await supabase.from('tasks').update({ is_active: !t.is_active }).eq('id', id);
  }
  refreshTasks();
}

async function deleteTask(id) {
  if (!confirm('确定删除此任务？')) return;
  if (isDemoMode()) {
    dSave('demo_tasks', dLoad('demo_tasks', []).filter(t => t.id !== id));
  } else {
    await supabase.from('tasks').delete().eq('id', id);
  }
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
async function refreshUsers() {
  if (isDemoMode()) {
    refreshUsersDemo(); return;
  }

  const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  document.getElementById('userListAdmin').innerHTML = (profiles || []).map(p => `
    <div class="admin-list-item">
      <span style="font-size:1.5rem;">👤</span>
      <div class="item-info">
        <div class="item-title">${p.username} ${p.is_admin ? '👑 管理员' : '👤 用户'} ${p.is_banned ? '<span class="tag tag-inactive">已封禁</span>' : ''}</div>
        <div class="item-sub">积分 ${p.total_points || 0} · 连续 ${p.streak || 0} 天 · ${new Date(p.created_at).toLocaleDateString('zh-CN')} 注册</div>
      </div>
      <div class="item-actions">
        ${!p.is_admin ? `<button class="btn btn-sm btn-outline" onclick="toggleBanSupabase('${p.id}', ${!p.is_banned})">${p.is_banned ? '🔓 解禁' : '🔒 禁用'}</button>` : '<span style="font-size:0.7rem;color:var(--text-muted);">管理员</span>'}
      </div>
    </div>
  `).join('');
}

async function toggleBanSupabase(userId, shouldBan) {
  await supabase.from('profiles').update({ is_banned: shouldBan }).eq('id', userId);
  refreshUsers();
}

function refreshUsersDemo() {
  const users = dLoad('demo_users', {});
  const checkins = dLoad('demo_checkins', {});
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
        <div class="item-sub">积分 ${userPoints[uname] || 0} · 连续 ${u.streak || 0} 天</div>
      </div>
      <div class="item-actions">
        ${uname !== 'admin' ? `<button class="btn btn-sm btn-outline" onclick="toggleAdminDemo('${uname}')">${u.is_admin ? '⬇ 降级' : '⬆ 提拔'}</button>` : ''}
        ${!u.is_admin ? `<button class="btn btn-sm btn-outline" onclick="toggleBanDemo('${uname}')">${u.is_banned ? '🔓 解禁' : '🔒 禁用'}</button>` : '<span style="font-size:0.7rem;color:var(--text-muted);">超级管理员</span>'}
      </div>
    </div>
  `).join('');
}

function toggleAdminDemo(username) {
  const users = dLoad('demo_users', {});
  if (users[username] && username !== 'admin') { users[username].is_admin = !users[username].is_admin; dSave('demo_users', users); refreshUsers(); }
}
function toggleBanDemo(username) {
  const users = dLoad('demo_users', {});
  if (users[username] && !users[username].is_admin) { users[username].is_banned = !users[username].is_banned; dSave('demo_users', users); refreshUsers(); }
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

async function refreshRankAdmin() {
  document.getElementById('rankCatSelect').innerHTML = RANK_CATEGORIES.map(c =>
    `<option value="${c.id}">${c.icon} ${c.name}</option>`
  ).join('');

  const selectedCat = parseInt(document.getElementById('rankCatSelect').value) || 1;
  let items;

  if (isDemoMode()) {
    items = dLoad(`demo_rank_items_${selectedCat}`, []);
  } else {
    const { data } = await supabase.from('ranking_items').select('*').eq('category_id', selectedCat).order('value', { ascending: false });
    items = data || [];
  }

  document.getElementById('rankItemsAdmin').innerHTML = `<h4 style="margin-top:12px;margin-bottom:8px;">📋 当前分类条目 (${items.length})</h4>` +
    (items.length === 0 ? '<p style="color:var(--text-muted);text-align:center;">暂无数据，请录入</p>' :
    items.map((item, i) => `
      <div class="admin-list-item">
        <span style="font-weight:800;width:24px;">${i + 1}</span>
        <div class="item-info">
          <div class="item-title">${item.name}</div>
          <div class="item-sub">当前: ${(item.value||0).toLocaleString()} · 上次: ${(item.prev_value||0).toLocaleString()} · 涨幅: ${(item.change_amount||0) > 0 ? '+' : ''}${(item.change_amount||0).toLocaleString()}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-outline" onclick="editRankItem(${selectedCat},'${item.name.replace(/'/g, "\\'")}')">✏️</button>
          <button class="btn btn-sm btn-outline" onclick="deleteRankItem(${selectedCat},'${item.name.replace(/'/g, "\\'")}')" style="color:var(--danger);">🗑</button>
        </div>
      </div>
    `).join(''));
}
document.getElementById('rankCatSelect').addEventListener('change', refreshRankAdmin);

document.getElementById('btnSaveRankItem').addEventListener('click', async () => {
  const catId = parseInt(document.getElementById('rankCatSelect').value);
  const name = document.getElementById('rankItemName').value.trim();
  const value = parseInt(document.getElementById('rankItemValue').value) || 0;
  let prevValue = parseInt(document.getElementById('rankItemPrevValue').value);
  if (!name) return alert('请输入条目名称');

  const change = value - prevValue;
  const percent = prevValue > 0 ? parseFloat(((change / prevValue) * 100).toFixed(1)) : 0;

  if (isDemoMode()) {
    const items = dLoad(`demo_rank_items_${catId}`, []);
    const existing = items.find(i => i.name === name);
    if (isNaN(prevValue) && existing) prevValue = existing.value;
    if (isNaN(prevValue)) prevValue = value;
    if (existing) {
      existing.value = value; existing.prev_value = prevValue; existing.change_amount = value - prevValue; existing.change_percent = percent;
    } else {
      items.push({ name, value, prev_value: prevValue, change_amount: value - prevValue, change_percent: percent });
    }
    dSave(`demo_rank_items_${catId}`, items);
  } else {
    // 查找是否已存在
    const { data: existing } = await supabase.from('ranking_items').select('*').eq('category_id', catId).eq('name', name).maybeSingle();
    if (isNaN(prevValue) && existing) prevValue = existing.value;
    if (isNaN(prevValue)) prevValue = value;

    if (existing) {
      await supabase.from('ranking_items').update({ value, prev_value: prevValue, change_amount: value - prevValue, change_percent: percent }).eq('id', existing.id);
    } else {
      // 获取当前排名
      const { count } = await supabase.from('ranking_items').select('*', { count: 'exact', head: true }).eq('category_id', catId);
      await supabase.from('ranking_items').insert({ category_id: catId, name, value, prev_value: prevValue, change_amount: value - prevValue, change_percent: percent, rank: (count || 0) + 1 });
    }
  }

  document.getElementById('rankItemName').value = '';
  document.getElementById('rankItemValue').value = '';
  document.getElementById('rankItemPrevValue').value = '';
  refreshRankAdmin();
  alert('✅ 数据已保存！');
});

async function editRankItem(catId, name) {
  let item;
  if (isDemoMode()) {
    item = dLoad(`demo_rank_items_${catId}`, []).find(i => i.name === name);
  } else {
    const { data } = await supabase.from('ranking_items').select('*').eq('category_id', catId).eq('name', name).maybeSingle();
    item = data;
  }
  if (!item) return;
  document.getElementById('rankCatSelect').value = catId;
  document.getElementById('rankItemName').value = item.name;
  document.getElementById('rankItemValue').value = item.value;
  document.getElementById('rankItemPrevValue').value = item.prev_value || '';
  document.querySelector('#secRankings .form-card').scrollIntoView({ behavior: 'smooth' });
}

async function deleteRankItem(catId, name) {
  if (!confirm(`确定删除「${name}」？`)) return;
  if (isDemoMode()) {
    dSave(`demo_rank_items_${catId}`, dLoad(`demo_rank_items_${catId}`, []).filter(i => i.name !== name));
  } else {
    await supabase.from('ranking_items').delete().eq('category_id', catId).eq('name', name);
  }
  refreshRankAdmin();
}

// ============================================
// 5. 截图审核
// ============================================
async function refreshSubmissions() {
  if (isDemoMode()) {
    refreshSubmissionsDemo(); return;
  }

  // Supabase 模式：同时检查 Supabase 和 localStorage
  let allSubmissions = [];
  let hasSupabaseData = false;

  try {
    const { data: supabaseSubs, error } = await supabase
      .from('submissions').select('*').order('submitted_at', { ascending: false }).limit(50);
    if (!error && supabaseSubs) {
      allSubmissions = supabaseSubs;
      hasSupabaseData = true;
    }
  } catch (e) {
    console.warn('⚠️ Supabase submissions 查询失败:', e.message);
  }

  // 同时读取 localStorage 中的提交（作为补充/备份）
  const localSubs = dLoad('demo_submissions', []);
  if (localSubs.length > 0) {
    if (!hasSupabaseData) {
      allSubmissions = localSubs;
    } else {
      // 合并：把 localStorage 中有但 Supabase 中没有的也加进来
      const supabaseIds = new Set(allSubmissions.map(s => s.id));
      for (const s of localSubs) {
        if (!supabaseIds.has(s.id)) {
          allSubmissions.push(s);
        }
      }
      // 按时间重新排序
      allSubmissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
    }
  }

  renderSubmissions(allSubmissions);
}

function refreshSubmissionsDemo() {
  renderSubmissions(dLoad('demo_submissions', []));
}

function renderSubmissions(submissions) {
  const container = document.getElementById('submissionsAdmin');
  if (!submissions || submissions.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">暂无待审核截图</p>';
    return;
  }
  const pending = submissions.filter(s => s.status === 'pending');
  const done = submissions.filter(s => s.status !== 'pending');

  container.innerHTML = `
    ${pending.length > 0 ? `<h4 style="margin-bottom:8px;">⏳ 待审核 (${pending.length})</h4>` : ''}
    ${pending.map(s => `
      <div class="admin-list-item">
        ${s.screenshot ? `<img class="screenshot-thumb" src="${s.screenshot}" onclick="previewImage('${s.screenshot}')" alt="截图">` : '<span>📸</span>'}
        <div class="item-info">
          <div class="item-title">${s.username || s.user_id} · ${s.app_name}</div>
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
          <div class="item-title">${s.username || s.user_id} · ${s.app_name}</div>
          <div class="item-sub">
            <span class="tag ${s.status === 'approved' ? 'tag-approved' : 'tag-rejected'}">${s.status === 'approved' ? '✅ 已通过' : '❌ 未通过'}</span>
            ${s.status === 'approved' ? `+${s.points_awarded}分` : s.review_comment || ''}
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

async function reviewSubmission(subId, approve) {
  const comment = approve ? '' : (prompt('拒绝理由（可选）：') || '');

  if (isDemoMode()) {
    const submissions = dLoad('demo_submissions', []);
    const idx = submissions.findIndex(s => s.id === subId);
    if (idx === -1) return;
    const sub = submissions[idx];
    sub.status = approve ? 'approved' : 'rejected';
    sub.reviewed_at = new Date().toISOString();
    sub.review_comment = comment || '';

    if (approve) {
      // 获取任务积分
      const tasks = dLoad('demo_tasks', []);
      const task = tasks.find(t => t.id === sub.task_id);
      const taskPoints = task ? task.points : 5;
      sub.points_awarded = taskPoints;

      // 创建打卡记录（提交日期）
      const checkinDate = (sub.submitted_at || new Date().toISOString()).split('T')[0];
      const checkins = dLoad('demo_checkins', {});
      const checkinKey = `${sub.username}_${checkinDate}_${sub.task_id}`;
      if (!checkins[checkinKey]) {
        checkins[checkinKey] = {
          user_id: sub.username,
          task_id: sub.task_id,
          checkin_date: checkinDate,
          points_earned: taskPoints,
        };
        dSave('demo_checkins', checkins);
      }

      // 加积分
      const users = dLoad('demo_users', {});
      if (users[sub.username]) {
        users[sub.username].total_points = (users[sub.username].total_points || 0) + taskPoints;
        dSave('demo_users', users);
      }
    }
    dSave('demo_submissions', submissions);
  } else {
    // 先查 Supabase，查不到再查 localStorage
    let found = false;
    try {
      const { data: sub } = await supabase.from('submissions').select('*').eq('id', subId).single();
      if (sub) {
        found = true;
        // 获取任务积分
        let taskPoints = 5;
        try {
          const { data: task } = await supabase.from('tasks').select('points').eq('id', sub.task_id).single();
          if (task) taskPoints = task.points;
        } catch (e) { /* fallback to 5 */ }

        await supabase.from('submissions').update({
          status: approve ? 'approved' : 'rejected',
          reviewed_at: new Date().toISOString(),
          review_comment: comment || '',
          points_awarded: approve ? taskPoints : 0
        }).eq('id', subId);

        if (approve) {
          // 创建打卡记录
          const checkinDate = (sub.submitted_at || new Date().toISOString()).split('T')[0];
          try {
            await supabase.from('checkins').insert({
              user_id: sub.user_id,
              task_id: sub.task_id,
              checkin_date: checkinDate,
              points_earned: taskPoints,
            });
          } catch (e) { console.warn('⚠️ checkins 插入失败:', e.message); }

          // 加积分
          const { data: profile } = await supabase.from('profiles').select('total_points').eq('id', sub.user_id).single();
          if (profile) {
            await supabase.from('profiles').update({ total_points: profile.total_points + taskPoints }).eq('id', sub.user_id);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ Supabase 审核失败，尝试本地存储:', e.message);
    }

    // Supabase 查不到，从 localStorage 审核
    if (!found) {
      const submissions = dLoad('demo_submissions', []);
      const idx = submissions.findIndex(s => s.id === subId);
      if (idx === -1) { alert('未找到该提交记录'); return; }
      const sub = submissions[idx];
      sub.status = approve ? 'approved' : 'rejected';
      sub.reviewed_at = new Date().toISOString();
      sub.review_comment = comment || '';

      if (approve) {
        const tasks = dLoad('demo_tasks', []);
        const task = tasks.find(t => t.id === sub.task_id);
        const taskPoints = task ? task.points : 5;
        sub.points_awarded = taskPoints;

        const checkinDate = (sub.submitted_at || new Date().toISOString()).split('T')[0];
        const checkins = dLoad('demo_checkins', {});
        const checkinKey = `${sub.username}_${checkinDate}_${sub.task_id}`;
        if (!checkins[checkinKey]) {
          checkins[checkinKey] = {
            user_id: sub.username,
            task_id: sub.task_id,
            checkin_date: checkinDate,
            points_earned: taskPoints,
          };
          dSave('demo_checkins', checkins);
        }

        const users = dLoad('demo_users', {});
        if (users[sub.username]) {
          users[sub.username].total_points = (users[sub.username].total_points || 0) + taskPoints;
          dSave('demo_users', users);
        }
      }
      dSave('demo_submissions', submissions);
    }
  }

  alert(approve ? '✅ 已通过，积分已发放' : '❌ 已拒绝');
  refreshSubmissions();
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
  if (SUPABASE_CONFIGURED && !supabase && window.SUPABASE_CONFIGURED_FALLBACK !== false) {
    await new Promise(resolve => { window.addEventListener('supabase-ready', resolve, { once: true }); });
  }
  await checkAdmin();
  refreshDashboard();
});
