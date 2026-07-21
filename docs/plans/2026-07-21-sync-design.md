# 设计文档：云同步（本地 + JSON 导入导出）

- 日期：2026-07-21
- 状态：已确认（brainstorming 通过）
- 关联：wordhoard 改造项目（离线优先）

## 目标

让用户换设备 / 重装不丢学习进度，零后端、隐私最好。第一版只做本地文件的导出 / 导入，不上传任何服务器。

## 导出格式

- 序列化内容：全部 `Word`（含 SM-2 状态 `ef/interval/repetitions/due/correct/wrong`）、stats（streak / 正确率累计）、settings（如默认语言）。
- 结构：
  ```json
  {
    "schemaVersion": 1,
    "exportedAt": "2026-07-21T08:00:00.000Z",
    "words": [ ... ],
    "stats": { ... },
    "settings": { ... }
  }
  ```
- 平台差异：web 用浏览器触发 `.json` 下载；native（iOS/Android）用 `expo-file-system` 写入文档目录并可选分享。

## 导入与合并

- 解析 JSON，按 `word`（唯一键）`upsert` 进 DB。
- 合并策略：取「进度更靠后 / `due` 更近 / `times_reviewed` 更大」的一条；可简单采用"导入覆盖本地"或"字段级取较新"，本版用**字段级取较新**（以 `due` 与 `times_reviewed` 为准）。
- `schemaVersion` 不符：提示用户版本不兼容，拒绝导入而非静默失败。

## UI

- 新增「设置」入口：在统计页底部加「导出进度 / 导入进度」按钮；或单独「设置」Tab（本版并入统计页更省事）。
- 导入时文件选择：web 用 `<input type=file>`；native 用 `expo-document-picker`。

## 错误处理

- 文件损坏 / 非 JSON：捕获异常，提示"文件无法解析"。
- 缺字段：容错，缺失字段用本地默认值。
- 大文件：导入前校验 words 为数组。

## 测试

- 往返单测：`exportState() → importState(json) →` 状态与导出前一致（字典型比较）。
- 容错单测：缺字段 / 错 schemaVersion 时抛出明确错误。

## 验收标准

- 在预览里点「导出进度」能下载一个 JSON。
- 清空/换库后「导入进度」能恢复 streak、正确率与每个词的 SM-2 状态。
- 全程无网络请求。
