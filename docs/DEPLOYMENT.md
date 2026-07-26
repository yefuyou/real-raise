# 部署与公开体验计划

## 比赛交付目标

提供一个评委在中国大陆用手机或电脑直接打开就能体验的公网 URL，不购买服务器或域名。

## 主推形态：纯静态 + 三态模式（BYOK / 回放 / 演示）

```text
访问者浏览器（中国大陆）
  ├─ 页面与静态资源 ← EdgeOne Pages 免费托管（*.edgeone.app，免备案）
  ├─ 全部金额计算   ← 本地确定性公式，零网络依赖
  └─ AI 解读（三态，UI 显式标注）
       ├─ live：访客填自己的 Key，浏览器直连 app.infinisynapse.cn，额度算访客自己的
       ├─ replay：无 Key、输入命中预录存档 → 播放真实任务回放（任务 ID 可在平台后台核验）
       └─ mock：无 Key 且无匹配存档 → 本地演示状态机
```

本项目**不部署任何服务端**，因此也不保管任何密钥：

- 访客 Key 只写入其本人浏览器 `localStorage`，界面上随时可清除；
- 平台 API 已实测开放 CORS（允许 `Authorization`、`x-lang` 头），浏览器可直连；
- 同输入结果在浏览器内缓存（LRU 100）+ 进行中去重，重复点击不重复扣访客额度；
- 构建产物无密钥（上线前 `grep dist/assets/*.js` 复核）。

`server/realRaiseServer.mjs` 与 `render.yaml` 保留，用于本地开发与 cpolar 备用链路（见下），不是比赛主链路。

## 平台选择依据（2026-07 调研并交叉核验）

| 方案 | 大陆可达性 | 结论 |
| --- | --- | --- |
| 腾讯 EdgeOne Pages（现名 EdgeOne Makers） | 默认域名免备案，多数地区可直连（境外节点，约 100–250ms） | **首选**；官方承诺免费版长期保留 |
| Vercel / Cloudflare Pages 默认域名 | `*.vercel.app`、`*.pages.dev` 长期被墙 | 排除 |
| GitHub Pages | 时好时坏 | 不可做唯一链接 |
| Gitee Pages | 2024-05 下线未恢复 | 排除 |
| Zeabur / ClawCloud 免费层 | 2026-05 先后关停 | 排除 |
| Render 免费 Web Service | `*.onrender.com` 2024 年起被墙 + 15 分钟休眠 | 仅作海外访客备份 |

EdgeOne 免费额度（官方 Limits and Quotas，2026-07）：构建 500 次/月、存储 5GB、静态流量无硬性配额——演示绰绰有余。已知风险：个别省份家宽对境外 IP 有 SNI 白名单阻断（有福建/江苏/河南报告），**赛前必须用手机流量 + 现场 WiFi 实测一次**。

## 部署步骤

```bash
npm run verify && npm run test && npm run replays:manifest && npm run build
```

然后二选一：

1. **控制台直传**：`dist` 目录内容拖进 EdgeOne Pages 控制台（`index.html` 必须在上传根目录，别把 dist 再套一层，否则 404）。
2. **CLI**：`edgeone pages deploy ./dist`（新命名空间 `edgeone makers deploy`）。国内网络下比 GitHub 集成稳。

默认 `*.edgeone.app` 域名不需要 ICP 备案；只有绑自定义域名且加速区域含中国大陆时备案才是硬性要求。

## 回放包制作（赛前一次性）

当前进度：三个到手收入预设案例 + 一个工资条案例已接入，并通过签名、产物与静态路径校验。
现有工资条回放记录的是修复前手工输入的当前期个税 80 元；修复后可合法输入 84 元，
但 84 元属于另一组请求签名，如决定把它作为最终演示数据需重新录制并替换该回放。

1. 本地 `npm run dev`，填演示账号 Key，跑通预设案例（3 个）+ 工资条示例（1 个），同步录屏；
2. 每次完成后点结果区的「导出回放包（dev）」，把 JSON 重命名为场景名放进 `public/replays/`；
3. `npm run replays:manifest` 生成索引，重新 build + 部署；
4. 把 4 个任务 ID 汇总进提交材料，评委可在平台后台核验。

## 备用链路

现场网络异常时：本机 `npm run server`（`.env.local` 配 Key）+ `npm run preview`（Vite preview 沿用 `/api` 代理）+ cpolar 免费隧道（境内节点、不限流量）。免费公网地址 24 小时内会变化，**演示当天早上现取 URL**。

## 上线前检查

- `npm run verify` / `npm run test` / `npm run build` 全绿。
- 无 Key 首次打开：预设案例走回放态，进度流 + 解读 + 三产物下载完整，"存档回放"标注清晰。
- 填 Key：真实任务成功；同输入第二次秒回（缓存），平台后台只产生一条任务记录。
- 填错 Key：提示"Key 无效或未授权"，可就地更换 Key 重试；断网/429 给人话提示。
- 清除 Key 后回到无 Key 态；`localStorage` 里除 Key 与缓存外无敏感数据。
- 工资条模式在三态下均正常（payslipSummary 进 prompt 与回放请求快照）。
- 构建产物无密钥；`*.edgeone.app` 用手机流量与现场 WiFi 各实测一次。
