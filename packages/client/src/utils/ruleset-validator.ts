/**
 * ruleset-validator.ts
 * L1 规则集表单校验工具
 */

export interface ValidationError {
  field: string;    // 字段路径，如 'defaultDice'、'difficultyLevels[1].name'
  message: string;
}

export interface RulesetFormForValidation {
  name: string;
  defaultDice: string;
  checkMode: string;
  critSuccessMax: number;
  critFailMin: number;
  difficultyLevels: Array<{ name: string; threshold: number }>;
  attributes: Array<{ name: string; roll_formula: string }>;
  resources: Array<{ name: string; max_formula: string }>;
  supportedCommands: string[];
  customCommands?: Array<{
    name: string;
    param_mapping: Array<{ source: string; field?: string }>;
  }>;
}

/** 校验骰子表达式（支持复杂格式如 3d6+2, 1d100, 2d10+1d6） */
const DICE_REGEX = /^\d+d\d+([+-](\d+d\d+|\d+))*$/i;

export function validateRulesetForm(form: RulesetFormForValidation): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. 名称
  if (!form.name.trim()) {
    errors.push({ field: 'name', message: '规则集名称不能为空' });
  } else if (form.name.length > 100) {
    errors.push({ field: 'name', message: '名称不超过 100 字' });
  }

  // 2. 骰子表达式
  if (!form.defaultDice.trim()) {
    errors.push({ field: 'defaultDice', message: '默认骰子表达式不能为空' });
  } else if (!DICE_REGEX.test(form.defaultDice.trim())) {
    errors.push({ field: 'defaultDice', message: `无效的骰子表达式: "${form.defaultDice}"，示例: 1d100, 2d6+3` });
  }

  // 3. 大成功/大失败阈值逻辑
  if (form.checkMode === 'roll_under' && form.critSuccessMax >= form.critFailMin) {
    errors.push({ field: 'critSuccessMax', message: 'roll_under 模式下大成功阈值应小于大失败阈值' });
  }
  if (form.checkMode === 'roll_over' && form.critFailMin <= form.critSuccessMax) {
    errors.push({ field: 'critFailMin', message: 'roll_over 模式下大失败阈值应大于大成功阈值' });
  }

  // 4. 难度等级去重与必填
  const diffNames = new Set<string>();
  form.difficultyLevels.forEach((d, i) => {
    if (!d.name.trim()) {
      errors.push({ field: `difficultyLevels[${i}].name`, message: `第 ${i + 1} 个难度名不能为空` });
    } else if (diffNames.has(d.name.trim())) {
      errors.push({ field: `difficultyLevels[${i}].name`, message: `重复的难度名: "${d.name}"` });
    }
    if (d.name.trim()) diffNames.add(d.name.trim());
  });

  // 5. 属性必填项
  form.attributes.forEach((a, i) => {
    if (!a.name.trim()) {
      errors.push({ field: `attributes[${i}].name`, message: `第 ${i + 1} 个属性名不能为空` });
    }
  });

  // 6. 资源必填项
  form.resources.forEach((r, i) => {
    if (!r.name.trim()) {
      errors.push({ field: `resources[${i}].name`, message: `第 ${i + 1} 个资源名不能为空` });
    }
    if (!r.max_formula.trim()) {
      errors.push({ field: `resources[${i}].max_formula`, message: `资源 "${r.name || i + 1}" 的最大值公式不能为空` });
    }
  });

  // 7. 至少一个支持的命令
  if (form.supportedCommands.length === 0) {
    errors.push({ field: 'supportedCommands', message: '至少需要一个支持的命令' });
  }

  // 8. 自定义命令参数映射
  form.customCommands?.forEach((cmd, ci) => {
    if (!cmd.name.trim()) {
      errors.push({ field: `customCommands[${ci}].name`, message: `第 ${ci + 1} 个自定义命令名不能为空` });
    }
    cmd.param_mapping?.forEach((p, pi) => {
      if ((p.source === 'character_attribute' || p.source === 'character_skill') && !p.field?.trim()) {
        errors.push({
          field: `customCommands[${ci}].param_mapping[${pi}].field`,
          message: `命令 "${cmd.name}" 的第 ${pi + 1} 个参数映射缺少字段名`,
        });
      }
    });
  });

  return errors;
}
