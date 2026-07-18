/* ============================================
   Supabase 客户端初始化
   使用时请替换下方的 URL 和 anon key
   ============================================ */

// 从 Supabase 项目设置中获取这两个值
// Supabase Dashboard → Settings → API
const SUPABASE_URL = 'https://YOUR-PROJECT-ID.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

// 检测是否已配置（替换了占位符）
const SUPABASE_CONFIGURED =
  SUPABASE_URL !== 'https://YOUR-PROJECT-ID.supabase.co' &&
  SUPABASE_ANON_KEY !== 'your-anon-key-here';

// 内部使用的邮箱域名
const EMAIL_DOMAIN = '@checkin.app';

// Supabase 客户端（按需初始化）
let supabase = null;

// 仅在已配置时动态加载 Supabase SDK
if (SUPABASE_CONFIGURED) {
  (function loadSupabaseSDK() {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.onload = function() {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase 已连接');
      // 触发自定义事件，通知其他脚本 Supabase 已就绪
      window.dispatchEvent(new Event('supabase-ready'));
    };
    script.onerror = function() {
      console.warn('⚠️ Supabase SDK 加载失败（网络不可达），切换为演示模式');
      // 降级为演示模式：把 SUPABASE_CONFIGURED 覆盖为 false
      window.SUPABASE_CONFIGURED_FALLBACK = false;
      window.dispatchEvent(new Event('supabase-ready'));
    };
    document.head.appendChild(script);
  })();
} else {
  // 未配置，直接标记就绪（演示模式）
  setTimeout(function() {
    window.dispatchEvent(new Event('supabase-ready'));
  }, 10);
}
