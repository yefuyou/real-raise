# ADR-0004：生产 URL 稳定，SSO 回到发起 Origin

> 状态：已接受
> 决策日期：2026-07-29

## 决定

- 比赛与公开体验 URL 保持：
  `https://plain-wind-ae46.yefuyou2333.workers.dev/`
- 静态资源与 API 继续由同一 Cloudflare Worker 发布。
- SSO flow 记录发起登录的允许 Origin。
- 本地发起登录时回到本地 Origin；生产发起时回到生产 Origin。
- 禁止为修复本地回调而改变比赛 URL。

## 原因

该 URL 已用于比赛提交和宣传；改变会破坏已有入口。固定跳回生产又会使本地联调失去意义。

## 验收

- 本地登录成功后仍停留本地页面并显示身份。
- 生产登录成功后回生产页面。
- 任意非白名单 return Origin 被拒绝。
