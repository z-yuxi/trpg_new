import './styles/tokens.css';
import './styles/theme-day.css';
import './styles/theme-night.css';
import './styles/text-art.css';
import './styles/clue-themes.css';
import './styles/responsive.css';
import './styles/mobile.css';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import { startTokenAutoRefresh } from './utils/api';

// 注册 Service Worker（PWA）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW 注册失败不阻断主应用
    });
  });
}

// 启动登录态静默续期：到期前10分钟自动刷新 access token
startTokenAutoRefresh();

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');
