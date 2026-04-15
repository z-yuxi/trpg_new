<script setup lang="ts">
import { ref } from 'vue';
import TCard from '../components/base/TCard.vue';
import TButton from '../components/base/TButton.vue';

const stats = ref([
  { label: '作品数量', value: 2, unit: '件' },
  { label: '总下载量', value: 128, unit: '次' },
  { label: '本月收入', value: 36, unit: '元' },
  { label: '订阅者数', value: 12, unit: '人' },
]);

const orders = ref([
  { no: 'ORD-001', name: '克苏鲁神话规则集', buyer: '深海孤影', amount: 18, time: '2026-04-10', status: '已完成' },
  { no: 'ORD-002', name: '恐惧大陆模组', buyer: '月影追风', amount: 18, time: '2026-04-08', status: '已完成' },
]);

const withdrawBalance = ref(36);
</script>

<template>
  <div class="creator-dash">
    <h1 class="page-title">创作者后台</h1>

    <!-- 数据看板 -->
    <div class="stats-grid">
      <TCard v-for="s in stats" :key="s.label" padding="md" shadow>
        <div class="stat-label">{{ s.label }}</div>
        <div class="stat-value">{{ s.value }}<span class="stat-unit">{{ s.unit }}</span></div>
      </TCard>
    </div>

    <!-- 订单列表 -->
    <TCard padding="md" shadow>
      <h2 class="section-title">订单记录</h2>
      <table class="orders-table">
        <thead>
          <tr>
            <th>订单号</th><th>商品名称</th><th>买家</th><th>金额</th><th>时间</th><th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.no">
            <td class="order-no">{{ o.no }}</td>
            <td>{{ o.name }}</td>
            <td>{{ o.buyer }}</td>
            <td>¥{{ o.amount }}</td>
            <td>{{ o.time }}</td>
            <td>{{ o.status }}</td>
          </tr>
        </tbody>
      </table>
    </TCard>

    <!-- 提现 -->
    <TCard padding="md" shadow>
      <h2 class="section-title">提现</h2>
      <div class="withdraw-row">
        <span class="balance-label">可提现余额：</span>
        <span class="balance-value">¥{{ withdrawBalance }}</span>
        <TButton type="primary" size="sm" :disabled="withdrawBalance === 0">申请提现</TButton>
      </div>
    </TCard>
  </div>
</template>

<style scoped>
.creator-dash { max-width: 960px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-6); }
.page-title { font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); }
.stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-4); }
.stat-label { font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1); }
.stat-value { font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); }
.stat-unit { font-size: var(--text-sm); margin-left: 4px; color: var(--color-text-secondary); }
.section-title { font-size: var(--text-lg); font-weight: 600; margin-bottom: var(--space-4); }
.orders-table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
.orders-table th, .orders-table td { padding: var(--space-3); border-bottom: 1px solid var(--color-card-border); text-align: left; }
.orders-table th { color: var(--color-text-secondary); font-weight: 500; }
.order-no { font-family: var(--font-mono); font-size: var(--text-xs); }
.withdraw-row { display: flex; align-items: center; gap: var(--space-3); }
.balance-label { color: var(--color-text-secondary); }
.balance-value { font-size: var(--text-xl); font-weight: 700; color: var(--color-success); }
</style>
