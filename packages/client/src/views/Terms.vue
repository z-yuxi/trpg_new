<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const showBackButton = ref(false);

// 目录导航 — 桌面端自动从 h2 生成
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
      <h1 class="header-title">共叙平台服务协议</h1>
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

        <h2 id="一、总则">一、总则</h2>
        <p>1.1 共叙是一个以文字为载体、以真人主持为核心、以规则引擎为基石的TRPG跑团与创作平台。</p>
        <p>1.2 用户在使用平台服务前，应当认真阅读本协议。用户点击"同意"或实际使用平台服务，即视为已充分阅读、理解并接受本协议的全部内容。</p>
        <p>1.3 用户应当为具备完全民事行为能力的自然人，或依法设立并合法存续的法人或其他组织。</p>

        <h2 id="二、账号管理">二、账号管理</h2>
        <p>2.1 用户注册时需提供真实有效的手机号码，并自行保管账号和密码。账号仅限本人使用，不得出借、转让或共享。</p>
        <p>2.2 用户可在平台内设置昵称。昵称不得包含违法、低俗或侵权内容，不得使用"叙事者_XXXX"格式（该格式为平台系统保留模板）。</p>
        <p>2.3 用户可选择进行个人实名认证或企业实名认证。认证信息仅用于身份验证与合规需求，平台不会将其用于商业推广或用户画像。</p>

        <h2 id="三、内容发布与行为规范">三、内容发布与行为规范</h2>
        <p>3.1 用户在平台上发布的任何内容（包括但不限于帖子、模组、规则包、角色卡、评论、私信及跑团记录），均应当遵守法律法规，尊重社会公德，不得含有以下内容：</p>
        <ul>
          <li>反对宪法所确定的基本原则的；</li>
          <li>危害国家安全，泄露国家秘密，颠覆国家政权的；</li>
          <li>损害国家荣誉和利益的；</li>
          <li>煽动民族仇恨、民族歧视，破坏民族团结的；</li>
          <li>破坏国家宗教政策，宣扬邪教和封建迷信的；</li>
          <li>散布谣言，扰乱社会秩序，破坏社会稳定的；</li>
          <li>散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的；</li>
          <li>侮辱或者诽谤他人，侵害他人合法权益的；</li>
          <li>含有法律、行政法规禁止的其他内容的。</li>
        </ul>
        <p>3.2 用户应尊重他人知识产权，不得抄袭、洗稿、未经授权搬运他人原创内容。引用他人内容时需明确标注来源。</p>
        <p>3.3 用户应当友善交流，不得人身攻击、引战、恶意举报或骚扰他人。</p>
        <p>3.4 GM（主持人）在跑团房间内享有规则判定的最终决定权。玩家应尊重GM的裁决。创作者不得以作者身份在其他GM的房间内干涉主持人决策或要求特殊待遇。</p>

        <h2 id="四、知识产权与授权">四、知识产权与授权</h2>
        <p>4.1 用户保留其在平台上发布的所有原创内容的知识产权。</p>
        <p>4.2 用户授予平台一项全球范围内、免费的、非独占的使用许可，以便平台对用户发布的内容进行存储、展示、分发及技术处理。该许可仅限于在平台及其关联服务内使用，不包括将用户内容出售给第三方AI训练数据集。</p>
        <p>4.3 基于他人作品创作的衍生内容（如同人模组），创作者应当遵守原作品版权方的二次创作政策，并在发布时如实声明IP来源与原创比例。因衍生创作产生的版权纠纷，由创作者自行承担责任。</p>

        <h2 id="五、AI服务使用规范">五、AI服务使用规范</h2>
        <p>5.1 平台提供AI辅助功能（如智能校对、AI模组导入、社交匹配等）。用户可在隐私设置中单独控制是否允许AI读取其社区社交内容或原创创作内容。</p>
        <p>5.2 即使内容对真人用户公开可见，只要用户关闭了对应的AI授权开关，AI系统将完全不读取、不解析、不基于该内容进行任何学习或匹配。</p>
        <p>5.3 AI在平台内仅作为辅助工具运行，不承担主持人角色，不参与跑团房间内的实时叙事决策与规则判定。</p>

        <h2 id="六、付费与退款">六、付费与退款</h2>
        <p>6.1 平台内的付费内容（模组、规则包、会员订阅等）价格以页面展示为准。用户确认购买并完成支付后，即获得相应内容的使用授权。</p>
        <p>6.2 虚拟内容（模组、规则包）一经获取，原则上不予退款，但以下情况除外：内容本身无法正常访问或使用；内容与描述严重不符；法律法规规定的其他情形。</p>
        <p>6.3 会员订阅服务可在当前计费周期结束前取消自动续费。取消后，已付费用不予退还，权益保留至周期结束。</p>

        <h2 id="七、免责声明">七、免责声明</h2>
        <p>7.1 平台作为网络信息存储空间服务提供者，对用户上传的内容不承担事先审查义务。如发现违规内容，平台将依"通知-删除"规则处理。</p>
        <p>7.2 用户之间因跑团、交易或交流产生的纠纷，应自行协商解决。平台可提供必要的证据协助，但不承担连带责任。</p>
        <p>7.3 因不可抗力、系统维护、网络故障等原因导致的服务中断，平台将尽力恢复，但不承担由此导致的直接或间接损失。</p>

        <h2 id="八、违约处理">八、违约处理</h2>
        <p>8.1 用户违反本协议的，平台有权根据违规严重程度采取以下措施中的一项或多项：警告；删除违规内容；限制发帖、评论；下架作品；冻结或永久封禁账号。</p>
        <p>8.2 用户对处理决定有异议的，可在7个工作日内提交申诉，平台在3个工作日内完成复核。复核结果为最终决定。</p>

        <h2 id="九、协议变更">九、协议变更</h2>
        <p>9.1 平台有权根据法律法规及运营需求修订本协议。修订后的协议将在平台公告公示7天后生效。</p>
        <p>9.2 用户如不同意修订后的协议，应当停止使用平台服务。继续使用的，视为接受修订后的协议。</p>

        <h2 id="十、法律适用与争议解决">十、法律适用与争议解决</h2>
        <p>10.1 本协议的订立、执行、解释及争议解决均适用中华人民共和国法律。</p>
        <p>10.2 如双方就本协议内容或其执行发生任何争议，应首先友好协商解决；协商不成的，提交平台运营方所在地有管辖权的人民法院管辖。</p>
        <p>如对本协议有任何疑问，请参阅<a href="/privacy" target="_blank" rel="noopener">《共叙隐私政策》</a>或通过联系邮箱与我们联系。</p>
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
      <a href="/privacy" target="_blank" rel="noopener">隐私政策</a>
    </footer>
  </div>
</template>

<style scoped>
/* ── 整体布局 ── */
.legal-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--surface-bg, #f5f8fc);
  color: var(--text-body, #2c3e50);
}

/* ── 顶部导航栏 ── */
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

/* ── 内容区域 ── */
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

/* ── 目录（桌面端） ── */
.toc {
  display: none;
  width: 200px;
  flex-shrink: 0;
  position: sticky;
  top: 64px;
}
.toc ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
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
.toc li.active {
  color: var(--color-accent, #5b8db8);
  border-left-color: var(--color-accent, #5b8db8);
  font-weight: 500;
}

/* ── 正文 ── */
.prose {
  flex: 1;
  min-width: 0;
  max-width: 720px;
}
.meta {
  font-size: 12px;
  color: var(--text-muted, #8fa3b1);
  margin-bottom: 28px;
}
.prose h2 {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary, #1a2b3c);
  margin: 32px 0 12px;
  padding-top: 8px;
}
.prose p {
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-body, #2c3e50);
  margin-bottom: 16px;
}
.prose a { color: var(--color-accent, #5b8db8); text-decoration: none; }
.prose a:hover { text-decoration: underline; }

/* ── 底部 ── */
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

/* ── 响应式：桌面端显示目录 ── */
@media (min-width: 1024px) {
  .toc { display: block; }
}
/* ── 移动端 ── */
@media (max-width: 480px) {
  .legal-header { height: 56px; padding-top: env(safe-area-inset-top, 0); }
  .legal-body { margin-top: 72px; padding: 20px 16px; }
  .prose h2 { font-size: 18px; margin-top: 24px; }
  .prose p { font-size: 14px; line-height: 1.75; }
}
</style>
