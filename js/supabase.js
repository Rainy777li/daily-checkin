/* ============================================
   Supabase 客户端初始化
   使用时请替换下方的 URL 和 anon key
   ============================================ */

// 从 Supabase 项目设置中获取这两个值
// Supabase Dashboard → Settings → API
const SUPABASE_URL = 'https://afgrrqpyvcfmkcrivyuu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8GlaFi0wjrYjCvxFWtCI5Q_ln4Np51R';

// 检测是否已配置（替换了占位符）
const SUPABASE_CONFIGURED =
  SUPABASE_URL !== 'https://YOUR-PROJECT-ID.supabase.co' &&
  SUPABASE_ANON_KEY !== 'your-anon-key-here';

// 内部使用的邮箱域名
const EMAIL_DOMAIN = '@checkin.app';

// Supabase 客户端（按需初始化）
let supabase = null;

// 仅在已配置时加载 Supabase SDK（使用本地文件，无需CDN）
if (SUPABASE_CONFIGURED) {
  (function loadSupabaseSDK() {
    var script = document.createElement('script');
    script.src = 'js/supabase-sdk.min.js';
    script.onload = function() {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      console.log('✅ Supabase 已连接');
      window.dispatchEvent(new Event('supabase-ready'));
    };
    script.onerror = function() {
      console.warn('⚠️ Supabase SDK 加载失败，切换为演示模式');
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
