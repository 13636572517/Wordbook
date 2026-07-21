# 设计文档：内置离线 IPA 音标

- 日期：2026-07-21
- 状态：已确认（brainstorming 通过）
- 关联：wordhoard 改造项目（Expo 跨端，离线优先）

## 目标

在每张闪卡背面中文释义下方显示单词的 IPA 音标，完全离线可用，与现有离线定位一致。不引入运行时网络依赖。

## 数据获取（构建期一次性）

- 写脚本 `scripts/build-ipa.mjs`：扫描 `lib/seedWords.ts` 的 6008 个词，从免费词典源（Wiktionary / dictionaryapi.dev）拉取 IPA，输出 `lib/ipaData.ts`（`export const ipaData: Record<string, string> = { ... }`）。
- 运行时零网络；音标随包内置。
- ⚠️ 风险：当前沙箱仅放通 GitHub API 等少数域名，需先验证能否访问词典源。若不可达，退路是打包一份现成英文 IPA 数据集（如 `ipa-dict` 子集）按词匹配，作为预生成文件提交。

## 数据模型

- `Word` 增加可选字段 `ipa?: string`。
- `seedWords` 每条增加 `ipa`；播种时一并写入 `en` 词库。
- 已有词通过轻量迁移（`migrateIfNeeded`）补全 ipa：从 `ipaData` 按 `word` 字段查，命中则写入。

## UI / 数据流

- `FlashCard` 翻面后，在中文释义上方显示 `/ɪˈpæm/` 样式音标（等宽字体、灰色）。
- `app/(tabs)/library.tsx` 词条列表也可显示音标（次要）。
- 缺失 ipa 时只显示 TTS 喇叭按钮，不报错。

## 错误处理

- 词典源缺词 / 网络失败：该词 ipa 留空，构建不中断，最后报告覆盖率。
- 运行时：ipa 为空则组件不渲染音标块。

## 测试

- 单测：`ipaData` 对种子词覆盖率 ≥ 95%（阈值可配）。
- 组件单测（如需）：有 ipa 时渲染音标、无 ipa 时优雅降级。

## 验收标准

- 预览中翻卡可见英文对应 IPA；离线（断网）仍显示音标。
- 统计：无新增运行时网络请求。
