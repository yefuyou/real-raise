# InfiniSynapse 模型选择 API 调研

日期：2026-07-26

## 结论

当前平台不是把模型字段直接塞进 `newTask`，而是先通过任务设置接口保存
`apiConfiguration`，再用同一个 `taskId` 创建任务：

```text
GET  /api/ai/events?connId=<uuid>
POST /api/ai/settings
POST /api/ai/message  (type=newTask)
```

模型值使用模型的 `name`，不是界面别名，也不是数据库 `_id`。例如界面里的
“TaoToken/高智力Data模型”实际应传 `gpt-5.5`。

## 当前前端使用的设置契约

平台任务页当前版本会向下面的接口提交设置：

```http
POST https://app.infinisynapse.cn/api/ai/settings
Authorization: Bearer <访问者自己的 API Key>
Content-Type: application/json
```

```json
{
  "taskId": "<与 newTask 相同的 UUID>",
  "apiConfiguration": {
    "apiProvider": "infinisynapse",
    "infinisynapseModelId": "deepseek-v4-flash"
  }
}
```

随后创建任务：

```json
{
  "type": "newTask",
  "taskId": "<同一个 UUID>",
  "connId": "<SSE 使用的 UUID>",
  "chatSettings": { "mode": "act" },
  "text": "<prompt>"
}
```

`taskId` 必须预先生成，并在设置请求与 `newTask` 中复用。任务页前端同时支持不传
`taskId` 的全局设置；Real Raise 不应修改访问者的账号全局默认值，应始终传当前
任务的 `taskId`。

> 这部分是根据平台当前一方前端及只读配置接口核对出的现行契约。官方公开 CLI
> 文档目前只写了 SSE + `newTask` 流程，尚未公开说明模型设置字段，因此接入时应
> 保留适配层和降级逻辑。

## 当前账号可用模型（动态列表，2026-07-26）

模型列表来自：

```http
GET https://api.infinisynapse.cn/api/model/getModelList
```

| 界面显示 | 请求使用的模型名 | 上下文 | 输入价/百万 tokens | 输出价/百万 tokens |
| --- | --- | ---: | ---: | ---: |
| deepseek-v3.2 (cheap) | `deepseek-v3.2` | 128K | ¥2 | ¥3 |
| deepseek-v4-flash | `deepseek-v4-flash` | 1M | ¥1 | ¥2 |
| deepseek-v4-pro | `deepseek-v4-pro` | 1M | ¥3 | ¥6 |
| TaoToken/高智力Data模型 | `gpt-5.5` | 512K | ¥17.5 | ¥14 |
| TaoToken/高智力Coding模型 | `claude-opus-4-7` | 1M | ¥18 | ¥90 |
| TaoToken/glm-5.1 | `glm-5.1` | 32K/198K 分档 | ¥3/¥4 | ¥12/¥14 |

模型列表和价格会变化，线上 UI 不应长期硬编码这张表。当前平台有效默认模型为
`deepseek-v4-pro`。

## Real Raise 建议

- 默认推荐 `deepseek-v4-flash`：当前价格最低，足以承担“读取确定性结果并生成简短解释”的任务。
- 展示录制或对解释质量要求更高时使用 `deepseek-v4-pro`。
- 保留“跟随平台默认”选项：不调用 `/api/ai/settings`，继续沿用用户账号配置。
- 模型选择必须进入本地缓存键和回放请求快照，否则同一输入切换模型后会错误命中旧缓存。
- 获取模型列表失败时不要阻断任务，回退“跟随平台默认”。

## 官方公开资料

- [InfiniSynapse CLI API Reference](https://infinisynapse.cn/zh/docs/InfiniSynapse%20CLI%20API%20Reference)
- [InfiniSynapse Vibe Coding Guide](https://infinisynapse.cn/zh/docs/InfiniSynapse%20Vibe%20Coding%20Guide)
