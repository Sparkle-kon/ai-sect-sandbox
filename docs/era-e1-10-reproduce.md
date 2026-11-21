# 如何复跑百年验收

这套命令给开发者复查用。手机玩家不必执行，也不用手工准备世界数据。运行前先确认终端使用的是要验证的代码版本；脚本会打印实际的离线规则指纹。依赖沿用仓库已有安装。

从仓库目录在 Linux 等支持下述文件语义的终端运行：

```bash
set -eu
run_dir=$(mktemp -d "${TMPDIR:-/tmp}/ai-sect-century.XXXXXX")
./node_modules/.bin/vite-node scripts/centuryAcceptance.ts start "$run_dir" 1200 120 > "$run_dir/start.ndjson" 2> "$run_dir/start.stderr"
# 上一个进程在第 120 月完成落档并退出。这是一次新的 Node 进程。
./node_modules/.bin/vite-node scripts/centuryAcceptance.ts resume "$run_dir" 1200 120 > "$run_dir/resume.ndjson" 2> "$run_dir/resume.stderr"
./node_modules/.bin/vite-node scripts/centuryInspect.ts "$run_dir" 1200 > "$run_dir/inspect.ndjson" 2> "$run_dir/inspect.stderr"
printf '%s\n' "$run_dir"
```

- **想先试命令？** 每次使用新的临时目录，将三处 `1200` 改为 `122`，保留第 120 月暂停。日常自动测试只推进三个月。这些都不是百年验收。
- **怎样算完成？** 正式百年跑到 T1201（仙历 1101 年正月），并且检查日志最后出现 `accepted`。这之前不要把部分进度当作结果。日志记录实测耗时、四类人口、原生档字节与摘要。
- **怎样确认真是续跑？** 第二个进程从本地落档读取真实世界，并核对规则、年月与源线；不会拿种子重算、跳过月份或使用外部模型。第三个进程才用原生规则建立旁观与入世两线，分别读取导出文件再推一月。
- **环境是什么？** Node 进程内运行正式 Worker 控制器，存档写在本地文件系统，不是浏览器 IndexedDB 或手机性能测试。不读写任何浏览器存档槽，也不需要网络。

文件后端独占创建锁文件，核对推演 ID、修订、代次和原摘要，把候选写入同目录临时文件、同步写盘，再原子替换正式文件并同步目录。请使用支持独占创建、同目录原子重命名和 fsync 的本地 POSIX 文件系统，**不**使用网盘或共享网络目录。这里验证的是正常停在已写完的检查点后重新启动，不等于已验证任意崩溃或断电。若异常退出后留下锁，工具会拒绝续跑；不要删掉可能由另一个进程持有的锁。
