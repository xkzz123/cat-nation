## Purpose

使玩家载入、离线返回、导入与恢复后能够理解当前状态并继续经营。

## ADDED Requirements

### Requirement: Reentry summary after loading
系统 SHALL 在成功加载并完成原版离线处理后展示载入来源、当前阶段和可获得的会话变化；没有基线时仅展示当前状态。

#### Scenario: Returning player
- **WHEN** 玩家离开后重新载入有会话基线的存档
- **THEN** 展示与上次保存相比的关键变化和当前建议
- **AND** 不重复结算离线进度，不以页面速度倍率放大离线收益

#### Scenario: Offline processing is still pending
- **WHEN** 已载入旧档但原版首次离线处理尚未执行
- **THEN** 等待原版自然结算完成后再生成摘要并开放保存，不提前覆盖离线时间基线

#### Scenario: Invalid clock or missing baseline
- **WHEN** 会话基线缺失或本机时间早于记录时间
- **THEN** 不展示虚构变化或负离线时长，仍可查看当前目标

### Requirement: Derive guidance from restored state
系统 SHALL 兼容缺少流程字段的旧档，并在导入、恢复或加载后重算目标；未知版本的展示元数据不得阻止加载有效经济存档。

#### Scenario: Restore an earlier backup
- **WHEN** 玩家恢复早于当前阶段的有效备份
- **THEN** 目标按备份中的真实游戏状态重算，不保留当前内存中更晚阶段的完成状态

#### Scenario: Legacy save
- **WHEN** 存档没有 progression 字段或其展示元数据版本不受支持
- **THEN** 经济进度正常加载，并从实际状态生成可用目标
