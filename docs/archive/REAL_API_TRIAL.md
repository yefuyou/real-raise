# 真实 InfiniSynapse API 试跑（历史实验记录）

## 已完成

- `server/realRaiseServer.mjs`：本项目后端适配器。
- `POST /api/real-raise/analysis`：创建本项目任务。
- `GET /api/real-raise/analysis/:taskId/events`：向浏览器提供本项目 SSE。
- `GET /api/real-raise/analysis/:taskId`：查询任务快照。
- `POST /api/real-raise/analysis/:taskId/cancel`：取消供应商任务。
- 供应商链路：先连接 InfiniSynapse SSE，再发送 `newTask`，完成后读取 workspace 产物。
- `scripts/test-real-raise-server.mjs`：本地模拟供应商集成测试，不消耗真实积分。
- `vite.config.ts`：开发环境把 `/api` 转发到本地后端 8787 端口。

## 今天的真实试跑

只需要在项目根目录创建 `.env.local`，写入：

```text
INFINISYNAPSE_API_KEY=你的服务端APIKey
INFINISYNAPSE_BASE_URL=https://app.infinisynapse.cn
REAL_RAISE_PORT=8787
```

不要把 Key 发到聊天、不要写进 `VITE_*`、不要提交 `.env.local`。

然后开两个终端：

```text
终端 1：npm run server
终端 2：npm run dev
```

打开 Vite 地址，在 AI 生活解读卡中开启真实解读，点击一次生成。前端会通过 Vite 代理访问本地后端；浏览器不会直接接触 InfiniSynapse Key。

## 试跑范围

第一次只跑一个预设案例，确认：

1. 后端返回自己的 taskId；
2. 页面收到 queued/running 进度；
3. InfiniSynapse 任务后台可查到调用；
4. 任务完成后能读取 explanation.md、evidence.csv 和 analysis-manifest.json；
5. 页面显示 completed 和来源。

真实试跑前可先运行：

```text
npm run server:test
npm run verify
```

两者都不需要 API Key，也不消耗平台额度。
