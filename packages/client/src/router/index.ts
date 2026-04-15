import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'Home', component: () => import('../views/Home.vue') },
      { path: 'assets', name: 'AssetLibrary', component: () => import('../views/AssetLibrary.vue') },
      { path: 'campaigns', name: 'MyCampaigns', component: () => import('../views/MyCampaigns.vue') },
      { path: 'community', name: 'Community', component: () => import('../views/Community.vue') },
      { path: 'personal', name: 'Personal', component: () => import('../views/Personal.vue') },
    ],
  },
  {
    path: '/room/:id',
    name: 'Room',
    component: () => import('../views/Room.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/character/editor/:id?',
    name: 'CharacterEditor',
    component: () => import('../views/CharacterEditor.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/creator',
    name: 'CreatorDashboard',
    component: () => import('../views/CreatorDashboard.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
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
