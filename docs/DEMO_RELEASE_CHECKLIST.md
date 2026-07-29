# Real-Raise 比赛演示与发布检查清单 (Demo & Release Checklist)

## 1. 代码与架构冻结项 (Code & Architecture Safeguards)

- [x] **零硬编码密钥**：代码库与打包结果中不含任何硬编码 API Key、密匙或私密 Token。
- [x] **评委调用门**：真实分析必须先用评委口令换取短时签名会话，CORS 不作为身份认证。
- [x] **公式稳定性**：`src/domain/livingCost.ts` 中的确定性算表逻辑未被篡改，核心购买力与结余计算完全确定。
- [x] **数据来源三分法**：界面与数据模型严格标记 `verified`（已核验官方原值）、`derived`（派生估算值）、`user-input`（用户实际输入）。

---

## 2. 自动化测试与构建检查 (Testing & Verification Checklist)

- [x] **Worker 安全测试**：运行 `npm run worker:test`，覆盖输入重算、未知字段拒绝、并发/每日上限、评委会话签名/过期/篡改与鉴权 CORS。
- [x] **TypeScript 静态检查**：运行 `npm run verify`，App 与 Node 配置文件无任何类型错误 (exit code 0)。
- [x] **生产打包编译**：运行 `npm run build`，Vite 编译顺利输出 `dist/` 产物。

---

## 3. 比赛演示交互步骤 (Competition Demo Script)

1. **基础场景展示**：
   - 打开页面 (`http://localhost:5173`)，保留默认的到手收入与固定支出输入（如：到手收入 8000 -> 8400，固定支出 1800 -> 2200）。
   - 展示右侧“到手收入增加”、月结余变化与“收入 → 固定支出 → 日常支出 → 结余”的确定性瀑布图。
2. **宏观背景比对**：
   - 切换历史年份 Tab（2021–2025 年），演示国家统计局可追溯的收入、消费支出与 CPI 大盘数据。
   - 强调 2025 年农村中位数显式标记为 `未单独公布 (null)`，体现数据严肃性。
3. **评委真实解读体验**：
   - 页面默认展开 AI 解读，输入单独提供的评委口令，确认出现“已解锁”。
   - 点击“评委生成真实 AI 解读”，展示 `queued` → `running` → `completed` 进度与三份证据产物。
   - 对照 `analysis-manifest.json` 的任务 ID 与 InfiniSynapse `/tasks` 后台记录。
   - 录屏前预跑一次；如果额度或网络异常，明确展示真实存档回放，不能把回放说成实时。
