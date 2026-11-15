# 审阅与验证记录

更新：2026-11-15。分支：`docs/gameplay-flow`；工作目录：`gameplay-flow/`；基线：`feature-v1@5fd9d4b`。

## 本次审阅对象

- `proposal.md`：游戏旅程调研、证据、缺口判断与 P0/P1 范围。
- `design.md`：阶段推导、模块职责、阻塞、危机、转生失败恢复与旧档兼容。
- `specs/*/spec.md`：四项能力的新增需求及 WHEN/THEN 验收场景。
- `tasks.md`：与上述范围对应的待实施任务和验证方法。

## 规格与实现证据

4 个 capability、10 项 SHALL 需求、23 个 WHEN/THEN 场景。代码和自动测试已经实现；任务勾选与未完成的浏览器验收分别记录。严格校验与测试结果按各次 commit 记录在工作区 verification 中。

| 能力 | 代码 | 自动验证 |
| --- | --- | --- |
| progression-guidance | progression、app、bridge、shell | progression.test、map-journey.test、原有科技树/地图回归 |
| survival-recovery | progression.risk 与 app 危机卡 | progression.test 的倍率/暂停/首冬/零人口，local-speed.test |
| run-lifecycle | local-client 与 server 的备份、重置和提交标识 | run-lifecycle.test 的成功、取消、故障和挑战；storage.test 的实际磁盘重放 |
| session-reentry | progression 元数据/基线与 local-client 载入 | progression.test 的旧档/时钟/未知版本；lifecycle 的摘要持久化 |

完整阶段矩阵、操作说明和验证限制见 `docs/游戏进程闭环验证.md`。提交后按用户要求重新运行全量检查，实际结果记入工作区 `verification/gameplay-flow-post-commit.md`。GitHub Actions 已配置相同的测试和 OpenSpec 校验。

后续复核补齐离线结算时序与恢复失败保护，对应新增场景和真实引擎测试。该次提交后的全量结果单独记入工作区 `verification/gameplay-flow-followup.md`，不以旧提交的测试结果代替。

## 待完成验收

浏览器端到端验证尚未完成：浏览器访问 host 不可用，桌面浏览器访问请求超时。代码级挂载与真实引擎测试不替代可视验收。保留相关任务未勾选，change 不提前归档。

用户已批准方案并授权实施及提交 PR；功能验收尚未进行。验收对象为阶段引导、危机恢复、高级页往返、转生结算与新周目，以及窄屏布局和完整旅程。
