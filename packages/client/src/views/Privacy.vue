<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const showBackButton = ref(false);

interface TocItem { id: string; text: string; }
const toc = ref<TocItem[]>([]);
const activeId = ref('');

const POLICY_VERSION = 'V1.0';
const POLICY_DATE = '2026年__月__日';

function detectStandalonePWA() {
  const isStandaloneByMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isStandaloneByIOS = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isStandaloneByMedia || isStandaloneByIOS;
}

function goBack() {
  if (window.history.length > 1) {
    router.back();
    return;
  }
  router.push('/');
}

function buildToc() {
  const headings = document.querySelectorAll<HTMLHeadingElement>('.prose h2');
  toc.value = Array.from(headings).map((el) => ({
    id: el.id || el.textContent?.trim().replace(/\s+/g, '-') || '',
    text: el.textContent?.trim() || '',
  }));
  headings.forEach((el) => {
    if (!el.id && el.textContent) {
      el.id = el.textContent.trim().replace(/\s+/g, '-');
    }
  });
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let observer: IntersectionObserver | null = null;
function initObserver() {
  const headings = document.querySelectorAll<HTMLElement>('.prose h2');
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) activeId.value = e.target.id;
      }
    },
    { rootMargin: '-64px 0px -70% 0px', threshold: 0 },
  );
  headings.forEach((el) => observer!.observe(el));
}

onMounted(() => {
  showBackButton.value = detectStandalonePWA();
  buildToc();
  initObserver();
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div class="legal-page">
    <!-- 固定顶部导航栏 -->
    <header class="legal-header">
      <button v-if="showBackButton" class="back-btn" @click="goBack">
        <span class="back-icon">←</span> 返回
      </button>
      <div v-else class="header-spacer" />
      <h1 class="header-title">共叙隐私政策</h1>
      <div class="header-spacer" />
    </header>

    <div class="legal-body">
      <!-- 桌面端目录（≥1024px） -->
      <nav v-if="toc.length" class="toc" aria-label="目录导航">
        <ul>
          <li
            v-for="item in toc"
            :key="item.id"
            :class="{ active: activeId === item.id }"
            @click="scrollToSection(item.id)"
          >{{ item.text }}</li>
        </ul>
      </nav>

      <!-- 正文 -->
      <article class="prose">
        <p class="meta">版本：{{ POLICY_VERSION }}&emsp;生效日期：{{ POLICY_DATE }}</p>

        <h2 id="一、信息收集">一、信息收集</h2>
        <p>1.1 <strong>必要信息</strong>：注册时需提供手机号码，用于接收验证码和重要通知。</p>
        <p>1.2 <strong>可选信息</strong>：您可自行选择填写昵称、头像、个人简介等信息。这些信息将在您的个人主页展示，您可在设置中调整其可见范围。</p>
        <p>1.3 <strong>实名认证信息</strong>：申请创作者身份、发布付费内容或发起提现时，需提供真实姓名、身份证号（个人）或企业名称、统一社会信用代码、对公账户（企业）。这些信息仅用于身份核验与合规目的，平台不会用于任何其他用途。</p>
        <p>1.4 <strong>自动采集信息</strong>：当您使用平台时，我们可能自动采集设备型号、操作系统、IP地址、访问时间等技术数据，用于保障服务安全和优化用户体验。</p>

        <h2 id="二、AI数据处理">二、AI数据处理</h2>
        <p>2.1 <strong>双开关独立控制</strong>：您可在隐私设置中单独授权或关闭：</p>
        <ul>
          <li><strong>社区社交内容授权</strong>：是否允许AI读取您的公开发帖、评论、招募需求等，用于智能匹配队友与同好。</li>
          <li><strong>原创创作内容授权</strong>：是否允许AI读取您的模组、跑团记录、原创文稿等，用于匹配创作同好与灵感辅助。</li>
        </ul>
        <p>2.2 <strong>核心原则：公开 ≠ 允许AI读取</strong>。即使您的帖子对真人用户公开可见，只要您关闭了对应授权，AI系统将完全不抓取、不解析、不沉淀您的任何信息。</p>
        <p>2.3 <strong>AI训练声明</strong>：您的内容不会用于外部AI模型训练。平台内的AI模型优化仅使用经您明确授权的内容，且不包含个人身份信息。</p>
        <p>2.4 <strong>用户画像</strong>：社交匹配功能在您授权后，会在后台静默沉淀轻量化的匹配线索。这些线索从未公开展示、不可被其他用户查看、仅用于当次匹配计算。您关闭授权后，画像数据在30天内自动清除。</p>

        <h2 id="三、信息使用">三、信息使用</h2>
        <p>3.1 您的个人信息仅用于提供、维护和改进平台服务，包括：身份验证与账号安全；内容发布与社区互动；创作者收益结算与提现；提供客户支持。</p>
        <p>3.2 我们不会将您的个人信息出售给任何第三方。法律强制要求披露的除外。</p>

        <h2 id="四、信息存储与安全">四、信息存储与安全</h2>
        <p>4.1 您的个人信息存储于中国境内。我们采取数据加密、访问控制、防火墙等合理措施保护您的信息安全。</p>
        <p>4.2 实名认证信息与用户基础信息表分离存储，并采用额外加密层。手机号通过HMAC盲索引存储，不以明文形式保存于数据库。</p>
        <p>4.3 账号注销后，我们将进入15天冷静期，冷静期结束后永久删除您的个人信息。法律法规另有要求的除外。</p>

        <h2 id="五、用户权利">五、用户权利</h2>
        <p>5.1 您有权随时访问、更正、删除您的个人信息（通过账号设置页面）。</p>
        <p>5.2 您有权要求导出您的数据副本（通过设置-数据管理）。</p>
        <p>5.3 您有权注销账号（通过设置-数据管理-删除账号），注销后经15天冷静期确认，所有个人信息将被永久删除。</p>

        <h2 id="六、Cookie及同类技术">六、Cookie及同类技术</h2>
        <p>我们可能使用Cookie及类似技术来识别您的登录状态、保障服务安全。您可通过浏览器设置管理Cookie偏好，但这可能影响部分功能的正常使用。我们不使用第三方跟踪广告Cookie。</p>

        <h2 id="七、未成年人保护">七、未成年人保护</h2>
        <p>7.1 平台不对未满16周岁的用户开放实名认证服务。如您未满16周岁，请勿提交实名信息。我们如发现已收集了未满16周岁用户的实名信息，将立即删除。</p>
        <p>7.2 平台内包含恐怖、悬疑、暴力等TRPG题材内容，建议16周岁以上用户参与。</p>

        <h2 id="八、政策更新">八、政策更新</h2>
        <p>8.1 我们可能会更新本隐私政策。更新后的政策将在平台公告公示，重大变更将通过站内信通知。</p>
        <p>8.2 如您不同意更新后的政策，应当停止使用平台服务。继续使用的，视为接受更新后的政策。</p>

        <h2 id="九、联系我们">九、联系我们</h2>
        <p>如您对本隐私政策有任何疑问、意见或投诉，请通过以下方式联系我们：</p>
        <p>平台：共叙&emsp;联系邮箱：<a href="mailto:privacy@conxu.cn">privacy@conxu.cn</a></p>
        <p>相关服务条款详见<a href="/terms" target="_blank" rel="noopener">《共叙平台服务协议》</a>。</p>
      </article>
    </div>

    <!-- 固定底部 -->
    <footer class="legal-footer">
      <span>© 2026 共叙</span>
      <span class="divider">|</span>
      <span class="muted">备案号待填写</span>
      <span class="divider">|</span>
      <a href="mailto:contact@gongxu.app">联系我们</a>
      <span class="divider">|</span>
      <a href="/terms" target="_blank" rel="noopener">服务协议</a>
    </footer>
  </div>
</template>

<style scoped>
.legal-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--surface-bg, #f5f8fc);
  color: var(--text-body, #2c3e50);
}
.legal-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  z-index: 100;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: var(--surface-card, #ffffff);
  border-bottom: 1px solid rgba(91, 141, 184, 0.1);
  box-shadow: 0 1px 6px rgba(41, 73, 102, 0.06);
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--color-accent, #5b8db8);
  font-size: 14px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
  white-space: nowrap;
}
.back-btn:hover { background: rgba(91, 141, 184, 0.08); }
.back-icon { font-size: 16px; }
.header-title {
  flex: 1;
  text-align: center;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #1a2b3c);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.header-spacer { width: 72px; }
.legal-body {
  display: flex;
  flex: 1;
  max-width: 960px;
  width: 100%;
  margin: 64px auto 56px;
  padding: 32px 16px;
  gap: 40px;
  align-items: flex-start;
}
.toc {
  display: none;
  width: 200px;
  flex-shrink: 0;
  position: sticky;
  top: 64px;
}
.toc ul { list-style: none; margin: 0; padding: 0; }
.toc li {
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary, #5c6b7a);
  cursor: pointer;
  border-left: 3px solid transparent;
  border-radius: 0 4px 4px 0;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1.4;
}
.toc li:hover { color: var(--color-accent, #5b8db8); background: rgba(91,141,184,0.06); }
.toc li.active { color: var(--color-accent, #5b8db8); border-left-color: var(--color-accent, #5b8db8); font-weight: 500; }
.prose { flex: 1; min-width: 0; max-width: 720px; }
.meta { font-size: 12px; color: var(--text-muted, #8fa3b1); margin-bottom: 28px; }
.prose h2 { font-size: 20px; font-weight: 600; color: var(--text-primary, #1a2b3c); margin: 32px 0 12px; padding-top: 8px; }
.prose p { font-size: 15px; line-height: 1.8; color: var(--text-body, #2c3e50); margin-bottom: 16px; }
.prose strong { color: var(--text-primary, #1a2b3c); }
.prose a { color: var(--color-accent, #5b8db8); text-decoration: none; }
.prose a:hover { text-decoration: underline; }
.legal-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted, #8fa3b1);
  background: var(--surface-card, #ffffff);
  border-top: 1px solid rgba(91, 141, 184, 0.08);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.legal-footer a { color: var(--text-muted, #8fa3b1); text-decoration: none; }
.legal-footer a:hover { color: var(--color-accent, #5b8db8); }
.divider { color: rgba(91, 141, 184, 0.3); }
.muted { color: var(--text-muted, #8fa3b1); }
@media (min-width: 1024px) { .toc { display: block; } }
@media (max-width: 480px) {
  .legal-header { height: 56px; padding-top: env(safe-area-inset-top, 0); }
  .legal-body { margin-top: 72px; padding: 20px 16px; }
  .prose h2 { font-size: 18px; margin-top: 24px; }
  .prose p { font-size: 14px; line-height: 1.75; }
}
</style>
