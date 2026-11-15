## Purpose

使本轮结算、转生和新周目形成可理解且可恢复的闭环。

## ADDED Requirements

### Requirement: Preview and voluntary reset
系统 SHALL 在转生前展示由原版规则提供的预计收益、主要重置/保留项目和本轮摘要，并仅在玩家确认后执行转生。

#### Scenario: Preview and cancel
- **WHEN** 玩家打开转生预览后取消
- **THEN** 经济、挑战和周目状态保持原值，预览不得执行原版重置

#### Scenario: Read-only or conflicting save
- **WHEN** 当前存档只读、损坏或存在版本冲突
- **THEN** 禁止确认转生并展示解决路径

### Requirement: Persist reset exactly once per confirmation
系统 SHALL 在确认后先保存转生前备份，再执行一次原版重置并提交结果；仅在验证落盘成功后展示新周目，失败时提供恢复路径。

#### Scenario: Backup failure
- **WHEN** 转生前备份失败
- **THEN** 不执行重置，保留原进度并允许重试备份

#### Scenario: Result save failure
- **WHEN** 已执行重置但结果提交失败
- **THEN** 保持暂停并保留同一候选结果，核验磁盘状态后再重试或恢复
- **AND** 不再次执行重置，不以旧版本覆盖其他窗口的存档

#### Scenario: Successful commit with lost response
- **WHEN** 转生结果已经落盘但客户端未收到响应
- **THEN** 通过回读识别该结果并继续载入，不重复授予收益或重置

### Requirement: Next run continuation
系统 SHALL 在成功转生后展示一次本轮回顾并基于新存档提供下一周目目标，区分转生与删档。

#### Scenario: Next run loaded
- **WHEN** 新周目首次载入
- **THEN** 展示实际收益和本轮回顾，并按新进度推荐行动
- **AND** 摘要已读后刷新不重复弹出
