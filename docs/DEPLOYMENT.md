# 部署与公开体验计划

## 比赛交付目标

提供一个评委可以直接打开的公网 URL。当前比赛规则接受公网 URL 或可下载安装包；本项目优先采用 Web 应用公网 URL。

## 推荐部署形态

```text
浏览器
  ↓
静态前端（Vercel / Netlify / Cloudflare Pages）
  ↓
本项目后端 API（Serverless / Worker；SSE 不稳定时改用 Render/Railway Node 服务）
  ↓
InfiniSynapse Server API
```

不需要购买自有域名。部署平台提供的临时子域名即可用于第一版提交。

## 环境变量

只在服务端配置：

```text
INFINISYNAPSE_API_KEY=
INFINISYNAPSE_BASE_URL=https://app.infinisynapse.cn
REAL_RAISE_REMOTE_ENABLED=false
```

禁止把 API Key 写入 `VITE_*` 变量、前端代码、URL、日志或 Git 仓库。

## 上线前检查

- `npm run verify` 通过。
- `npm run build` 通过。
- 默认打开页面不发起 InfiniSynapse 请求。
- Mock/预设案例可以无账号体验。
- 真实分析通过本项目后端发起，不由浏览器直连供应商。
- 缺少 Key、额度耗尽、任务失败和 SSE 中断时有可读的降级提示。
- 公网 URL 可以完成一次真实任务，并能在 InfiniSynapse 后台核验调用记录。
