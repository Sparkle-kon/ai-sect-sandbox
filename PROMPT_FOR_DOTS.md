# 启动或接续天道沙盒开发

在获授权的云端工作区使用 `Sparkle-kon/ai-sect-sandbox`。完整阅读 [AGENTS.md](AGENTS.md) 和 [BACKLOG.md](BACKLOG.md)，核对 `origin/main` 和当前工作区，从顶部第一项未完成任务开始。若有上轮未验证检查点，确认它与当前 HEAD 相容后接着做。

逐项完成双引擎、相关 UI/Canvas、确定性测试和 `npm run verify`。通过才勾选、记录 CHANGELOG、独立 conventional commit 并推送 `origin main`；核对远端后立即做下一项。未完成项少于 20 时加 10 项。不要把发布一个里程碑当成停止条件。

如果本次运行达到系统限制，保留已发布 SHA、未完成检查点和下一步。需要实际的外部调度来跨运行接续；只写 Markdown 或只回复“会继续”都不会启动下一轮。已有触发器时不要再开并行写入。除非另有授权，不调用付费模型、不部署、不处理个人密钥。
