# Task: Web Research + 代码应用

## 目标
搜索 CSS Container Queries 的最新文档，然后将其应用到 `03-responsive-page` 的卡片布局中。

## 要求

### Phase 1: 信息获取
1. 搜索 "CSS Container Queries" 的 MDN 文档
2. 搜索 "container query units (cqw, cqh, cqi, cqb, cqmin, cqmax)"
3. 理解以下概念：
   - `container-type` 属性
   - `container-name` 属性
   - `@container` 规则
   - 容器查询单位

### Phase 2: 代码应用
在 `test/03-responsive-page/src/styles.css` 中添加容器查询支持：

1. 将卡片容器设置为查询容器
2. 使用 `@container` 规则实现以下效果：
   - 当卡片容器宽度 > 400px：显示水平布局（图片在左，内容在右）
   - 当卡片容器宽度 ≤ 400px：显示垂直布局（图片在上，内容在下）
3. 使用 `cqi` 单位设置卡片的 `font-size` 和 `padding`

### Phase 3: 验证
- 在浏览器中打开页面，调整视口宽度确认容器查询生效
- 确认容器查询和媒体查询协同工作（而不是互相冲突）

## 验收标准
- [ ] 搜索了 CSS Container Queries 的相关文档
- [ ] 卡片容器设置了 `container-type: inline-size`
- [ ] 使用了 `@container` 规则
- [ ] 使用了至少一种容器查询单位（cqi/cqw/cqh）
- [ ] 页面在宽/窄卡片容器下有不同的布局
- [ ] 容器查询与媒体查询不冲突
