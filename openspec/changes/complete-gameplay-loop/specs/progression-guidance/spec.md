## Purpose

使玩家能够从开局持续推进到高级系统，并理解每个目标的操作与阻塞。

## ADDED Requirements

### Requirement: State-derived actionable objectives
系统 SHALL 从原版真实状态推导阶段和行动目标，覆盖食物、住房、人口分工、科研及工业配套，并允许玩家关闭和重新打开引导。

#### Scenario: New game opening
- **WHEN** 玩家进入无建筑的新档
- **THEN** 展示采集与建田的可执行入口
- **AND** 建田成功后按实际状态推进目标，不重复要求已完成动作

#### Scenario: Research requires production follow-through
- **WHEN** 科技已研究但其目标要求的设施或岗位尚未具备
- **THEN** 后续目标展示建设或分工入口，不将研究完成视为整个阶段完成

#### Scenario: Existing and challenge saves
- **WHEN** 玩家载入已有进展或进行中的挑战存档
- **THEN** 根据该存档的真实状态及挑战限制选择目标，不要求重走已完成开局

### Requirement: Explain actionable blockers
系统 SHALL 区分前置、资源容量、地块槽位、资源库存、合成与岗位阻塞，并提供有效入口；无法解释的条件 SHALL 提供原版说明入口。

#### Scenario: Capacity and land constraints
- **WHEN** 目标同时存在资源容量不足与目标地区已满
- **THEN** 分别说明两项限制并突出当前可执行步骤
- **AND** 无适合扩张土地时不承诺继续扩地即可完成

#### Scenario: Craft dependency
- **WHEN** 目标需要已解锁的合成材料且库存不足
- **THEN** 展示材料缺口及工坊入口，合成或购买仍由原版引擎校验

### Requirement: Advanced system continuation
系统 SHALL 为已开放的贸易、宗教、太空、政策、时间和挑战提供说明与原版功能入口，返回地图后重新评估目标。

#### Scenario: Advanced system round trip
- **WHEN** 玩家从目标进入已开放的高级系统并完成操作后返回
- **THEN** 保留所追踪目标并根据真实结果更新进度
- **AND** 无法精确定位页签时明确显示原版操作路径

#### Scenario: Recommended research exhausted
- **WHEN** 当前推荐科技路线已完成
- **THEN** 展示可选高级发展方向，不显示强制游戏结束
