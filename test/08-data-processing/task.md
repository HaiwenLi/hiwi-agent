# Task: 数据处理

## 目标
解析 `data.csv` 文件，执行数据清理和变换，输出为 JSON 格式。

## 文件
- `data.csv` — 模拟电商销售数据（1000 行），包含以下列：
  - `order_id` — 订单 ID
  - `product` — 产品名称
  - `category` — 产品类别（Electronics, Clothing, Food, Books）
  - `price` — 单价
  - `quantity` — 数量
  - `order_date` — 订单日期（YYYY-MM-DD）
  - `customer_city` — 客户城市
  - `status` — 订单状态（completed, pending, cancelled）

## 要求

### 数据处理脚本
在 `08-data-processing/` 下创建 `process.ts`，实现以下功能：

1. **读取** `data.csv`
2. **数据清理**：
   - 删除 `status` 为 `cancelled` 的行
   - 删除 `price` 或 `quantity` 为负数的行
   - 删除 `product` 为空的的行
3. **数据变换**：
   - 添加 `total` 列 = `price × quantity`
   - 格式化价格为 `¥X,XXX.XX`
   - 格式化日期为中文格式 `YYYY年MM月DD日`
4. **分组统计**：
   - 按 `category` 分组，计算每个类别的：
     - 总销售额
     - 订单数量
     - 平均订单金额
     - 销量最高的产品
5. **输出**：
   - 清理后的数据保存为 `cleaned-data.json`
   - 统计结果保存为 `summary.json`

## 验收标准
- [ ] 正确处理 1000 行数据
- [ ] 正确过滤 cancelled 和无效行
- [ ] 分组统计结果正确
- [ ] JSON 输出格式正确
- [ ] TypeScript 编译无错误
- [ ] 运行 `npx tsx test/08-data-processing/process.ts` 完成执行
