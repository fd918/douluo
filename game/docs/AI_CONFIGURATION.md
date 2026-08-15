# AI 接口配置

## 当前状态

服务端 AI 适配器已经接入。自由行动和人物自由对话会调用项目自己的 `/api/ai/generate`，由服务端再访问 AI 供应商；浏览器不会读取或收到真实密钥。主服务失败时自动尝试备用服务，两者都失败时自动使用本地剧情。

## 本机填写位置

在 macOS 上打开项目根目录的 `.env.local`：

```text
/Users/tanwenjie/Documents/ChatGPT/斗破/game/.env.local
```

主服务配置集中维护在以下四项：

- `AI_BASE_URL`：OpenAI 兼容接口地址，必须以 `/v1` 结尾
- `AI_MODEL_ID`：服务返回的模型 ID
- `AI_API_KEY`：授权令牌，只保存在本机
- `AI_REQUEST_TIMEOUT_MS`：请求超时时间，默认 90000 毫秒

不要把密钥变量改成 `VITE_` 开头；Vite 会把 `VITE_` 变量暴露给浏览器。

可选备用服务使用 `AI_FALLBACK_BASE_URL`、`AI_FALLBACK_MODEL_ID`、`AI_FALLBACK_API_KEY`、`AI_FALLBACK_REQUEST_TIMEOUT_MS`。不填写时维持单服务模式。

## 更换 AI 服务商

只支持提供 OpenAI 兼容 `/v1/chat/completions` 接口、使用 `Authorization: Bearer ...` 鉴权的服务商。更换时不需要改游戏剧情代码。

在本机打开 `.env.local`，整体替换以下三项：

```env
AI_BASE_URL=https://新服务商的接口地址/v1
AI_MODEL_ID=新服务商提供的模型ID
AI_API_KEY=新服务商生成的密钥
```

`AI_REQUEST_TIMEOUT_MS=90000` 一般不用修改。保存后必须停止并重新启动 `npm run dev -- --host 0.0.0.0 --port 4173 --strictPort`，因为服务端环境变量只在启动时读取。

如果需要自动容灾，把第二个兼容服务整体填写到备用配置：

```env
AI_FALLBACK_BASE_URL=https://备用服务商地址/v1
AI_FALLBACK_MODEL_ID=备用模型ID
AI_FALLBACK_API_KEY=备用服务完整密钥
AI_FALLBACK_REQUEST_TIMEOUT_MS=30000
```

验证地址：

```text
http://localhost:4173/api/ai/status
```

正常结果会显示 `configured: true`、当前模型和供应商域名，但绝不会返回密钥。随后在游戏中打开“关系”，选择角色发送一条自由消息；角色给出动态回应即表示更换成功。

如果新服务商不是 OpenAI 兼容协议，不能只改这三项，需要在 `worker/ai-core.js` 中增加该服务商的协议转换逻辑。

## 使用本机 ChatGPT/Codex 订阅桥

本机已经验证可以使用 `codex-local-api` 作为开发环境供应商。先启动本机桥，再在本项目的 `.env.local` 中整体替换以下四项：

```env
AI_BASE_URL=http://127.0.0.1:8317/v1
AI_MODEL_ID=codex-fast
AI_API_KEY=复制codex-local-api目录下local-api-key.txt的完整一行
AI_REQUEST_TIMEOUT_MS=120000
```

保存后必须重启游戏开发服务。打开 `http://localhost:4173/api/ai/status`，确认返回的模型为 `codex-fast`、供应商为 `127.0.0.1:8317`，再测试自由行动和人物对话。

`codex-fast` 实际使用 GPT-5.6-Luna，是当前游戏短对话的推荐模型。2026-08-15 的本机验证中，自由行动、人物对话和滚动摘要均能返回游戏需要的 JSON；单请求通常约 11 到 18 秒，5 个角色请求并发时总耗时约 17 秒。也观察到约 116 秒的上游慢响应，因此本机桥场景建议把超时设为允许的上限 `120000` 毫秒，并继续保留现有本地剧情兜底。

该地址只能供同一台 Mac 上的开发版本调用。公网部署的 Worker 无法访问 `127.0.0.1`，上线时仍需要公网可访问的正式 AI 服务。`local-api-key.txt` 的真实内容不得提交到 Git、文档或截图。

本机开发时可把订阅桥设为主服务、Agnes设为备用；公网部署时不能使用 `127.0.0.1`，应把公网可访问的服务放在主配置中。

## Token 优化规则

- 每 12 个游戏轮次压缩一次滚动剧情摘要
- 摘要保留人物关系、关键线索、未解决任务、重要选择和不可逆结果
- 每名角色只保留最近 10 轮完整对话，即 20 条消息
- 自由行动携带阶段摘要、当前场景、关键线索和最近共同记忆
- 人物对话携带阶段摘要、最近 10 轮对话和最近共同记忆
- 普通请求优先发送 `enable_thinking: false`；不支持该字段的供应商会自动使用兼容请求重试
- 自由行动最多 480 输出 Token，人物对话最多 360，阶段摘要最多 520

这些限制集中在 `worker/ai-core.js`，更换兼容供应商时通常不需要调整。如果新模型在关闭深度思考后仍频繁返回空正文，再单独提高对应类型的输出额度，不要统一放大所有请求。

## 调用额度保护

- `AI_REQUESTS_PER_MINUTE`：单个访问来源每分钟最多请求数，默认 12。
- `AI_DAILY_REQUEST_LIMIT`：单个访问来源每天最多请求数，默认 120。
- 超过限制时接口返回 429，前端会自动使用本地剧情继续游玩。

当前限制保存在 Worker 运行实例内，适合首发和小规模试玩。访问量明显增加后，应改用部署平台持久化限流或数据库计数，不能把当前实现当作精确计费账本。

## 公网部署

上线后不上传 `.env.local`。应在部署平台的“环境变量”或“Secrets（密钥）”页面创建主服务四项、两项调用限制；如需备用服务，再创建四项 `AI_FALLBACK_` 配置。密钥项必须标记为 Secret（加密密钥）。

更换公网版本的服务商时，也只在部署平台修改前三项并重新部署，不修改或重新打包前端代码。GitHub Pages 只能托管静态文件，无法安全保存密钥或运行本项目的服务端接口；公网版本需要使用支持服务端函数或 Worker 和加密环境变量的平台。

## 安全要求

- 真实令牌不得提交到 Git
- 不在前端代码、截图、日志和公开文档中出现令牌
- 公网接口应使用 HTTPS，避免令牌在传输中以明文暴露
- 令牌泄露或出现在聊天记录后，正式上线前应重新生成
