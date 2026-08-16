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
- 兼容旁白目录：`public/audio/douluo/narration/`
- 兼容旁白清单：`public/audio/douluo/narration/manifest.json`
- 本地设置键：`douluo.narration.settings.v1`
- 实现方式：固定剧情优先使用随游戏发布的 MP3 普通话旁白，不需要 API Key，兼容不提供 `Web Speech API`（网页系统语音接口）的微信/安卓 WebView；动态 AI 与自由输入内容在设备支持时使用本地 `zh-CN` 中文系统音色。
- 当前共有 96 段双男声有声小说旁白：1 段序章、6 段武魂开局、1 段时间线重启、88 段正式剧情选择。云希 `zh-CN-YunxiNeural` 负责日常剧情、探索、人物关系与普通转场；云健 `zh-CN-YunjianNeural` 负责序章、武魂觉醒、重大转折、终局抉择与结局。每次只按需加载当前一段，不会首屏下载整套语音。
- 所有固定旁白均为 44.1kHz 单声道 64kbps 纯人声，经过低频清理、轻动态压缩、极轻空间感和响度统一。旁白文件不内置任何 BGM，避免和游戏连续音乐重复、打架或无法独立调节。
- 首次点击“开始新的人生”后自动朗读序章；进入游戏后，仅在剧情页对新的主线旁白自动朗读。
- 剧情页提供开关、暂停/继续、重播三个 44px 触控按钮；“档案”页提供独立总开关。
- 旁白朗读时将游戏连续场景 BGM 柔和压低 9dB，而不是暂停；结束、暂停或关闭时恢复。世界序章使用庄严场景音乐，进入角色创建和正式剧情后由音乐控制器继续平滑切换。若手机阻止网页自动播放，下一次点击页面会直接重试当前录制旁白。
- 重新生成旁白前先在电脑安装 `edge-tts`：`pipx install edge-tts`。随后在项目目录运行 `npm run generate:narration`；若可执行文件不在系统路径，通过 `EDGE_TTS_BIN` 指定完整路径。最后运行 `npm run test:audio` 检查 96 个文件、双音色分工、ID 和清单。

## 验证

在 `game` 目录运行 `npm run test:audio`，检查曲目数量、文件存在性、循环区间、事件映射和唯一ID。重新生成音乐后必须再运行 `npm run verify`。
