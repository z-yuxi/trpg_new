import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth-store';

// TypeScript 元信息类型扩展
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresCreator?: boolean;
    title?: string;
    disableBack?: boolean;
    isPrimaryTab?: boolean;
  }
}

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      // 根路径：未登录显示首页，已登录跳探索（由 beforeEach 处理）
      { path: '', name: 'Home', component: () => import('../views/Home.vue'), meta: { title: '首页', disableBack: true } },
      // 探索
      { path: 'explore', name: 'Explore', component: () => import('../views/AssetLibrary.vue'), meta: { title: '探索', isPrimaryTab: true } },
      // 招募
      { path: 'recruit', name: 'Recruit', component: () => import('../views/community/RecruitSection.vue'), meta: { title: '招募', isPrimaryTab: true } },
      { path: 'recruit/:id', name: 'RecruitDetail', component: () => import('../views/community/RecruitmentDetail.vue'), meta: { title: '招募详情' } },
      // 房间（原我的团）
      { path: 'rooms', name: 'Rooms', component: () => import('../views/MyCampaigns.vue'), meta: { title: '房间' } },
      // 讨论（原社区论坛）
      {
        path: 'discuss',
        component: () => import('../views/Community.vue'),
        meta: { title: '讨论', isPrimaryTab: true },
        children: [
          { path: '', redirect: { path: '/discuss/tips' } },
          { path: ':board', name: 'DiscussBoard', component: () => import('../views/community/ForumBoard.vue'), meta: { title: '讨论区', isPrimaryTab: true } },
        ],
      },
      { path: 'discuss/thread/:id', name: 'ThreadDetail', component: () => import('../views/community/ThreadDetail.vue'), meta: { title: '帖子详情' } },
      // 团途（原个人中心）
      { path: 'tuantu', name: 'Tuantu', component: () => import('../views/Personal.vue'), meta: { title: '团途', isPrimaryTab: true } },
      { path: 'journey', redirect: '/tuantu' },
      { path: 'tuantu/characters', name: 'TuantuCharacters', component: () => import('../views/personal/PersonalCharacters.vue'), meta: { title: '角色档案' } },
      { path: 'tuantu/assets', name: 'TuantuAssets', component: () => import('../views/personal/MineAssets.vue'), meta: { title: '个人馆藏', requiresAuth: true } },
      // 通知中心（独立页）
      { path: 'notifications', name: 'Notifications', component: () => import('../views/personal/NotificationList.vue'), meta: { title: '通知', requiresAuth: true } },
      // 私信
      { path: 'messages', name: 'Messages', component: () => import('../views/Messages.vue'), meta: { title: '私信', requiresAuth: true } },
      // 设置（统一入口）
      { path: 'settings', name: 'Settings', component: () => import('../views/Settings.vue'), meta: { title: '设置', requiresAuth: true } },
      // 兼容旧路由：老 tuantu 子页重定向
      { path: 'tuantu/security', redirect: '/settings' },
      { path: 'tuantu/notifications', redirect: '/settings' },
      { path: 'tuantu/notification-list', redirect: '/notifications' },
      { path: 'tuantu/privacy', redirect: '/settings' },
      { path: 'tuantu/about', redirect: '/settings' },
      // 兼容旧地址：/mine 和 /trip
      { path: 'mine', redirect: '/tuantu' },
      {
        path: 'mine/:pathMatch(.*)*',
        redirect: (to: any) => {
          const raw = to.params['pathMatch'];
          const nextPath = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
          return `/tuantu/${nextPath}`;
        },
      },
      { path: 'trip', redirect: '/tuantu' },
      {
        path: 'trip/:pathMatch(.*)*',
        redirect: (to: any) => {
          const raw = to.params['pathMatch'];
          const nextPath = Array.isArray(raw) ? raw.join('/') : String(raw ?? '');
          return `/tuantu/${nextPath}`;
        },
      },
      { path: 'u/:uid', name: 'UserProfile', component: () => import('../views/UserProfile.vue'), meta: { title: '个人主页' } },
    ],
  },
  {
    path: '/ruleset/:id',
    name: 'RulesetDetail',
    component: () => import('../views/RulesetDetail.vue'),
    meta: { title: '规则集详情' },
  },
  {
    path: '/room/:id',
    name: 'Room',
    component: () => import('../views/Room.vue'),
    meta: { requiresAuth: true, title: '跑团房间' },
  },
  {
    path: '/campaign/:campaignId/gm/:module',
    name: 'GMManagement',
    component: () => import('../views/GMManagement.vue'),
    meta: { requiresAuth: true, title: 'GM 管理' },
  },
  {
    path: '/room/:id/export',
    name: 'LogExport',
    component: () => import('../views/LogExport.vue'),
    meta: { requiresAuth: true, title: '导出日志' },
  },
  {
    path: '/character/editor/:id?',
    name: 'CharacterEditor',
    component: () => import('../views/CharacterEditor.vue'),
    meta: { requiresAuth: true, title: '角色编辑' },
  },
  {
    path: '/creator',
    component: () => import('../views/CreatorDashboard.vue'),
    meta: { requiresAuth: true, requiresCreator: true, title: '创作者专区' },
    children: [
      { path: '', redirect: '/creator/dashboard' },
      { path: 'workshop', name: 'RulesetWorkshop', component: () => import('../views/creator/RulesetWorkshop.vue') },
      { path: 'workshop/:id/edit', name: 'RulesetEditor', component: () => import('../views/creator/RulesetEditor.vue') },
      { path: 'modules', name: 'ModuleList', component: () => import('../views/creator/ModuleList.vue') },
      { path: 'modules/:id/edit', name: 'ModuleEditor', component: () => import('../views/creator/ModuleEditor.vue') },
      { path: 'assets', name: 'CreatorAssets', component: () => import('../views/creator/CreatorAssets.vue') },
      { path: 'dashboard', name: 'CreatorDashboard', component: () => import('../views/creator/DashboardHome.vue') },
      { path: 'products', name: 'CreatorProducts', component: () => import('../views/creator/CreatorProducts.vue') },
      { path: 'earnings', name: 'CreatorEarnings', component: () => import('../views/creator/CreatorEarnings.vue') },
    ],
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录', disableBack: true },
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('../views/Forbidden.vue'),
    meta: { title: '无权访问' },
  },
  {
    path: '/500',
    name: 'ServerError',
    component: () => import('../views/ServerError.vue'),
    meta: { title: '服务器错误' },
  },
  {
    path: '/offline',
    name: 'NetworkError',
    component: () => import('../views/NetworkError.vue'),
    meta: { title: '网络错误' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  if (to.meta.requiresAuth && (!authStore.token || authStore.isTokenExpired())) {
    authStore.logout();
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }
  if (to.meta.requiresCreator) {
    if (!authStore.isCreator) {
      next({ name: 'Forbidden' });
      return;
    }
  }
  // 已登录访问根路径 → 直接跳探索
  if (to.name === 'Home' && authStore.isLoggedIn) {
    next({ name: 'Explore' });
    return;
  }
  next();
});

export default router;
