# Task: 大文件处理

## 目标
在 2000+ 行的大模块中精确添加新功能，测试 agent 在上下文压力下的表现。

## 文件
- `large-module.ts` — 2000+ 行的数据处理模块

## 要求

### Phase 1: 阅读定位
1. 打开 `large-module.ts` 并阅读其结构（无需逐行读完）
2. 理解该模块已有的模式和风格
3. 找到在哪个位置添加新函数最合适

### Phase 2: 添加新函数
在模块末尾的适当位置添加以下函数：

```typescript
/**
 * 对分组后的数据进行趋势分析
 * @param data 分组后的数据 Map
 * @param metric 分析指标（'sum' | 'avg' | 'count'）
 * @returns 按时间排序的趋势数据点数组
 */
export function analyzeTrends(
  data: Map<string, number[]>,
  metric: 'sum' | 'avg' | 'count'
): Array<{ label: string; value: number; change: number }>
```

**函数行为**:
- `sum`: 对每个标签的值求和
- `avg`: 对每个标签的值取平均
- `count`: 统计每个标签的数据点数量
- `change`: 计算相比上一个数据点的变化百分比（第一个为 0）

### Phase 3: 验证
- `npx tsc --noEmit test/12-stress/large-module.ts` — 无编译错误
- 函数与现有模块风格一致

## 验收标准
- [ ] 正确找到文件的正确插入位置
- [ ] 函数实现正确
- [ ] TypeScript 编译无错误
- [ ] 函数风格与文件已有代码一致
- [ ] 不修改已有代码
