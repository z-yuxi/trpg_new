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

// 注册 Service Worker（PWA）—— 仅生产环境启用，避免干扰 Vite 开发服务器
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW 注册失败不阻断主应用
    });
  });
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(ElementPlus);
app.mount('#app');
