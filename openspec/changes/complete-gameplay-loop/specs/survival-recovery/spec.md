## Purpose

使玩家能识别粮食风险并完成可理解的恢复过程。

## ADDED Requirements

### Requirement: Explain food depletion risk
系统 SHALL 在猫薄荷净消耗时展示库存、当前实际净消耗、按当前速度估计的耗尽时间及恢复入口，并标明估计基于当前速率。

#### Scenario: Negative production at accelerated speed
- **WHEN** 游戏以非默认倍率运行且猫薄荷净产出为负
- **THEN** 估计采用该倍率下的实际每秒消耗，并随季节与生产状态更新
- **AND** 有库存时不把短期负产出等同于已经发生饥荒

#### Scenario: Paused game
- **WHEN** 游戏暂停且存在粮食风险
- **THEN** 提示模拟已暂停，不显示仍在实际流逝的倒计时

### Requirement: Actionable recovery without forced failure
系统 SHALL 提供供粮和岗位入口，并在风险解除时反馈；人口归零 SHALL 仍允许继续恢复经营。

#### Scenario: Recover and preserve tracked goal
- **WHEN** 玩家调整农民或设施使粮食净产出恢复为非负
- **THEN** 解除当前净消耗警报并展示一次恢复反馈
- **AND** 保留玩家原来追踪的长期目标，不自动分工或购买

#### Scenario: Population reaches zero
- **WHEN** 存档人口为零且游戏仍可写入
- **THEN** 提供恢复供给和居住条件的目标，允许继续经营
