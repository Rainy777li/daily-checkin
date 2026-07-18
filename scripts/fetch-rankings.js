/**
 * 寻艺数据抓取脚本
 * 由 GitHub Actions 每天 10:00 / 22:00 (北京时间) 自动运行
 * 用法: node scripts/fetch-rankings.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// 追踪人物列表
const TRACKED_PERSONS = [
  { name: '王橹杰', person_id: 198331 },
  { name: '杨博文', person_id: 198332 },
  { name: '张桂源', person_id: 198330 },
  { name: '李煜东', person_id: 198342 },
];

const API_BASE = 'https://api.xunyee.cn';
const DATA_FILE = path.join(__dirname, '..', 'data', 'rankings.json');

// 当前北京时间
function beijingTime() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const h = bj.getUTCHours();
  return {
    iso: bj.toISOString().replace('Z', '+08:00'),
    hour: h,
    timeLabel: h < 12 ? '10:00' : '22:00',
    date: bj.toISOString().split('T')[0],
  };
}

// HTTP GET
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 200)}`)); }
      });
    }).on('error', reject).on('timeout', function() { this.destroy(); reject(new Error('timeout')); });
  });
}

async function fetchPerson(personId) {
  const url = `${API_BASE}/xunyee/vcuser_person/person_info?person=${personId}`;
  const res = await fetchJSON(url);
  if (res.code !== 0 || !res.data) {
    throw new Error(`API error for ${personId}: ${res.msg}`);
  }
  return {
    name: res.data.zh_name,
    person_id: res.data.person,
    value: res.data.check || 0,
    report_1912_teleplay: res.data.report_1912_teleplay || 0,
    report_1912_teleplay_rank: res.data.report_1912_teleplay_rank || 0,
  };
}

async function main() {
  const bj = beijingTime();
  console.log(`🕐 北京时间: ${bj.iso} (${bj.timeLabel})`);
  console.log(`📊 抓取 ${TRACKED_PERSONS.length} 人数据...\n`);

  // 读取现有数据（用于对比）
  let prevData = { categories: {} };
  try {
    prevData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log('📂 已加载历史数据');
  } catch (e) {
    console.log('📂 无历史数据，首次运行');
  }

  // 并行抓取所有人
  const results = [];
  for (const person of TRACKED_PERSONS) {
    try {
      const data = await fetchPerson(person.person_id);
      console.log(`  ✅ ${data.name}: check=${data.value.toLocaleString()}`);
      results.push(data);
    } catch (err) {
      console.error(`  ❌ ${person.name}: ${err.message}`);
      // 保留旧数据
      const prevCategory = prevData.categories?.xunyee_check;
      const prevItem = prevCategory?.items?.find(i => i.person_id === person.person_id);
      if (prevItem) {
        console.log(`  ⚠️  使用旧数据: check=${prevItem.value.toLocaleString()}`);
        results.push({ name: prevItem.name, person_id: prevItem.person_id, value: prevItem.value });
      }
    }
  }

  // 按 check 值降序排序
  results.sort((a, b) => b.value - a.value);

  // 查找上次同日同时段数据做对比
  // 策略：用上次同时间标签的数据做 prev_value
  const prevCategory = prevData.categories?.xunyee_check;
  const prevItems = prevCategory?.items || [];
  const prevFetchTime = prevData.fetch_time || '';

  // 如果是 10:00 取数据，对比昨天 22:00 的数据
  // 如果是 22:00 取数据，对比今天 10:00 的数据（或上次 22:00）
  const targetPrevTime = bj.timeLabel === '10:00' ? '22:00' : '10:00';

  const items = results.map(item => {
    let prev = prevItems.find(i => i.person_id === item.person_id);
    let prevValue = item.value; // 默认和当前一样（涨幅为0）

    if (prev && prevFetchTime === targetPrevTime) {
      // 找到了对应时段的历史数据
      prevValue = prev.value;
    } else if (prev) {
      // 用上次任意时段的 value 作为 prev_value
      prevValue = prev.prev_value || prev.value;
    }

    const changeAmount = item.value - prevValue;
    const changePercent = prevValue > 0 ? parseFloat(((changeAmount / prevValue) * 100).toFixed(1)) : 0;

    return {
      name: item.name,
      person_id: item.person_id,
      value: item.value,
      prev_value: prevValue,
      change_amount: changeAmount,
      change_percent: changePercent,
    };
  });

  // 组装输出
  const output = {
    updated_at: bj.iso,
    fetch_time: bj.timeLabel,
    categories: {
      xunyee_check: {
        name: '寻艺点赞',
        icon: '👍',
        sort_field: 'value',
        sort_order: 'desc',
        items,
      },
    },
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`\n✅ 已写入 ${DATA_FILE}`);
  console.log(`📈 当前排行:`);
  items.forEach((item, i) => {
    const arrow = item.change_amount > 0 ? '▲' : item.change_amount < 0 ? '▼' : '─';
    console.log(`  ${i + 1}. ${item.name}: ${item.value.toLocaleString()} (${arrow}${Math.abs(item.change_amount).toLocaleString()})`);
  });
}

main().catch(err => {
  console.error('❌ 抓取失败:', err.message);
  process.exit(1);
});
