import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth-store';

// TypeScript 元信息类型扩展
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    requiresCreator?: boolean;
    title?: string;
  }
}

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('../views/Home.vue'), meta: { title: '首页' } },
      { path: 'assets', name: 'AssetLibrary', component: () => import('../views/AssetLibrary.vue'), meta: { title: '广场' } },
      { path: 'campaigns', name: 'MyCampaigns', component: () => import('../views/MyCampaigns.vue'), meta: { title: '我的团' } },
      {
        path: 'community',
        component: () => import('../views/Community.vue'),
        meta: { title: '社区' },
        children: [
          { path: '', redirect: { path: '/community/recruit' } },
          { path: 'recruit', name: 'CommunityRecruit', component: () => import('../views/community/RecruitSection.vue'), meta: { title: '招募板' } },
          { path: 'forum/:board', name: 'ForumBoard', component: () => import('../views/community/ForumBoard.vue'), meta: { title: '讨论区' } },
          { path: 'activity', name: 'CommunityActivity', component: () => import('../views/community/MyActivity.vue'), meta: { title: '我的动态' } },
        ],
      },
      { path: 'community/thread/:id', name: 'ThreadDetail', component: () => import('../views/community/ThreadDetail.vue'), meta: { title: '帖子详情' } },
      { path: 'community/:id', name: 'CommunityRecruitmentDetail', component: () => import('../views/community/RecruitmentDetail.vue'), meta: { title: '招募详情' } },
      { path: 'personal', name: 'Personal', component: () => import('../views/Personal.vue'), meta: { title: '我的' } },
      { path: 'personal/characters', name: 'PersonalCharacters', component: () => import('../views/personal/PersonalCharacters.vue'), meta: { title: '我的角色卡' } },
      { path: 'personal/security', name: 'PersonalSecurity', component: () => import('../views/personal/SecuritySettings.vue'), meta: { title: '账号安全' } },
      { path: 'personal/notifications', name: 'PersonalNotifications', component: () => import('../views/personal/NotificationSettings.vue'), meta: { title: '消息通知设置' } },
      { path: 'personal/notification-list', name: 'PersonalNotificationList', component: () => import('../views/personal/NotificationList.vue'), meta: { title: '消息通知', requiresAuth: true } },
      { path: 'personal/privacy', name: 'PersonalPrivacy', component: () => import('../views/personal/PrivacySettings.vue'), meta: { title: '隐私设置' } },
      { path: 'personal/about', name: 'PersonalAbout', component: () => import('../views/personal/About.vue'), meta: { title: '关于我们' } },
      { path: 'getting-started', name: 'GettingStarted', component: () => import('../views/GettingStarted.vue'), meta: { title: '新手指南' } },
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
    ],
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' },
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
  const token = localStorage.getItem('token');
  if (to.meta.requiresAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }
  if (to.meta.requiresCreator) {
    // token 已确认存在（上方已拦截）— 检查 creator 标识
    const authStore = useAuthStore();
    if (!authStore.isCreator) {
      next({ name: 'Forbidden' });
      return;
    }
  }
  next();
});

export default router;
