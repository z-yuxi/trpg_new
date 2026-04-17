import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('../views/Home.vue'), meta: { title: '首页' } },
      { path: 'assets', name: 'AssetLibrary', component: () => import('../views/AssetLibrary.vue'), meta: { title: '素材广场' } },
      { path: 'campaigns', name: 'MyCampaigns', component: () => import('../views/MyCampaigns.vue'), meta: { title: '我的战役' } },
      { path: 'community', name: 'Community', component: () => import('../views/Community.vue'), meta: { title: '社区' } },
      { path: 'personal', name: 'Personal', component: () => import('../views/Personal.vue'), meta: { title: '我的' } },
    ],
  },
  {
    path: '/room/:id',
    name: 'Room',
    component: () => import('../views/Room.vue'),
    meta: { requiresAuth: true, title: '跑团房间' },
  },
  {
    path: '/character/editor/:id?',
    name: 'CharacterEditor',
    component: () => import('../views/CharacterEditor.vue'),
    meta: { requiresAuth: true, title: '角色编辑' },
  },
  {
    path: '/creator',
    name: 'CreatorDashboard',
    component: () => import('../views/CreatorDashboard.vue'),
    meta: { requiresAuth: true, title: '创作台' },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' },
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
  } else {
    next();
  }
});

export default router;
