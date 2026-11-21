# 启动或接续天道沙盒开发

在获授权的云端工作区使用 `Sparkle-kon/ai-sect-sandbox`。完整阅读 [AGENTS.md](AGENTS.md) 和 [BACKLOG.md](BACKLOG.md)，核对 `origin/main` 和当前工作区，从顶部第一项未完成任务开始。若有上轮未验证检查点，确认它与当前 HEAD 相容后接着做。

逐项完成双引擎、相关 UI/Canvas、确定性测试和 `npm run verify`。通过才勾选、记录 CHANGELOG、独立 conventional commit 并推送 `origin main`；核对远端后立即做下一项。未完成项少于 20 时加 10 项。不要把发布一个里程碑当成停止条件。

用同一次运行完成一项就继续下一项，不用定时唤醒代替。如果遇到系统硬上限，保留已发布 SHA、未完成检查点和下一步；真正重启时再恢复。除非另有授权，不调用付费模型、不部署、不处理个人密钥。
