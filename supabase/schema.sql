-- ============================================
-- 每日打卡应用 — 数据库建表脚本
-- 在 Supabase SQL Editor 中运行此文件
-- ============================================

-- 0. 关闭邮箱确认（简化注册流程）
-- 注意：还需要在 Supabase Dashboard → Authentication → Settings
-- → 关闭 "Confirm email" 开关

-- ============================================
-- 1. 用户信息表（profiles）
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  total_points INTEGER DEFAULT 0,
  streak      INTEGER DEFAULT 0,
  is_admin    BOOLEAN DEFAULT FALSE,
  is_banned   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 触发器：新用户注册 → 自动插入 profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. 打卡任务表（tasks）
-- ============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '✅',
  points     INTEGER DEFAULT 10,
  sort_order INTEGER DEFAULT 0,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 预设初始任务
INSERT INTO public.tasks (name, icon, points, sort_order) VALUES
  ('运动 30 分钟', '🏃', 10, 1),
  ('阅读 20 分钟', '📖', 10, 2),
  ('喝 8 杯水',   '💧', 10, 3),
  ('早睡 23:00',  '😴', 10, 4),
  ('健康饮食',    '🍎', 10, 5),
  ('冥想 10 分钟','🧘', 10, 6),
  ('写日记',      '📝', 10, 7),
  ('学习 1 小时', '🎯', 10, 8);

-- ============================================
-- 3. 打卡记录表（checkins）
-- ============================================
CREATE TABLE IF NOT EXISTS public.checkins (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id       INTEGER NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  checkin_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  points_earned INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, task_id, checkin_date)
);

-- ============================================
-- 4. 榜单分类表（ranking_categories）
-- ============================================
CREATE TABLE IF NOT EXISTS public.ranking_categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '📊',
  source_url TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 榜单条目表（ranking_items）
-- ============================================
CREATE TABLE IF NOT EXISTS public.ranking_items (
  id             SERIAL PRIMARY KEY,
  category_id    INTEGER NOT NULL REFERENCES public.ranking_categories(id) ON DELETE CASCADE,
  rank           INTEGER NOT NULL,
  name           TEXT NOT NULL,
  value          BIGINT DEFAULT 0,
  prev_value     BIGINT DEFAULT 0,
  change_amount  BIGINT DEFAULT 0,
  change_percent DECIMAL(10,2) DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. 截图审核提交表（submissions）
-- ============================================
CREATE TABLE IF NOT EXISTS public.submissions (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_name       TEXT NOT NULL,
  screenshot_url TEXT,
  status         TEXT DEFAULT 'pending',  -- pending | approved | rejected
  points_awarded INTEGER DEFAULT 0,
  submitted_at   TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at    TIMESTAMPTZ,
  review_comment TEXT
);

-- ============================================
-- RLS 安全策略
-- ============================================

-- 启用所有表的 RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_items ENABLE ROW LEVEL SECURITY;

-- profiles: 所有人可读（用于登录查找用户名和排行榜）
CREATE POLICY "允许所有人读取用户信息"
  ON public.profiles FOR SELECT
  USING (true);

-- profiles: 用户只能修改自己的信息
CREATE POLICY "允许用户修改自己的信息"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- profiles: 允许管理员修改所有用户
CREATE POLICY "允许管理员修改所有用户"
  ON public.profiles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));

-- tasks: 所有人可读
CREATE POLICY "允许所有人读取任务"
  ON public.tasks FOR SELECT
  USING (true);

-- tasks: 仅管理员可增删改
CREATE POLICY "允许管理员管理任务"
  ON public.tasks FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));

-- checkins: 用户可读自己的记录
CREATE POLICY "允许用户读取自己的打卡记录"
  ON public.checkins FOR SELECT
  USING (auth.uid() = user_id);

-- checkins: 用户可创建自己的打卡记录
CREATE POLICY "允许用户创建打卡记录"
  ON public.checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- checkins: 用户可删除自己的打卡记录（取消打卡）
CREATE POLICY "允许用户删除自己的打卡记录"
  ON public.checkins FOR DELETE
  USING (auth.uid() = user_id);

-- ranking: 所有人可读
CREATE POLICY "允许所有人读取榜单"
  ON public.ranking_categories FOR SELECT
  USING (true);

CREATE POLICY "允许所有人读取榜单条目"
  ON public.ranking_items FOR SELECT
  USING (true);

-- ranking: 仅管理员可管理
CREATE POLICY "允许管理员管理榜单"
  ON public.ranking_categories FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));

CREATE POLICY "允许管理员管理榜单条目"
  ON public.ranking_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));

-- submissions RLS
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "允许用户查看自己的提交"
  ON public.submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "允许用户创建提交"
  ON public.submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "允许管理员管理所有提交"
  ON public.submissions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ));
