# 动态音乐接入说明

## 资源与设置

- 音频目录：`public/audio/douluo/`
- 音乐清单：`public/audio/douluo/music_manifest.json`
- 控制器：`src/audio/DynamicMusicController.ts`
- React接入：`src/audio/useDynamicGameMusic.ts`
- 本地设置键：`douluo.audio.settings.v1`

音乐使用浏览器原生音频能力，不新增第三方依赖。首次点击、触摸或键盘操作后解锁；页面进入后台时暂停，返回前台时恢复。音乐开关位于“档案”页。

## 场景映射

- 诺丁城与学院：`bgm_notting_daily`
- 旧井与地下实验室：`bgm_blue_silver_mystery`
- 史莱克训练：`bgm_shrek_training`
- 星斗大森林：`bgm_star_dou_forest`
- 追踪与危险：`bgm_tension`
- 魂师战斗：`bgm_soul_battle`
- 人物关系与回忆：`bgm_academy_bond`
- 海神岛远景：`bgm_distant_sea`

短音效用于武魂觉醒、魂环吸收、魂力突破、强敌出现、战斗胜利和突然危险。普通场景遵循最短保持时间并交叉淡化；战斗和高强度事件可以立即切换。

## 验证

在 `game` 目录运行 `npm run test:audio`，检查曲目数量、文件存在性、循环区间、事件映射和唯一ID。重新生成音乐后必须再运行 `npm run verify`。
