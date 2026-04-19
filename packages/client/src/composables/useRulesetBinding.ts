/**
 * useRulesetBinding
 * 加载规则集定义，为块编辑器提供属性/技能/命令下拉列表
 */
import { ref, computed, watch, type Ref } from 'vue';
import { api } from '../utils/api';
import type { Ruleset } from '@trpg/shared';

export function useRulesetBinding(rulesetId: Ref<string | null | undefined>) {
  const ruleset = ref<Ruleset | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadRuleset(id: string) {
    loading.value = true;
    error.value = null;
    try {
      ruleset.value = await api.get<Ruleset>(`/api/rulesets/${id}`);
    } catch (e: any) {
      error.value = e?.message ?? '加载规则集失败';
      ruleset.value = null;
    } finally {
      loading.value = false;
    }
  }

  watch(
    rulesetId,
    (id) => { if (id) loadRuleset(id); else ruleset.value = null; },
    { immediate: true },
  );

  /** 从 _l1_config.attributes 中提取属性名 */
  const availableAttributes = computed<string[]>(() => {
    const cfg = (ruleset.value as any)?._l1_config;
    return Object.keys(cfg?.attributes ?? {});
  });

  /** 从 _l1_config.skills 中提取技能名（或从 character_card_schema 解析） */
  const availableSkills = computed<string[]>(() => {
    const cfg = (ruleset.value as any)?._l1_config;
    if (cfg?.skills) return Object.keys(cfg.skills);
    // fallback: character_card_schema 结构
    const schema = (ruleset.value as any)?.character_card_schema as any;
    if (!schema) return [];
    const result: string[] = [];
    for (const section of schema?.sections ?? []) {
      for (const field of section?.fields ?? []) {
        if (field.type === 'skill') result.push(field.name);
      }
    }
    return result;
  });

  /** 从 _l1_config.resources 中提取资源名 */
  const availableResources = computed<string[]>(() => {
    const cfg = (ruleset.value as any)?._l1_config;
    return Object.keys(cfg?.resources ?? {});
  });

  /** 从 supported_commands 中提取命令列表 */
  const availableCommands = computed<string[]>(() => {
    const cfg = (ruleset.value as any)?._l1_config;
    return (cfg?.supported_commands ?? []) as string[];
  });

  const availableCheckTypes = computed<string[]>(() => availableCommands.value);

  return {
    ruleset,
    loading,
    error,
    availableAttributes,
    availableSkills,
    availableResources,
    availableCommands,
    availableCheckTypes,
  };
}
