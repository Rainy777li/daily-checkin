/* ============================================
   主应用逻辑 — 打卡 / 日历 / 导航
   支持 Supabase 模式 + 离线演示模式
   ============================================ */

// ---- 演示模式检测 ----
let DEMO_MODE = typeof SUPABASE_CONFIGURED !== 'undefined' && !SUPABASE_CONFIGURED;

function isDemoMode() {
  return DEMO_MODE || !supabase || window.SUPABASE_CONFIGURED_FALLBACK === false;
}

// 监听 SDK 加载失败降级
window.addEventListener('supabase-ready', () => {
  if (window.SUPABASE_CONFIGURED_FALLBACK === false) {
    DEMO_MODE = true;
    console.warn('⚠️ 降级为演示模式');
  }
});

// ---- 演示数据 ----
const DEMO_TASKS = [
  { id: 1, name: '运动 30 分钟', icon: '🏃', points: 10, sort_order: 1, is_active: true },
  { id: 2, name: '阅读 20 分钟', icon: '📖', points: 10, sort_order: 2, is_active: true },
  { id: 3, name: '喝 8 杯水',     icon: '💧', points: 10, sort_order: 3, is_active: true },
  { id: 4, name: '早睡 23:00',    icon: '😴', points: 15, sort_order: 4, is_active: true },
  { id: 5, name: '健康饮食',      icon: '🍎', points: 10, sort_order: 5, is_active: true },
  { id: 6, name: '冥想 10 分钟',  icon: '🧘', points: 10, sort_order: 6, is_active: true },
  { id: 7, name: '写日记',        icon: '📝', points: 10, sort_order: 7, is_active: true },
  { id: 8, name: '学习 1 小时',   icon: '🎯', points: 20, sort_order: 8, is_active: true },
];

function demoLoad(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

function demoSave(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// ---- 全局状态 ----
let currentUser = null;
let currentProfile = null;
let calYear, calMonth;
let todayCheckins = [];
let monthCheckinDates = new Set();

// ---- 页面标题映射 ----
const pageTitles = {
  pageCheckin:    '📋 每日打卡',
  pageRankings:   '📊 数据榜单',
  pageLeaderboard:'🏆 积分排行',
  pagePoints:     '👤 我的',
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ============================================
// 会话管理
// ============================================
async function checkSession() {
  if (DEMO_MODE) {
    const session = JSON.parse(localStorage.getItem('demo_session') || 'null');
    if (!session) { window.location.href = 'index.html'; return null; }
    currentUser = { id: session.username, email: session.username };
    const users = demoLoad('demo_users', {});
    const u = users[session.username];
    const checkins = demoLoad('demo_checkins', {});
    const userCheckins = Object.values(checkins).filter(c => c.user_id === session.username);

    currentProfile = {
      id: session.username,
      username: session.username,
      total_points: userCheckins.reduce((s, c) => s + c.points_earned, 0),
      streak: 0,
      is_admin: u?.is_admin || false,
      is_banned: u?.is_banned || false,
    };
    // 计算 streak
    currentProfile.streak = calcStreakFromCheckins(checkins);
    demoSave('demo_profile', currentProfile);

    updateUserUI(currentProfile);
    if (currentProfile.is_admin) addAdminEntry(currentProfile);
    return currentProfile;
  }

  // Supabase 模式
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  currentUser = session.user;

  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', currentUser.id).single();

  if (error || !profile) { console.error('加载用户信息失败:', error); return null; }
  if (profile.is_banned) {
    await supabase.auth.signOut();
    alert('账号已被禁用');
    window.location.href = 'index.html';
    return null;
  }

  currentProfile = profile;
  updateUserUI(profile);
  if (profile.is_admin) addAdminEntry(profile);
  return profile;
}

function calcStreakFromCheckins(checkins) {
  let streak = 0;
  const d = new Date();
  while (streak < 365) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const hasCheckin = Object.values(checkins).some(c => c.user_id === currentProfile?.username && c.checkin_date === ds);
    if (hasCheckin) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

function updateUserUI(profile) {
  document.getElementById('displayName').textContent = profile.username;
  document.getElementById('streakCount').textContent = profile.streak || 0;
  document.getElementById('totalPoints').textContent = profile.total_points || 0;
}

// ============================================
// 日历
// ============================================
async function loadCalendarData(year, month) {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDate = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;

  monthCheckinDates = new Set();

  if (DEMO_MODE) {
    const checkins = demoLoad('demo_checkins', {});
    Object.values(checkins).forEach(c => {
      if (c.user_id === currentProfile.username && c.checkin_date >= firstDay && c.checkin_date <= lastDay) {
        monthCheckinDates.add(c.checkin_date);
      }
    });
    return;
  }

  const { data } = await supabase
    .from('checkins').select('checkin_date')
    .eq('user_id', currentUser.id)
    .gte('checkin_date', firstDay).lte('checkin_date', lastDay);

  if (data) data.forEach(row => monthCheckinDates.add(row.checkin_date));
}

function renderCalendar(year, month) {
  calYear = year; calMonth = month;
  document.getElementById('calTitle').textContent = `${year}年${month}月`;

  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const today = new Date();
  const todayY = today.getFullYear(), todayM = today.getMonth() + 1, todayD = today.getDate();

  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();
  const totalCells = Math.ceil((firstDayOfWeek + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';

    let dayNum, dateStr, isOtherMonth = false;

    if (i < firstDayOfWeek) {
      dayNum = daysInPrevMonth - firstDayOfWeek + i + 1;
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      isOtherMonth = true;
    } else if (i >= firstDayOfWeek + daysInMonth) {
      dayNum = i - firstDayOfWeek - daysInMonth + 1;
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      isOtherMonth = true;
    } else {
      dayNum = i - firstDayOfWeek + 1;
      dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    }

    cell.textContent = dayNum;
    if (isOtherMonth) cell.classList.add('other-month');

    if (year === todayY && month === todayM && dayNum === todayD && !isOtherMonth) {
      cell.classList.add('today');
    }

    if (monthCheckinDates.has(dateStr)) {
      cell.classList.add('checked');
      if (cell.classList.contains('today')) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        cell.appendChild(dot);
      }
    }

    grid.appendChild(cell);
  }
}

async function refreshCalendar() {
  await loadCalendarData(calYear, calMonth);
  renderCalendar(calYear, calMonth);
}

async function changeMonth(delta) {
  let m = calMonth + delta, y = calYear;
  if (m > 12) { m = 1; y++; }
  if (m < 1)  { m = 12; y--; }
  calYear = y; calMonth = m;
  await loadCalendarData(y, m);
  renderCalendar(y, m);
}

// ============================================
// 任务列表 + 打卡
// ============================================
async function loadTasks() {
  if (DEMO_MODE) {
    // 从管理员管理的任务数据加载
    const adminTasks = demoLoad('demo_tasks', null);
    if (adminTasks) return adminTasks.filter(t => t.is_active).sort((a, b) => a.sort_order - b.sort_order);
    // 回退到默认任务
    return DEMO_TASKS;
  }

  const { data, error } = await supabase
    .from('tasks').select('*').eq('is_active', true).order('sort_order');
  return error ? [] : data;
}

async function loadTodayCheckins() {
  todayCheckins = [];

  if (DEMO_MODE) {
    const checkins = demoLoad('demo_checkins', {});
    Object.values(checkins).forEach(c => {
      if (c.user_id === currentProfile.username && c.checkin_date === todayStr()) {
        todayCheckins.push(c.task_id);
      }
    });
    return todayCheckins;
  }

  const { data } = await supabase
    .from('checkins').select('task_id, points_earned')
    .eq('user_id', currentUser.id).eq('checkin_date', todayStr());

  if (data) todayCheckins = data.map(row => row.task_id);
  return todayCheckins;
}

function renderTasks(tasks) {
  const container = document.getElementById('taskList');
  if (!tasks || tasks.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p class="empty-text">暂未发布任务</p></div>`;
    return;
  }

  // 读取待审核提交记录，用于显示 ⏳ 状态
  const submissions = demoLoad('demo_submissions', []);
  const pendingTasks = new Set();
  submissions.filter(s => s.status === 'pending' && s.username === currentProfile?.username)
    .forEach(s => pendingTasks.add(s.task_id));

  const completedCount = tasks.filter(t => todayCheckins.includes(t.id)).length;
  const totalCount = tasks.length;

  container.innerHTML = `
    <div class="progress-bar mb-2">
      <div class="progress-fill" style="width: ${totalCount ? (completedCount / totalCount) * 100 : 0}%"></div>
    </div>
    <p style="font-size:0.75rem;color:var(--text-secondary);text-align:center;margin-bottom:8px;">
      已完成 ${completedCount}/${totalCount}
    </p>
    ${tasks.map(task => {
      const isCompleted = todayCheckins.includes(task.id);
      const isJumpActive = currentJumpTaskId === task.id;
      const isPendingReview = pendingTasks.has(task.id);

      // 确定圆圈显示内容
      let checkContent = '';
      let checkStyle = '';
      if (isJumpActive) {
        checkContent = '🔒';
        checkStyle = 'border-color:var(--primary);color:var(--primary);';
      } else if (isPendingReview) {
        checkContent = '⏳';
        checkStyle = 'border-color:var(--warning);color:var(--warning);';
      } else if (isCompleted) {
        checkContent = '✅';
      }

      return `
        <div class="task-card ${isCompleted ? 'completed' : ''}"
             data-task-id="${task.id}" data-task-points="${task.points}"
             data-pending="${isPendingReview ? 'true' : 'false'}">
          <span class="task-icon">${task.icon}</span>
          <div class="task-info">
            <div class="task-name">${task.name}</div>
            <div class="task-points">+${task.points} 积分${isPendingReview ? ' · 待审核' : ''}</div>
          </div>
          <button class="task-jump ${isJumpActive ? 'active-jump' : ''}"
                  data-task-id="${task.id}" data-task-points="${task.points}"
                  data-task-name="${escapeHtml(task.name)}" title="跳转打卡">
            📎
          </button>
          <div class="task-check" style="${checkStyle}">${checkContent}</div>
        </div>`;
    }).join('')}
  `;

  container.querySelectorAll('.task-jump').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const taskId = parseInt(btn.dataset.taskId);
      const taskPoints = parseInt(btn.dataset.taskPoints);
      const taskName = btn.dataset.taskName;
      // 如果已有待审核截图，提醒用户
      if (pendingTasks.has(taskId)) {
        showToast('⏳ 该任务已有截图待审核，请耐心等待', 'info');
        return;
      }
      doJump(taskId, taskPoints, taskName);
    });
  });

  container.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => {
      const taskId = parseInt(card.dataset.taskId);
      const taskPoints = parseInt(card.dataset.taskPoints);
      // 正在跳转流程中 → 引导上传截图
      if (currentJumpTaskId === taskId) {
        showToast('📸 请先上传截图完成打卡', 'info');
        document.getElementById('jumpUploadCard')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      // 待审核 → 不允许手动打卡
      if (pendingTasks.has(taskId)) {
        showToast('⏳ 截图审核中，通过后自动打卡并到账积分', 'info');
        return;
      }
      toggleCheckin(taskId, taskPoints, card);
    });
  });
}

async function toggleCheckin(taskId, taskPoints, cardEl) {
  const isCompleted = todayCheckins.includes(taskId);

  if (isCompleted) {
    // 取消打卡
    if (DEMO_MODE) {
      const checkins = demoLoad('demo_checkins', {});
      // 找到并删除
      const newCheckins = {};
      for (const [k, v] of Object.entries(checkins)) {
        if (!(v.user_id === currentProfile.username && v.task_id === taskId && v.checkin_date === todayStr())) {
          newCheckins[k] = v;
        }
      }
      demoSave('demo_checkins', newCheckins);
    } else {
      const { error } = await supabase
        .from('checkins').delete()
        .eq('user_id', currentUser.id).eq('task_id', taskId).eq('checkin_date', todayStr());
      if (error) { showToast('取消失败，请重试', 'error'); return; }
    }

    currentProfile.total_points -= taskPoints;
    todayCheckins = todayCheckins.filter(id => id !== taskId);
    cardEl.classList.remove('completed');
    cardEl.querySelector('.task-check').textContent = '';
    showToast('已取消打卡', 'info');

    if (!DEMO_MODE) {
      await supabase.from('profiles').update({ total_points: currentProfile.total_points }).eq('id', currentUser.id);
    }
  } else {
    // 打卡
    if (DEMO_MODE) {
      const checkins = demoLoad('demo_checkins', {});
      const key = `${currentProfile.username}_${todayStr()}_${taskId}`;
      checkins[key] = {
        user_id: currentProfile.username,
        task_id: taskId,
        checkin_date: todayStr(),
        points_earned: taskPoints,
      };
      demoSave('demo_checkins', checkins);
    } else {
      const { error } = await supabase
        .from('checkins').insert({
          user_id: currentUser.id, task_id: taskId,
          checkin_date: todayStr(), points_earned: taskPoints
        });
      if (error) { showToast('打卡失败，请重试', 'error'); return; }
    }

    currentProfile.total_points += taskPoints;
    todayCheckins.push(taskId);
    cardEl.classList.add('completed');
    cardEl.querySelector('.task-check').textContent = '✅';
    showToast(`+${taskPoints} 积分！`, 'success');

    if (!DEMO_MODE) {
      await supabase.from('profiles').update({ total_points: currentProfile.total_points }).eq('id', currentUser.id);
    }
  }

  updateUserUI(currentProfile);
  await updateStreak();
  await refreshCalendar();
  renderTasks(await loadTasks());
  // 同步刷新"我的"页面
  refreshMyPage();
}

// ============================================
// 连续打卡计算
// ============================================
async function updateStreak() {
  let streak;

  if (DEMO_MODE) {
    const checkins = demoLoad('demo_checkins', {});
    streak = calcStreakFromCheckins(checkins);
  } else {
    streak = 0;
    const checkDate = new Date();
    while (streak < 365) {
      const ds = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
      const { data } = await supabase.from('checkins').select('id')
        .eq('user_id', currentUser.id).eq('checkin_date', ds).limit(1);
      if (data && data.length > 0) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
      else break;
    }
    if (streak !== currentProfile.streak) {
      await supabase.from('profiles').update({ streak }).eq('id', currentUser.id);
    }
  }

  currentProfile.streak = streak;
  document.getElementById('streakCount').textContent = streak;

  if (DEMO_MODE) {
    const users = demoLoad('demo_users', {});
    if (users[currentProfile.username]) {
      users[currentProfile.username].streak = streak;
      users[currentProfile.username].total_points = currentProfile.total_points;
      demoSave('demo_users', users);
    }
  }
}

// ============================================
// 「我的」页面 — 积分 + 账户 + 客服
// ============================================
function refreshMyPage() {
  if (!currentProfile) return;

  // 积分概览
  document.getElementById('myTotalPoints').textContent = currentProfile.total_points || 0;
  document.getElementById('myStreak').textContent = currentProfile.streak || 0;
  document.getElementById('myTodayCount').textContent = todayCheckins.length;

  // 本周积分
  const weekPoints = calcWeekPoints();
  document.getElementById('myWeekPoints').textContent = weekPoints;

  // 积分明细
  loadPointsHistory();
}

function calcWeekPoints() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 周一=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  let total = 0;
  if (DEMO_MODE) {
    const checkins = demoLoad('demo_checkins', {});
    Object.values(checkins).forEach(c => {
      if (c.user_id === currentProfile.username && new Date(c.checkin_date) >= monday) {
        total += c.points_earned || 0;
      }
    });
  } else {
    // Supabase 模式下在前端遍历 todayCheckins 和已有的积分明细
    // 这里简化处理：从 DOM 已加载的积分明细中计算
    total = currentProfile.total_points; // 简化版，后续可优化为精确周统计
  }
  return total;
}

function loadPointsHistory() {
  const container = document.getElementById('pointsHistory');
  // 默认显示最近 7 天
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - 6);
  const startStr = `${rangeStart.getMonth() + 1}/${rangeStart.getDate()}`;
  const endStr = `${new Date().getMonth() + 1}/${new Date().getDate()}`;
  document.getElementById('pointsRange').textContent = `${startStr} - ${endStr}`;

  if (DEMO_MODE) {
    const checkins = demoLoad('demo_checkins', {});
    const userCheckins = Object.values(checkins)
      .filter(c => c.user_id === currentProfile.username)
      .sort((a, b) => b.checkin_date.localeCompare(a.checkin_date))
      .slice(0, 20);

    if (userCheckins.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:12px;">暂无积分记录，快去打卡吧！</p>`;
      return;
    }

    // 聚合每天的数据
    const grouped = {};
    userCheckins.forEach(c => {
      if (!grouped[c.checkin_date]) grouped[c.checkin_date] = { total: 0, tasks: [] };
      grouped[c.checkin_date].total += c.points_earned || 0;
      const task = DEMO_TASKS.find(t => t.id === c.task_id);
      grouped[c.checkin_date].tasks.push(task ? task.name : '未知任务');
    });

    container.innerHTML = Object.entries(grouped).slice(0, 15).map(([date, info]) => `
      <div class="points-item">
        <span class="points-item-icon">📅</span>
        <div class="points-item-info">
          <div class="points-item-title">${info.tasks.slice(0, 2).join('、')}${info.tasks.length > 2 ? '等' + info.tasks.length + '项' : ''}</div>
          <div class="points-item-date">${date}</div>
        </div>
        <span class="points-item-value" style="color:var(--success);">+${info.total}</span>
      </div>
    `).join('');

    return;
  }

  // Supabase 模式：异步加载
  loadPointsHistorySupabase();
}

async function loadPointsHistorySupabase() {
  const container = document.getElementById('pointsHistory');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const startDate = sevenDaysAgo.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('checkins')
    .select('task_id, checkin_date, points_earned')
    .eq('user_id', currentUser.id)
    .gte('checkin_date', startDate)
    .order('checkin_date', { ascending: false })
    .limit(50);

  if (error || !data || data.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:12px;">暂无积分记录，快去打卡吧！</p>`;
    return;
  }

  // 获取任务名称映射
  const { data: tasks } = await supabase.from('tasks').select('id, name');
  const taskMap = {};
  if (tasks) tasks.forEach(t => { taskMap[t.id] = t.name; });

  const grouped = {};
  data.forEach(c => {
    if (!grouped[c.checkin_date]) grouped[c.checkin_date] = { total: 0, tasks: [] };
    grouped[c.checkin_date].total += c.points_earned || 0;
    grouped[c.checkin_date].tasks.push(taskMap[c.task_id] || '未知');
  });

  container.innerHTML = Object.entries(grouped).slice(0, 15).map(([date, info]) => `
    <div class="points-item">
      <span class="points-item-icon">📅</span>
      <div class="points-item-info">
        <div class="points-item-title">${info.tasks.slice(0, 2).join('、')}${info.tasks.length > 2 ? '等' + info.tasks.length + '项' : ''}</div>
        <div class="points-item-date">${date}</div>
      </div>
      <span class="points-item-value" style="color:var(--success);">+${info.total}</span>
    </div>
  `).join('');
}

// ---- 修改密码弹窗 ----
function showChangePasswordModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">🔑 修改密码</div>
      <form id="formChangePwd" autocomplete="off">
        <div class="form-group">
          <label class="form-label">当前密码</label>
          <input class="form-input" type="password" id="oldPwd" placeholder="输入当前密码" required>
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <input class="form-input" type="password" id="newPwd" placeholder="至少 6 位" minlength="6" required>
        </div>
        <div class="form-group">
          <label class="form-label">确认新密码</label>
          <input class="form-input" type="password" id="newPwd2" placeholder="再次输入新密码" minlength="6" required>
        </div>
        <p class="form-error" id="pwdError"></p>
        <div class="modal-actions">
          <button class="btn btn-outline btn-block btn-sm" type="button" id="btnCancelPwd">取消</button>
          <button class="btn btn-primary btn-block btn-sm" type="submit">确认修改</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.getElementById('btnCancelPwd').addEventListener('click', () => overlay.remove());

  document.getElementById('formChangePwd').addEventListener('submit', (e) => {
    e.preventDefault();
    const oldPwd = document.getElementById('oldPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const newPwd2 = document.getElementById('newPwd2').value;
    const errEl = document.getElementById('pwdError');

    if (newPwd.length < 6) {
      errEl.textContent = '新密码至少 6 位';
      errEl.classList.add('visible');
      return;
    }
    if (newPwd !== newPwd2) {
      errEl.textContent = '两次输入的新密码不一致';
      errEl.classList.add('visible');
      return;
    }

    if (DEMO_MODE) {
      const users = demoLoad('demo_users', {});
      const user = users[currentProfile.username];
      if (!user || user.password !== oldPwd) {
        errEl.textContent = '当前密码错误';
        errEl.classList.add('visible');
        return;
      }
      user.password = newPwd;
      demoSave('demo_users', users);
      overlay.remove();
      showToast('密码修改成功！', 'success');
      return;
    }

    // Supabase 模式：重新登录验证旧密码，然后更新
    supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: oldPwd
    }).then(({ error }) => {
      if (error) {
        errEl.textContent = '当前密码错误';
        errEl.classList.add('visible');
        return;
      }
      return supabase.auth.updateUser({ password: newPwd });
    }).then(({ error } = {}) => {
      if (error) {
        errEl.textContent = error.message || '修改失败';
        errEl.classList.add('visible');
      } else {
        overlay.remove();
        showToast('密码修改成功！', 'success');
      }
    });
  });
}

// ---- 联系客服 ----
function setupFeedback() {
  const form = document.getElementById('formFeedback');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = document.getElementById('feedbackMsg').value.trim();
    if (!msg) {
      showToast('请输入反馈内容', 'error');
      return;
    }

    const feedbacks = demoLoad('demo_feedbacks', []);
    feedbacks.unshift({
      username: currentProfile.username,
      message: msg,
      time: new Date().toISOString(),
      reply: null // 管理员可在后台回复
    });
    demoSave('demo_feedbacks', feedbacks);
    document.getElementById('feedbackMsg').value = '';
    showToast('感谢反馈！我们会尽快处理', 'success');
    renderFeedbackHistory();
  });
}

function renderFeedbackHistory() {
  const container = document.getElementById('feedbackHistory');
  if (!container) return;

  const feedbacks = demoLoad('demo_feedbacks', []);
  const mine = feedbacks.filter(f => f.username === currentProfile.username).slice(0, 5);

  if (mine.length === 0) return;

  container.innerHTML = `
    <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">📝 我的反馈记录</p>
    ${mine.map(f => `
      <div class="feedback-item">
        <div class="feedback-text">${escapeHtml(f.message)}</div>
        <div class="feedback-time">${new Date(f.time).toLocaleString('zh-CN')}</div>
        ${f.reply ? `<div class="feedback-reply">💬 客服回复：${escapeHtml(f.reply)}</div>` : ''}
      </div>
    `).join('')}
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================
// 积分排行榜
// ============================================
let currentRankType = 'total'; // 'total' | 'week'

function refreshLeaderboard() {
  currentRankType = 'total';
  document.querySelectorAll('.rank-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-rank="total"]')?.classList.add('active');
  loadLeaderboard('total');
}

function setupRankTabs() {
  document.querySelectorAll('.rank-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rank-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentRankType = tab.dataset.rank;
      loadLeaderboard(currentRankType);
    });
  });
}

function getWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const offset = day === 0 ? 6 : day - 1; // 周一=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function loadLeaderboard(type) {
  const monday = getWeekMonday();

  if (DEMO_MODE) {
    const users = demoLoad('demo_users', {});
    const checkins = demoLoad('demo_checkins', {});

    // 计算每个用户的积分
    const userPoints = {};
    Object.keys(users).forEach(username => {
      let points = 0;
      Object.values(checkins).forEach(c => {
        if (c.user_id === username) {
          const isInWeek = type === 'week' ? new Date(c.checkin_date) >= monday : true;
          if (isInWeek) points += c.points_earned || 0;
        }
      });
      userPoints[username] = {
        username,
        points,
        streak: users[username].streak || 0,
        is_banned: users[username].is_banned || false,
      };
    });

    // 排序
    const ranked = Object.values(userPoints)
      .filter(u => !u.is_banned)
      .sort((a, b) => b.points - a.points);

    renderRankList(ranked);
    return;
  }

  // Supabase 模式：加载所有用户
  loadLeaderboardSupabase(type, monday);
}

async function loadLeaderboardSupabase(type, monday) {
  // 获取所有非封禁用户
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, streak')
    .eq('is_banned', false);

  if (!profiles || profiles.length === 0) {
    renderRankList([]);
    return;
  }

  // 获取打卡记录计算积分
  let checkinsQuery = supabase.from('checkins').select('user_id, points_earned, checkin_date');

  // 获取所有用户 ID
  const userIds = profiles.map(p => p.id);
  // Supabase in filter (批量查询)
  // 简化处理：获取全部 checkins，前端过滤
  const { data: allCheckins } = await checkinsQuery;

  const userPoints = {};
  profiles.forEach(p => {
    let points = 0;
    if (allCheckins) {
      allCheckins.forEach(c => {
        if (c.user_id === p.id) {
          const isInWeek = type === 'week' ? new Date(c.checkin_date) >= monday : true;
          if (isInWeek) points += c.points_earned || 0;
        }
      });
    }
    userPoints[p.id] = {
      username: p.username,
      points,
      streak: p.streak || 0,
    };
  });

  const ranked = Object.values(userPoints).sort((a, b) => b.points - a.points);
  renderRankList(ranked);
}

function renderRankList(ranked) {
  const container = document.getElementById('rankList');
  const myCard = document.getElementById('myRankCard');
  const myUsername = currentProfile?.username;

  if (ranked.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:20px;">暂无排行数据</p>`;
    myCard.style.display = 'none';
    return;
  }

  // 找我的排名
  const myIndex = ranked.findIndex(u => u.username === myUsername);
  const myRank = myIndex >= 0 ? myIndex + 1 : '-';
  const myData = myIndex >= 0 ? ranked[myIndex] : null;

  // 更新我的排名卡片
  if (myData) {
    myCard.style.display = 'flex';
    document.getElementById('myRankNum').textContent = myRank;
    document.getElementById('myRankName').textContent = myData.username;
    document.getElementById('myRankStreak').textContent = myData.streak;
    document.getElementById('myRankPoints').textContent = myData.points;
  } else {
    myCard.style.display = 'none';
  }

  // 渲染列表（TOP 30）
  const topN = ranked.slice(0, 30);
  container.innerHTML = topN.map((user, i) => {
    const rank = i + 1;
    const medals = ['🥇', '🥈', '🥉'];
    const rankDisplay = rank <= 3 ? medals[rank - 1] : rank;
    const isMe = user.username === myUsername;
    const avatarEmojis = ['🦊', '🐼', '🐨', '🐰', '🦁', '🐱', '🐶', '🐮', '🐸', '🐵'];
    const avatar = avatarEmojis[rank % avatarEmojis.length];

    return `
      <div class="rank-item ${isMe ? 'is-me' : ''}">
        <span class="rank-index">${rankDisplay}</span>
        <span class="rank-avatar">${avatar}</span>
        <div class="rank-info">
          <div class="rank-name">${user.username}${isMe ? ' 👈' : ''}</div>
          <div class="rank-streak">🔥 ${user.streak} 天</div>
        </div>
        <span class="rank-points">${user.points} 分</span>
      </div>
    `;
  }).join('');

  // 如果我不在前 30 名但存在
  if (myIndex >= 30 && myData) {
    container.innerHTML += `
      <div style="text-align:center;color:var(--text-muted);padding:8px;font-size:0.8rem;">···</div>
      <div class="rank-item is-me">
        <span class="rank-index">${myRank}</span>
        <span class="rank-avatar">⭐</span>
        <div class="rank-info">
          <div class="rank-name">${myData.username} 👈</div>
          <div class="rank-streak">🔥 ${myData.streak} 天</div>
        </div>
        <span class="rank-points">${myData.points} 分</span>
      </div>
    `;
  }
}

// ============================================
// 数据榜单
// ============================================
// 寻艺真实数据缓存
let xunyeeRankData = null;

// 演示榜单数据（模拟公开网页数据）
const DEMO_RANKING_CATEGORIES = [
  { id: 0, name: '寻艺点赞', icon: '👍', sort_order: 0, realtime: true },
  { id: 1, name: '微博粉丝榜', icon: '📊', sort_order: 1 },
  { id: 2, name: '抖音播放榜', icon: '🎵', sort_order: 2 },
  { id: 3, name: '超话活跃榜', icon: '🔥', sort_order: 3 },
  { id: 4, name: 'B站涨粉榜',  icon: '📺', sort_order: 4 },
];

function generateDemoRankingItems() {
  // 优先使用管理员录入的榜单数据
  const result = {};
  DEMO_RANKING_CATEGORIES.forEach(cat => {
    const adminItems = demoLoad(`demo_rank_items_${cat.id}`, null);
    if (adminItems && adminItems.length > 0) {
      // 使用管理员录入的真实数据
      const items = adminItems.map((item, i) => ({
        rank: i + 1,
        name: item.name,
        value: item.value,
        prev_value: item.prev_value,
        change_amount: item.change_amount || 0,
        change_percent: item.change_percent || 0,
      }));
      items.sort((a, b) => b.value - a.value);
      items.forEach((item, i) => { item.rank = i + 1; });
      result[cat.id] = items;
      return;
    }

    // 回退：自动生成 mock 数据
    const names = {
      1: ['TF-张极', 'TF-左航', 'TF-苏新皓', 'TF-朱志鑫', 'TF-张泽禹', 'TF-张峻豪', 'TF-余宇涵', 'TF-穆祉丞', 'TF-陈天润', 'TF-童禹坤', 'TF-邓佳鑫', 'TF-黄朔', 'TF-赵冠羽', 'TF-李煜东', 'TF-王烁然', 'TF-杨涵博', 'TF-陈奕恒', 'TF-智恩涵', 'TF-魏子宸', 'TF-张奕然'],
      2: ['TF家族', '张极个人', '左航日常', '朱志鑫舞蹈', '苏新皓翻跳', '张泽禹弹唱', '时代少年团', '张峻豪Rap', '余宇涵Vlog', '三代练习室', '邓佳鑫Cover', '黄朔日常', '李煜东直拍', '王烁然弹唱', '杨涵博舞蹈', '陈奕恒翻跳', '智恩涵练习', '赵冠羽Vlog', '魏子宸日常', '张奕然Cover'],
      3: ['朱志鑫超话', '张极超话', '左航超话', '苏新皓超话', '张泽禹超话', '余宇涵超话', '张峻豪超话', '穆祉丞超话', '陈天润超话', '童禹坤超话', '邓佳鑫超话', '黄朔超话', '李煜东超话', '王烁然超话', '杨涵博超话', '陈奕恒超话', '智恩涵超话', '赵冠羽超话', '魏子宸超话', '张奕然超话'],
      4: ['朱志鑫', '张极', '左航', '苏新皓', '张泽禹', 'TF家族官方', '余宇涵', '张峻豪', '穆祉丞', '陈天润', '童禹坤', '邓佳鑫', '黄朔', '李煜东', '王烁然', '杨涵博', '陈奕恒', '智恩涵', '赵冠羽', '魏子宸'],
    };

    const items = names[cat.id].map((name, i) => {
      let baseValue = name.includes('李煜东')
        ? Math.floor(400000 + Math.random() * 200000)
        : Math.floor(100000 + Math.random() * 900000);
      const prevValue = demoLoad(`demo_prev_${cat.id}_${i}`, baseValue);
      const currentValue = Math.max(0, prevValue + Math.floor((Math.random() - 0.45) * 50000));
      localStorage.setItem(`demo_prev_${cat.id}_${i}`, currentValue);
      const change = currentValue - prevValue;
      const percent = prevValue > 0 ? ((change / prevValue) * 100) : 0;
      return { rank: i + 1, name, value: currentValue, prev_value: prevValue,
               change_amount: change, change_percent: parseFloat(percent.toFixed(1)) };
    });
    items.sort((a, b) => b.value - a.value);
    items.forEach((item, i) => { item.rank = i + 1; });
    result[cat.id] = items;
  });

  return result;
}

let currentRankingCatId = null;
let rankingData = {};

function setupRankings() {
  // 渲染分类 Tab
  const catContainer = document.getElementById('rankingCategories');
  catContainer.innerHTML = DEMO_RANKING_CATEGORIES.map(cat =>
    `<button class="ranking-cat-btn" data-cat-id="${cat.id}">${cat.icon} ${cat.name}${cat.realtime ? ' 🔴' : ''}</button>`
  ).join('');

  // 绑定分类切换
  catContainer.querySelectorAll('.ranking-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      catContainer.querySelectorAll('.ranking-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRankingCatId = parseInt(btn.dataset.catId);
      renderRankingList(currentRankingCatId);
    });
  });

  // 刷新按钮
  document.getElementById('btnRefreshRanking')?.addEventListener('click', async () => {
    if (currentRankingCatId === 0) {
      showToast('正在刷新寻艺数据...', 'info');
      await loadXunyeeData();
    } else {
      rankingData = generateDemoRankingItems();
    }
    document.getElementById('rankingUpdateTime').textContent =
      `更新于 ${new Date().toLocaleTimeString('zh-CN')}`;
    if (currentRankingCatId !== undefined) renderRankingList(currentRankingCatId);
    showToast('榜单已刷新', 'info');
  });

  // 初始化数据：先加载 demo 数据，再异步加载寻艺真实数据
  rankingData = generateDemoRankingItems();
  document.getElementById('rankingUpdateTime').textContent =
    `更新于 ${new Date().toLocaleTimeString('zh-CN')}`;

  // 异步加载寻艺数据
  loadXunyeeData().then(() => {
    if (currentRankingCatId === 0) renderRankingList(0);
  });

  // 默认选中寻艺点赞
  const firstBtn = catContainer.querySelector('.ranking-cat-btn');
  if (firstBtn) {
    firstBtn.classList.add('active');
    currentRankingCatId = parseInt(firstBtn.dataset.catId);
    renderRankingList(currentRankingCatId);
  }
}

async function loadXunyeeData() {
  try {
    const resp = await fetch('data/rankings.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    xunyeeRankData = await resp.json();
    const cat = xunyeeRankData.categories?.xunyee_check;
    if (cat && cat.items) {
      rankingData[0] = cat.items.map((item, i) => ({
        rank: i + 1,
        ...item,
      }));
      // 缓存到 localStorage
      demoSave('xunyee_cache', {
        updated_at: xunyeeRankData.updated_at,
        items: cat.items,
      });
      document.getElementById('rankingUpdateTime').textContent =
        `寻艺更新于 ${xunyeeRankData.updated_at?.replace('T', ' ').slice(0, 16) || '?'}`;
      console.log('✅ 寻艺数据已加载:', rankingData[0].length, '人');
    }
  } catch (err) {
    console.warn('⚠️ 寻艺数据加载失败，使用缓存:', err.message);
    const cached = demoLoad('xunyee_cache', null);
    if (cached && cached.items) {
      rankingData[0] = cached.items.map((item, i) => ({ rank: i + 1, ...item }));
      document.getElementById('rankingUpdateTime').textContent =
        `寻艺缓存 ${cached.updated_at?.replace('T', ' ').slice(0, 16) || '?'}`;
    }
  }
}

function formatBigNum(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

function renderRankingList(catId) {
  const items = rankingData[catId] || [];
  const container = document.getElementById('rankingList');

  if (items.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:20px;">暂无数据</p>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  let focusIndex = -1;

  container.innerHTML = items.map((item, i) => {
    const rank = i + 1;
    const rankDisplay = rank <= 3 ? medals[rank - 1] : rank;
    const changeClass = item.change_amount > 0 ? 'change-up' : item.change_amount < 0 ? 'change-down' : 'change-zero';
    const arrow = item.change_amount > 0 ? '▲' : item.change_amount < 0 ? '▼' : '─';
    const absAmount = Math.abs(item.change_amount);
    const isFocus = item.name.includes('李煜东');

    if (isFocus) focusIndex = i;

    return `
      <div class="ranking-item ${isFocus ? 'ranking-focus' : ''}" data-focus="${isFocus ? 'true' : 'false'}">
        <span class="ranking-rank">${rankDisplay}</span>
        <div class="ranking-info">
          <div class="ranking-name">${item.name}</div>
          <div class="ranking-value">${formatBigNum(item.value)}</div>
        </div>
        <div class="ranking-change ${changeClass}">
          <span class="arrow">${arrow}</span> ${formatBigNum(absAmount)}
          <div style="font-size:0.7rem;">${item.change_percent >= 0 ? '+' : ''}${item.change_percent}%</div>
        </div>
      </div>
    `;
  }).join('');

  // 自动滚动到"李煜东"
  if (focusIndex >= 0) {
    setTimeout(() => {
      const focusEl = container.querySelector('.ranking-focus');
      if (focusEl) {
        focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 短暂高亮闪烁效果
        focusEl.classList.add('ranking-flash');
        setTimeout(() => focusEl.classList.remove('ranking-flash'), 1500);
      }
    }, 200);
  }
}

function refreshRankings() {
  if (document.getElementById('pageRankings').classList.contains('active')) {
    if (!currentRankingCatId) {
      const firstBtn = document.querySelector('.ranking-cat-btn');
      if (firstBtn) firstBtn.click();
    }
  }
}

// ============================================
// 快捷跳转 + 截图打卡（直接链接 + 常驻上传区）
// ============================================

// 跳转目标配置（后续可通过管理员后台配置）
const JUMP_TARGETS = [
  { id: 'xunyee', name: '李煜东寻艺', url: 'https://www.xunyee.cn/', icon: '👍' },
];

// 跳转流程状态
let currentJumpTaskId = null;
let currentJumpTaskPoints = 0;
let currentJumpScreenshotData = null;
let currentJumpTarget = null; // { name, url }

// ---- 跳转：打开链接 + 显示上传卡片 ----
function doJump(taskId, taskPoints, taskName) {
  // 使用第一个跳转目标（后续可让用户选择）
  const target = JUMP_TARGETS[0];
  if (!target) {
    showToast('暂无可用跳转链接', 'error');
    return;
  }

  currentJumpTaskId = taskId;
  currentJumpTaskPoints = taskPoints;
  currentJumpScreenshotData = null;
  currentJumpTarget = target;

  // 显示上传卡片
  const card = document.getElementById('jumpUploadCard');
  card.style.display = 'block';
  document.getElementById('jumpUploadTaskName').textContent = taskName;
  document.getElementById('jumpUploadTarget').innerHTML =
    `${target.icon} ${target.name} <a href="${target.url}" target="_blank" style="font-size:0.7rem;color:var(--primary);">🔗 打开链接</a>`;

  // 清空预览
  document.getElementById('jumpScreenshotPreview').style.display = 'none';
  document.getElementById('jumpScreenshotPreview').src = '';
  document.getElementById('jumpUploadArea').style.display = 'flex';
  document.getElementById('jumpScreenshotFile').value = '';

  // 重置提交按钮为锁定状态
  const submitBtn = document.getElementById('jumpBtnSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.background = '#E0DDD8';
    submitBtn.style.color = '#A09990';
    submitBtn.style.cursor = 'not-allowed';
    submitBtn.textContent = '🔒 请先上传截图';
  }

  // 打开目标链接
  window.open(target.url, '_blank');
  showToast(`已打开 ${target.name}，完成后请返回上传截图`, 'info');

  // 滚动到上传卡片
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 高亮当前任务
  renderTasksWithActive();
}

function cancelJump() {
  currentJumpTaskId = null;
  currentJumpTaskPoints = 0;
  currentJumpScreenshotData = null;
  currentJumpTarget = null;
  document.getElementById('jumpUploadCard').style.display = 'none';
  document.getElementById('jumpScreenshotPreview').style.display = 'none';
  document.getElementById('jumpScreenshotPreview').src = '';
  document.getElementById('jumpUploadArea').style.display = 'flex';
  document.getElementById('jumpScreenshotFile').value = '';
  // 重置提交按钮为锁定状态
  const submitBtn = document.getElementById('jumpBtnSubmit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.background = '#E0DDD8';
    submitBtn.style.color = '#A09990';
    submitBtn.style.cursor = 'not-allowed';
    submitBtn.textContent = '🔒 请先上传截图';
  }
  // 刷新任务列表（移除高亮）
  loadTasks().then(tasks => renderTasks(tasks));
}

async function renderTasksWithActive() {
  const tasks = await loadTasks();
  renderTasks(tasks);
}

// ---- 上传区域事件 ----
function setupJumpUpload() {
  const uploadArea = document.getElementById('jumpUploadArea');
  const fileInput = document.getElementById('jumpScreenshotFile');
  const preview = document.getElementById('jumpScreenshotPreview');
  const submitBtn = document.getElementById('jumpBtnSubmit');
  const cancelBtn = document.getElementById('jumpBtnCancel');

  if (!uploadArea || !fileInput) {
    console.error('❌ 截图上传元素未找到！jumpUploadArea:', !!uploadArea, 'jumpScreenshotFile:', !!fileInput);
    return;
  }
  console.log('✅ 截图上传已就绪，提交按钮:', !!submitBtn, '取消按钮:', !!cancelBtn);

  // 文件输入框覆盖整个上传区域（透明叠加），直接响应点击
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    console.log('📷 文件已选择:', file.name, file.size);

    if (file.size > 10 * 1024 * 1024) {
      showToast('图片不能超过 10MB', 'error');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      // 用 Canvas 压缩图片，避免 localStorage 配额溢出
      const img = new Image();
      img.onload = () => {
        const MAX_W = 800;
        let w = img.width, h = img.height;
        if (w > MAX_W) { h = Math.round(h * (MAX_W / w)); w = MAX_W; }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        currentJumpScreenshotData = canvas.toDataURL('image/jpeg', 0.7);

        preview.src = currentJumpScreenshotData;
        preview.style.display = 'block';
        uploadArea.style.display = 'none';

        console.log('✅ 截图已压缩:', Math.round(currentJumpScreenshotData.length / 1024), 'KB');

        // 解锁提交按钮 → 变绿
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.style.background = '#7CB77C';
          submitBtn.style.color = '#fff';
          submitBtn.style.cursor = 'pointer';
          submitBtn.textContent = '✅ 提交审核并打卡';
        }
        console.log('✅ 提交按钮已解锁');
      };
      img.onerror = () => {
        showToast('图片加载失败，请重试', 'error');
      };
      img.src = reader.result;
    };
    reader.onerror = () => {
      showToast('图片读取失败，请重试', 'error');
    };
    reader.readAsDataURL(file);
  });

  // 点击预览图可重新选择图片
  preview.addEventListener('click', () => {
    preview.style.display = 'none';
    preview.src = '';
    currentJumpScreenshotData = null;
    uploadArea.style.display = 'flex';
    fileInput.value = '';
    // 重新锁定提交按钮
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.background = '#E0DDD8';
      submitBtn.style.color = '#A09990';
      submitBtn.style.cursor = 'not-allowed';
      submitBtn.textContent = '🔒 请先上传截图';
    }
  });
  preview.style.cursor = 'pointer';
  preview.title = '点击更换图片';

  // 取消
  cancelBtn.addEventListener('click', cancelJump);
}

// 全局函数：提交截图（由 onclick 属性绑定，最可靠）
async function submitJumpScreenshot() {
  console.log('📤 submitJumpScreenshot 被调用');
  if (!currentJumpScreenshotData) {
    showToast('请先上传截图', 'error');
    return;
  }
  if (!currentJumpTarget) {
    showToast('跳转信息丢失，请重新操作', 'error');
    return;
  }
  if (!currentJumpTaskId) {
    showToast('任务信息丢失，请重新操作', 'error');
    return;
  }

  const taskId = currentJumpTaskId;
  const taskPoints = currentJumpTaskPoints;
  const submitBtn = document.getElementById('jumpBtnSubmit');

  // 按钮显示加载状态
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ 提交中...';
  }

  try {
    // 保存提交记录
    const submission = {
      id: 'sub_' + Date.now(),
      username: currentProfile.username,
      task_id: taskId,
      app_name: currentJumpTarget.name,
      jump_url: currentJumpTarget.url,
      screenshot: currentJumpScreenshotData,
      status: 'pending',
      points_awarded: 0,
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      review_comment: '',
    };

    console.log('💾 保存提交记录...', submission.id);

    // 始终存 localStorage（renderTasks 依赖它显示 ⏳ 状态）
    {
      try {
        const submissions = demoLoad('demo_submissions', []);
        submissions.unshift(submission);
        demoSave('demo_submissions', submissions);
        console.log('✅ 已存到 localStorage, 截图大小:', Math.round(submission.screenshot.length / 1024), 'KB');
      } catch (lsErr) {
        console.warn('⚠️ localStorage 存储失败，尝试去掉截图保存:', lsErr.message);
        // 去掉截图数据后重试（至少保留审核记录）
        const slimSubmission = { ...submission, screenshot: '' };
        try {
          const submissions = demoLoad('demo_submissions', []);
          submissions.unshift(slimSubmission);
          demoSave('demo_submissions', submissions);
          console.log('✅ 已存元数据（不含截图）');
        } catch (e2) {
          console.error('❌ localStorage 完全不可用:', e2.message);
        }
      }
    }

    if (!DEMO_MODE) {
      // 非演示模式：同步到 Supabase
      try {
        const { error } = await supabase.from('submissions').insert({
          user_id: currentUser.id,
          username: currentProfile.username,
          task_id: taskId,
          app_name: currentJumpTarget.name,
          jump_url: currentJumpTarget.url,
          screenshot: currentJumpScreenshotData,
          status: 'pending',
          points_awarded: 0,
        });
        if (error) throw error;
        console.log('✅ 截图已同步到 Supabase');
      } catch (err) {
        console.warn('⚠️ Supabase 同步失败（本地已保存）:', err.message);
      }
    }

    // 截图提交成功，但不打卡——等管理员审核通过后才打卡+积分
    cancelJump();
    showToast('截图已提交，等待管理员审核 ✅ 审核通过后积分自动到账', 'success');

    // 刷新任务列表（更新 ⏳ 状态）和提交记录
    renderSubmissionHistory();
    const tasks = await loadTasks();
    renderTasks(tasks);
  } catch (err) {
    console.error('❌ 提交失败:', err.message, err);
    console.error('❌ 错误堆栈:', err.stack);
    alert('提交失败: ' + (err.message || '未知错误') + '\n请截图控制台日志发给管理员');
    // 恢复按钮
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.background = '#7CB77C';
      submitBtn.style.color = '#fff';
      submitBtn.style.cursor = 'pointer';
      submitBtn.textContent = '✅ 提交审核并打卡';
    }
    showToast('提交失败，请重试', 'error');
  }
}

// 自动打卡（由管理员审核通过后触发，不再在提交流程中调用）
async function autoCheckinTask(taskId, taskPoints) {
  if (DEMO_MODE) {
    const checkins = demoLoad('demo_checkins', {});
    const key = `${currentProfile.username}_${todayStr()}_${taskId}`;
    checkins[key] = {
      user_id: currentProfile.username,
      task_id: taskId,
      checkin_date: todayStr(),
      points_earned: taskPoints,
    };
    demoSave('demo_checkins', checkins);
  } else {
    await supabase
      .from('checkins').insert({
        user_id: currentUser.id, task_id: taskId,
        checkin_date: todayStr(), points_earned: taskPoints
      });
    await supabase.from('profiles').update({ total_points: currentProfile.total_points + taskPoints }).eq('id', currentUser.id);
  }

  currentProfile.total_points += taskPoints;
  todayCheckins.push(taskId);
  await updateStreak();
  await refreshCalendar();
  refreshMyPage();
}

function renderSubmissionHistory() {
  const container = document.getElementById('submissionHistory');
  const card = document.getElementById('submissionHistoryCard');
  if (!container) return;

  const submissions = demoLoad('demo_submissions', []);
  const mine = submissions.filter(s => s.username === currentProfile?.username).slice(0, 10);

  if (mine.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';

  const statusLabels = { pending: '⏳ 审核中', approved: '✅ 已通过', rejected: '❌ 未通过' };

  container.innerHTML = mine.map(s => {
    const icon = s.app_name === '寻艺点赞' ? '👍' : '📱';
    return `
      <div class="submission-card">
        <span>${icon}</span>
        <div class="submission-info">
          <div>${s.app_name} · ${new Date(s.submitted_at).toLocaleDateString('zh-CN')}</div>
          <div class="submission-time">
            ${s.status === 'approved' ? `+${s.points_awarded} 积分` : s.review_comment || ''}
          </div>
        </div>
        <span class="submission-status ${s.status}">${statusLabels[s.status]}</span>
      </div>
    `;
  }).join('');
}

// ---- 管理员审核功能 ----
function adminReviewSubmission(submissionId, approve, comment) {
  const submissions = demoLoad('demo_submissions', []);
  const idx = submissions.findIndex(s => s.id === submissionId);
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

      if (username === currentProfile?.username) {
        currentProfile.total_points += 5;
        updateUserUI(currentProfile);
      }
    }
  }

  demoSave('demo_submissions', submissions);
  return true;
}

// ============================================
// 底部导航
// ============================================
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('pageTitle');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(item.dataset.page).classList.add('active');
    pageTitle.textContent = pageTitles[item.dataset.page] || '每日打卡';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 切换到"我的"页面时刷新数据
    if (item.dataset.page === 'pagePoints') {
      refreshMyPage();
      renderFeedbackHistory();
    }
    // 切换到排行榜页面时刷新
    if (item.dataset.page === 'pageLeaderboard') {
      refreshLeaderboard();
    }
    // 切换到数据榜单页面时刷新
    if (item.dataset.page === 'pageRankings') {
      refreshRankings();
    }
  });
});

// ============================================
// 退出
// ============================================
document.getElementById('btnLogout').addEventListener('click', async () => {
  if (!confirm('确定要退出登录吗？')) return;

  if (DEMO_MODE) {
    localStorage.removeItem('demo_session');
    window.location.href = 'index.html';
    return;
  }

  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// ============================================
// 管理员入口
// ============================================
function addAdminEntry(profile) {
  if (document.getElementById('btnAdmin')) return;
  const topBar = document.querySelector('.top-bar');
  const adminBtn = document.createElement('button');
  adminBtn.id = 'btnAdmin';
  adminBtn.className = 'top-bar-action';
  adminBtn.textContent = '⚙️';
  adminBtn.title = '管理后台';
  adminBtn.style.marginRight = '8px';
  adminBtn.addEventListener('click', () => {
    window.location.href = 'admin.html';
  });
  topBar.insertBefore(adminBtn, document.getElementById('btnLogout'));
}

// ============================================
// Toast
// ============================================
function showToast(text, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ============================================
// 演示模式标识
// ============================================
if (DEMO_MODE) {
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#E8B84B;color:#4A3728;text-align:center;padding:6px;font-size:0.8rem;font-weight:700;';
    banner.textContent = '🔧 离线演示模式 — 配置 Supabase 后可正式使用';
    document.body.insertBefore(banner, document.body.firstChild);
    document.body.style.paddingTop = '0'; // 覆盖安全区域
  });
}

// ============================================
// 启动
// ============================================
async function initApp() {
  const now = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayEl = document.getElementById('todayDate');
  if (todayEl) {
    todayEl.textContent =
      `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekDays[now.getDay()]}`;
  }

  const profile = await checkSession();
  if (!profile) return;

  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  await loadCalendarData(calYear, calMonth);
  renderCalendar(calYear, calMonth);

  await loadTodayCheckins();
  const tasks = await loadTasks();
  renderTasks(tasks);

  await updateStreak();

  document.getElementById('calPrev').addEventListener('click', () => changeMonth(-1));
  document.getElementById('calNext').addEventListener('click', () => changeMonth(1));

  // 「我的」页面：绑定按钮
  document.getElementById('btnChangePwd')?.addEventListener('click', showChangePasswordModal);
  document.getElementById('btnLogout2')?.addEventListener('click', () => {
    if (confirm('确定要退出登录吗？')) {
      if (DEMO_MODE) {
        localStorage.removeItem('demo_session');
        window.location.href = 'index.html';
      } else {
        supabase.auth.signOut().then(() => { window.location.href = 'index.html'; });
      }
    }
  });
  setupFeedback();
  refreshMyPage();
  renderFeedbackHistory();

  // 排行榜
  setupRankTabs();
  refreshLeaderboard();

  // 数据榜单
  setupRankings();

  // 跳转 + 截图打卡
  setupJumpUpload();
  renderSubmissionHistory();

  console.log('✅ 打卡应用已启动' + (DEMO_MODE ? ' [演示模式]' : ''));
}

document.addEventListener('DOMContentLoaded', () => {
  if (DEMO_MODE) {
    initApp();
  } else {
    // 给 SDK 最多 8 秒加载，超时则降级为演示模式
    const timeout = setTimeout(() => {
      DEMO_MODE = true;
      console.warn('⚠️ SDK 加载超时，降级为演示模式');
      initApp();
    }, 8000);

    window.addEventListener('supabase-ready', () => {
      clearTimeout(timeout);
      if (window.SUPABASE_CONFIGURED_FALLBACK === false) {
        DEMO_MODE = true;
      }
      initApp();
    }, { once: true });
  }
});

// 监听登出（Supabase 就绪后绑定）
if (!DEMO_MODE) {
  window.addEventListener('supabase-ready', () => {
    if (supabase && supabase.auth) {
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') window.location.href = 'index.html';
      });
    }
  });
}
