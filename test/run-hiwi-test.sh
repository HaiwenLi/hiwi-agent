#!/usr/bin/env bash
# test/run-hiwi-test.sh
#
# hiwi-agent 能力验证 — 入口脚本
#
# 用法:
#   1. 启动 hiwi-agent
#   2. 告诉它: "run test/run-hiwi-test.sh"
#   3. agent 会按照 agent-test-plan.md 逐步执行
#   4. 最后运行 verify.ts 输出结果
#

set -e

echo "============================================"
echo "  hiwi-agent 能力验证测试"
echo "============================================"
echo ""
echo "请阅读 test/agent-test-plan.md 了解完整执行计划"
echo ""
echo "执行顺序:"
echo "  Phase 0:  04-tool-tests       (基础工具)"
echo "  Phase 1:  05-debugging        (Bug 排查)"
echo "  Phase 2:  01-quicksort        (快速排序)"
echo "  Phase 3:  02-fibonacci        (斐波那契)"
echo "  Phase 4:  09-test-writing     (测试编写)"
echo "  Phase 5:  06-refactoring      (代码重构)"
echo "  Phase 6:  10-multi-file       (多文件协调)"
echo "  Phase 7:  08-data-processing  (数据处理)"
echo "  Phase 8:  07-web-research     (Web Research)"
echo "  Phase 9:  03-responsive-page  (响应式页面)"
echo "  Phase 10: 11-bash-advanced    (Bash 脚本)"
echo "  Phase 11: 12-stress           (大文件处理)"
echo ""
echo "============================================"
echo "  开始执行 Phase 0..."
echo "============================================"
