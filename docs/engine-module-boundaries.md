# 存档与认知引擎：从哪里改

业务调用方继续从 `src/engine/storageEngine.ts` 与 `src/engine/llmBrain.ts` 导入。两者是稳定入口；内部模块不反向导入入口。

## 存档读取

1. `storage/worldCodec.ts` 处理读入、写出和版本外壳，不改变原有存档字段或输出顺序。
2. `storage/worldSchema.ts` 按既有顺序组合各领域字段规则。新增或调整可持久化的字段时，优先找到对应的 `worldRules*.ts`，而不是扩写入口。
3. `storage/worldVerifier.ts` 按顺序调用领域语义核验。例如，一个引用必须先通过结构检查，之后才能核对它是否属于实际人物、地点或历史事件。调整顺序前要核对首条错误及路径是否改变。
4. `storage/saveSlots.ts` 管理存档槽与读写后端。它使用同一编解码和错误类型，不另设规则。

## 修士决策

- `cognition/heuristicDecision.ts` 及续段保留 Utility 的候选顺序。不要把后段候选提前求值，否则会改变分支选择和随机调用顺序。
- `cognition/nativeDecisionGate.ts` 先处理只允许原生选项的私有或特殊场景。「已接管但没有可用答复」不是「继续生成通用提示」。通用路径分开收集事实、生成提示和校验回复。
- `cognition/requestDecisionPrompt.ts` 管理模型请求、取消、预算和返回来源。场景模块不应自行重发请求，或绕过原有权限复核。

## 回归核对

`npm run verify` 覆盖类型、确定性测试和生产构建。拆分回归额外对照重构前的代表性原生存档与模型请求，比较实际字节、允许的选择、真实结算和首个校验错误；不依赖在线模型服务。
