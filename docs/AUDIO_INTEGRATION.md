# 动态音乐接入说明

## 资源与设置

- 音频目录：`public/audio/douluo/`
- 音乐清单：`public/audio/douluo/music_manifest.json`
- 控制器：`src/audio/DynamicMusicController.ts`
- React接入：`src/audio/useDynamicGameMusic.ts`
- 本地设置键：`douluo.audio.settings.v1`

音乐使用浏览器原生音频能力，不新增第三方依赖。首次点击、触摸或键盘操作后解锁；页面进入后台时暂停，返回前台时恢复。声音开关位于剧情页右上角和“档案”页，两处共用同一项本地设置。

## 场景映射

- 诺丁城与学院：`bgm_notting_daily`
- 旧井与地下实验室：`bgm_blue_silver_mystery`
- 史莱克训练：`bgm_shrek_training`
- 星斗大森林：`bgm_star_dou_forest`
- 追踪与危险：`bgm_tension`
- 魂师战斗：`bgm_soul_battle`
- 人物关系与回忆：`bgm_academy_bond`
- 海神岛远景：`bgm_distant_sea`

短音效用于武魂觉醒、魂环吸收、魂力突破、强敌出现、战斗胜利、突然危险和剧情选择确认。选择确认音保持轻量，不打断剧情节奏；普通场景遵循最短保持时间并交叉淡化，战斗和高强度事件可以立即切换。

## 语音旁白

- React 接入：`src/audio/useNarration.ts`
- 本地设置键：`douluo.narration.settings.v1`
- 实现方式：浏览器 `Web Speech API`（网页语音接口），优先使用本地 `zh-CN` 中文音色，不上传旁白文字，不需要 API Key。
- 首次点击“开始新的人生”后自动朗读序章；进入游戏后，仅在剧情页对新的主线旁白自动朗读。
- 剧情页提供开关、暂停/继续、重播三个 44px 触控按钮；“档案”页提供独立总开关。
- 朗读状态会将 BGM 压低 10dB，结束、暂停或关闭时恢复。不支持系统语音的浏览器仍可正常阅读文字和游玩。

## 验证

在 `game` 目录运行 `npm run test:audio`，检查曲目数量、文件存在性、循环区间、事件映射和唯一ID。重新生成音乐后必须再运行 `npm run verify`。
