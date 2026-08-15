# AI 接口配置

## 当前状态

项目已经准备好本地配置位置，但 AI 服务端适配器尚未开发，因此填写配置后当前版本还不会调用模型。

## 本机填写位置

在 macOS 上打开项目根目录的 `.env.local`：

```text
/Users/tanwenjie/Documents/ChatGPT/斗破/game/.env.local
```

需要填写四项：

- `AI_BASE_URL`：OpenAI 兼容接口地址，必须以 `/v1` 结尾
- `AI_MODEL_ID`：服务返回的模型 ID
- `AI_API_KEY`：授权令牌，只保存在本机
- `AI_REQUEST_TIMEOUT_MS`：请求超时时间，默认 90000 毫秒

不要把密钥变量改成 `VITE_` 开头；Vite 会把 `VITE_` 变量暴露给浏览器。

## 公网部署

上线后不上传 `.env.local`。应在部署平台的“环境变量”或“Secrets（密钥）”页面创建同名配置项，然后重新部署服务。配置完成后由服务端调用 `/v1/models` 和 `/v1/chat/completions` 进行验收。

## 安全要求

- 真实令牌不得提交到 Git
- 不在前端代码、截图、日志和公开文档中出现令牌
- 公网接口应使用 HTTPS，避免令牌在传输中以明文暴露
- 令牌泄露或出现在聊天记录后，正式上线前应重新生成

