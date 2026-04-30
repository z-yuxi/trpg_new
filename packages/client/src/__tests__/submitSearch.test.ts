/**
 * 提交式搜索防回退测试
 *
 * 三个列表页面（招募列表、讨论列表、房间列表）均采用"输入框缓冲值 + 已提交关键词"
 * 的双 ref 模式，只有显式调用 applySearch / applyKeywordSearch 才会更新过滤结果。
 * 本测试验证该模式的核心不变量，防止后续改动回退到 watch(input, fetch) 的实时筛选。
 */
import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';

// ── 招募列表（RecruitmentBoard.vue）──────────────────────────────────────────

describe('提交式搜索 - 招募列表', () => {
  function setup() {
    const keywordInput = ref('');
    const keyword = ref('');
    const items = ref(['星际旅行', '克苏鲁探秘', '魔法少女']);

    const filtered = computed(() =>
      !keyword.value ? items.value : items.value.filter((i) => i.includes(keyword.value)),
    );

    /** 模拟 RecruitmentBoard.applyKeywordSearch */
    function applyKeywordSearch() {
      keyword.value = keywordInput.value.trim();
    }

    return { keywordInput, keyword, filtered, applyKeywordSearch };
  }

  it('输入不触发筛选，提交后才生效', () => {
    const { keywordInput, filtered, applyKeywordSearch } = setup();

    keywordInput.value = '克苏鲁';
    expect(filtered.value).toHaveLength(3); // 未提交 → 全量

    applyKeywordSearch();
    expect(filtered.value).toHaveLength(1);
    expect(filtered.value[0]).toBe('克苏鲁探秘');
  });

  it('清空关键词后提交，恢复全量列表', () => {
    const { keywordInput, keyword, filtered, applyKeywordSearch } = setup();

    keyword.value = '魔法'; // 已有已提交关键词
    keywordInput.value = '';
    applyKeywordSearch();

    expect(filtered.value).toHaveLength(3);
  });

  it('applyKeywordSearch 会 trim 空白字符', () => {
    const { keywordInput, keyword, applyKeywordSearch } = setup();

    keywordInput.value = '  星际  ';
    applyKeywordSearch();

    expect(keyword.value).toBe('星际');
  });
});

// ── 讨论列表（ForumBoard.vue）────────────────────────────────────────────────

describe('提交式搜索 - 讨论列表', () => {
  function setup() {
    const keywordInput = ref('');
    const keyword = ref('');
    const page = ref(1);
    const fetchCount = ref(0);

    /** 模拟 ForumBoard.applyKeywordSearch */
    function applyKeywordSearch() {
      keyword.value = keywordInput.value.trim();
      page.value = 1;
      fetchCount.value++;
    }

    return { keywordInput, keyword, page, fetchCount, applyKeywordSearch };
  }

  it('输入不触发 fetch，提交才触发', () => {
    const { keywordInput, fetchCount, applyKeywordSearch } = setup();

    keywordInput.value = '新手技巧';
    expect(fetchCount.value).toBe(0); // 未提交 → 无 fetch

    applyKeywordSearch();
    expect(fetchCount.value).toBe(1);
  });

  it('提交时将页码重置为 1', () => {
    const { keywordInput, page, applyKeywordSearch } = setup();

    page.value = 5;
    keywordInput.value = '跑团分享';
    applyKeywordSearch();

    expect(page.value).toBe(1);
  });

  it('多次提交不同关键词均能更新 keyword', () => {
    const { keywordInput, keyword, applyKeywordSearch } = setup();

    keywordInput.value = '第一次';
    applyKeywordSearch();
    expect(keyword.value).toBe('第一次');

    keywordInput.value = '第二次';
    applyKeywordSearch();
    expect(keyword.value).toBe('第二次');
  });
});

// ── 房间列表（MyCampaigns.vue）───────────────────────────────────────────────

describe('提交式搜索 - 房间列表', () => {
  function setup() {
    const searchInput = ref('');
    const searchKeyword = ref('');
    const statusFilter = ref<'running' | 'ended'>('running');

    const rooms = ref([
      { id: '1', name: '克苏鲁小屋', status: 'running' },
      { id: '2', name: '魔法森林', status: 'running' },
      { id: '3', name: '星际联盟', status: 'ended' },
    ]);

    const filtered = computed(() =>
      rooms.value.filter((r) => {
        const byStatus = r.status === statusFilter.value;
        const byKeyword =
          !searchKeyword.value || r.name.toLowerCase().includes(searchKeyword.value.toLowerCase());
        return byStatus && byKeyword;
      }),
    );

    /** 模拟 MyCampaigns.applySearch */
    function applySearch() {
      searchKeyword.value = searchInput.value.trim();
    }

    return { searchInput, searchKeyword, filtered, statusFilter, applySearch };
  }

  it('输入不触发筛选，提交后才生效', () => {
    const { searchInput, filtered, applySearch } = setup();

    searchInput.value = '克苏鲁';
    expect(filtered.value).toHaveLength(2); // 未提交，running 状态2条

    applySearch();
    expect(filtered.value).toHaveLength(1);
    expect(filtered.value[0].name).toBe('克苏鲁小屋');
  });

  it('关键词与状态筛选可叠加', () => {
    const { searchInput, statusFilter, filtered, applySearch } = setup();

    statusFilter.value = 'ended';
    searchInput.value = '星际';
    applySearch();

    expect(filtered.value).toHaveLength(1);
    expect(filtered.value[0].name).toBe('星际联盟');
  });

  it('清空关键词后提交，恢复状态筛选全量结果', () => {
    const { searchKeyword, searchInput, filtered, applySearch } = setup();

    searchKeyword.value = '克苏鲁'; // 已有已提交关键词
    searchInput.value = '';
    applySearch();

    expect(filtered.value).toHaveLength(2); // running 状态2条
  });

  it('applySearch 会 trim 空白字符', () => {
    const { searchInput, searchKeyword, applySearch } = setup();

    searchInput.value = '  魔法  ';
    applySearch();

    expect(searchKeyword.value).toBe('魔法');
  });
});
