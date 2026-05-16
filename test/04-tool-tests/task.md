# Task: 工具能力测试

## 目标
测试 hiwi-agent 的各种工具是否能正常工作。完成以下 5 个独立子任务。

---

### 子任务 1: 文件读写操作
1. 在 `04-tool-tests/` 下创建一个名为 `hello.txt` 的文件，内容为 "Hello, hiwi-agent!"
2. 读取该文件内容并确认
3. 在文件末尾追加一行 "File operations work!"
4. 将文件重命名为 `greeting.txt`
5. 列出 `04-tool-tests/` 目录下的所有文件

### 子任务 2: 代码搜索
1. 在 `../../src/` 目录中搜索所有包含 `export function` 的 TypeScript 文件
2. 统计结果数量
3. 找到所有 `export class` 的定义
4. 使用 glob 模式找到所有 `.test.ts` 文件

### 子任务 3: Web 获取
1. 获取 `https://httpbin.org/get` 的内容（验证 GET 请求）
2. 获取 `https://httpbin.org/headers` 查看请求头
3. 提取响应中的 `url` 和 `headers` 字段

### 子任务 4: Git 操作
1. 查看当前 git 状态
2. 查看最近的 3 条 commit
3. 创建一个新分支 `test-hiwi-agent`
4. 在分支上提交 `hello.txt` 文件
5. 切换回主分支

### 子任务 5: Bash 命令
1. 运行 `node -e "console.log('Node.js works!')"`
2. 运行 `tsx -e "console.log('TSX works!')"`（如有安装）
3. 检查 Node.js 版本
4. 计算 `04-tool-tests/` 目录的大小

## 验收标准
- [ ] 所有子任务完成且无报错
- [ ] 文件操作成功创建并修改了文件
- [ ] 搜索结果数量正确
- [ ] Web 请求成功返回数据
- [ ] Git 操作顺利执行
- [ ] Bash 命令正常输出
