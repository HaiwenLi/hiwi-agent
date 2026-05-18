#!/bin/bash

# 禁用诊断避免输出干扰
exec 2>/dev/null

OUTPUT="test/11-bash-advanced/repo-analysis.md"
echo "# 代码仓库分析报告" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "生成时间: $(date '+%Y-%m-%d %H:%M:%S')" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# 功能1: 文件统计
echo "## 文件统计" >> "$OUTPUT"
echo "" >> "$OUTPUT"
echo "| 子目录 | 文件数 | 总行数 |" >> "$OUTPUT"
echo "|--------|--------|--------|" >> "$OUTPUT"

for dir in src/*/; do
  name=$(basename "$dir")
  count=$(find "$dir" -name "*.ts" 2>/dev/null | wc -l)
  lines=$(find "$dir" -name "*.ts" -exec cat {} \; 2>/dev/null | wc -l)
  echo "| $name | $count | $lines |" >> "$OUTPUT"
done

echo "" >> "$OUTPUT"

# 功能2: 测试覆盖率扫描
echo "## 测试覆盖率扫描" >> "$OUTPUT"
echo "" >> "$OUTPUT"

untested=""
for tsfile in src/**/*.ts; do
  testfile="${tsfile%.ts}.test.ts"
  if [ ! -f "$testfile" ] && [ ! -f "tests/$(basename "$tsfile")" ]; then
    untested="$untested- $tsfile\n"
  fi
done

if [ -n "$untested" ]; then
  echo "以下文件没有对应的测试:" >> "$OUTPUT"
  echo -e "$untested" >> "$OUTPUT"
else
  echo "所有源文件都有测试覆盖。" >> "$OUTPUT"
fi
echo "" >> "$OUTPUT"

# 功能3: 函数签名提取
echo "## 函数签名" >> "$OUTPUT"
echo "" >> "$OUTPUT"

for tsfile in src/**/*.ts; do
  echo "### $(basename "$tsfile")" >> "$OUTPUT"
  echo '```' >> "$OUTPUT"
  grep -E "^export (async )?function" "$tsfile" 2>/dev/null | sed 's/export //' >> "$OUTPUT"
  echo '```' >> "$OUTPUT"
  echo "" >> "$OUTPUT"
done

# 功能4: 依赖分析
echo "## 依赖分析" >> "$OUTPUT"
echo "" >> "$OUTPUT"

declare -A counts
for tsfile in src/**/*.ts; do
  grep -oE "from ['\"]\.\./[^'\"]+['\"]" "$tsfile" 2>/dev/null | grep -oE "\.\./[^'\"]+" | while read -r dep; do
    base=$(basename "$dep" .ts)
    counts["$base"]=$((counts["$base"] + 1))
  done
done

echo "| 模块 | 引用次数 |" >> "$OUTPUT"
echo "|------|----------|" >> "$OUTPUT"
for mod in "${!counts[@]}"; do
  echo "| $mod | ${counts[$mod]} |"
done | sort -t'|' -k3 -rn | head -10 >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "---" >> "$OUTPUT"
echo "报告生成完毕。" >> "$OUTPUT"