# Real Raise 发布检查清单

> 状态：Active
> 最后核验：2026-07-30
> 适用范围：不含 BYOK、Judge 的 Partner SSO + Replay 产品

## 文档与范围

- [ ] `PRODUCT_SPEC`、状态机、计算规则与当前实现一致
- [ ] Changelog 已记录本次实际变化
- [ ] 已知问题已分级，P0 清零
- [ ] 历史文档没有被当作实现依据

## 核心产品

- [ ] 到手收入模式可完成输入与计算
- [ ] 工资条模式可用真实工资条覆盖估算
- [ ] 预设案例均有明确命题并完成金额对账
- [ ] 修改输入后旧报告标记为过期
- [ ] 存在“按当前数据生成新报告”入口
- [ ] 新报告失败时可恢复上一份成功报告

## 认证与权限

- [ ] 本地登录回到本地 origin
- [ ] 生产登录回到稳定生产 URL
- [ ] 初始认证探测失败不向访客弹全局错误
- [ ] Partner session、Cookie、state 绑定通过测试
- [ ] 浏览器无法读取 Partner API Key
- [ ] 前后端均不存在用户可达的 Judge 或 BYOK 路径

## 模型、任务与产物

- [ ] 登录用户可以切换受支持模型
- [ ] 请求显式使用 Agent 执行模式
- [ ] 全新 Partner 用户真实任务成功
- [ ] 平台后台归因到正确应用与用户
- [ ] 超时、取消和重试状态与后台一致
- [ ] 产物状态区分 `verified`、`stream-fallback`、`deterministic-only`、`failed-retryable`
- [ ] 缺失平台文件时不展示“完整平台报告”

## 回放与数据

- [ ] 未登录访客可访问回放入口
- [ ] replay 只对精确匹配输入播放
- [ ] 每个 replay 通过完整性与语义审计
- [ ] 任务 ID、录制日期、Prompt/计算版本和兼容性可见
- [ ] `vendor-original-*` 不覆盖当前确定性凭证
- [ ] 城市、期间、覆盖层级和 `source_id` 可追溯

## 自动与人工回归

- [ ] `npm test`
- [ ] `npm run verify`
- [ ] `npm run worker:test`
- [ ] `npm run server:test`
- [ ] `npm run build`
- [ ] `npm run worker:check`
- [ ] 桌面端主流程人工通过
- [ ] 手机端主流程、下载和错误提示人工通过
- [ ] 浏览器控制台无新增错误

## 发布证据

- [ ] 发布分支、commit、构建产物和部署身份已记录
- [ ] 稳定生产 URL 未改变
- [ ] 部署后 `/health` 与页面版本一致
- [ ] 完成一个 Partner canary 任务
- [ ] 保存任务 ID、时间、模型和归因截图
- [ ] 回滚 commit、命令和触发条件已写入运行手册

只有所有 P0 项和对应发布阻塞项通过后，才允许合并或部署。
