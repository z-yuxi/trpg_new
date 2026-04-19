"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformPresetCommand = exports.PLATFORM_PRESET_COMMAND_NAMES = void 0;
/** 平台预置命令名称列表 */
exports.PLATFORM_PRESET_COMMAND_NAMES = [
    'roll', 'check', 'initiative',
    'r', 'rh', 'nn',
    'ra', 'rc', 'sc', 'en', 'ti', 'li', 'init', 'ds',
];
/** 平台预置命令枚举 */
var PlatformPresetCommand;
(function (PlatformPresetCommand) {
    /** 通用掷骰（/r 2d6） */
    PlatformPresetCommand["r"] = "r";
    /** 暗骰，结果仅 GM 可见 */
    PlatformPresetCommand["rh"] = "rh";
    /** 旁白（系统消息） */
    PlatformPresetCommand["nn"] = "nn";
    /** 投掷骰子 */
    PlatformPresetCommand["roll"] = "roll";
    /** 技能检定（通用） */
    PlatformPresetCommand["check"] = "check";
    /** 先攻 */
    PlatformPresetCommand["initiative"] = "initiative";
    /** 属性检定（1d100 ≤ 属性值） */
    PlatformPresetCommand["ra"] = "ra";
    /** 标准检定（1d100 ≤ 技能值） */
    PlatformPresetCommand["rc"] = "rc";
    /** 理智检定 */
    PlatformPresetCommand["sc"] = "sc";
    /** 成长检定 */
    PlatformPresetCommand["en"] = "en";
    /** 临时疯狂 */
    PlatformPresetCommand["ti"] = "ti";
    /** 长期疯狂 */
    PlatformPresetCommand["li"] = "li";
    /** 先攻（短别名） */
    PlatformPresetCommand["init"] = "init";
    /** 死亡豁免 */
    PlatformPresetCommand["ds"] = "ds";
})(PlatformPresetCommand || (exports.PlatformPresetCommand = PlatformPresetCommand = {}));
__exportStar(require("./events"), exports);
//# sourceMappingURL=index.js.map