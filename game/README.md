# 斗罗大陆人生模拟器（手机版原型）

这是根据原始 Markdown 设定和用户选定的第三套视觉方案制作的手机端可玩原型。

当前版本包含角色创建、五章长期剧情树、四个可收集结局、自定义行动、世界地图旅行、人物档案与对话、魂师战斗、行囊经济、完整时间线存档与指定节点回溯。诺丁城、史莱克学院和星斗大森林可以实际前往；四位角色拥有独立好感度、专属剧情和本地对话记录。不需要 AI API 也能从诺丁城连续玩到结局，后续接入 AI 后可扩展真正开放的剧情输入、长期记忆和持续世界演化。

## 本地启动

在 macOS 终端进入本目录：

```bash
cd "/Users/tanwenjie/Documents/ChatGPT/斗破/game"
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

正常启动后，电脑访问 `http://localhost:4173/`。手机和电脑连接同一 Wi-Fi 时，可使用终端显示的局域网地址访问。修改代码后页面会自动刷新。

## 验证

```bash
cd "/Users/tanwenjie/Documents/ChatGPT/斗破/game"
npm run build
npm run check:runtime
```

两条命令都应正常结束，且运行时完整性检查显示 `passed`。

## AI 配置

本机 AI 配置位置和安全要求见 `docs/AI_CONFIGURATION.md`。当前配置模板已准备好，但服务端 AI 适配器尚未接入，填写后不会立即生效。
