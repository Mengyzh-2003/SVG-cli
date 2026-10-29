# SVG-cli

一个面向 SVG 文档的 TypeScript 命令行编辑器，用于课程与个人项目。支持交互式 REPL、六种内置图形、分组与层级编辑、撤销重做以及 SVG 文件读写。当前不实现 `box` 或插件加载器，不发布 npm 包。

## 环境与安装

支持 Node.js **24 LTS** 和 npm **11**，已验证 Node.js 24.15.0 / npm 11.12.1。`.node-version` 与 CI 使用同一 Node 版本；Windows、Linux 持续集成通过，macOS 未验证。

```sh
git clone https://github.com/Mengyzh-2003/SVG-cli.git
cd SVG-cli
npm ci
npm run cli
```

启动后显示欢迎语与 `svg>` 提示符。源码入口使用 tsx；也可以先构建再直接运行编译产物：

先执行 `init` 或 `read <file.svg>` 建立当前文档，再用 `help` 查看完整语法；未建立文档时，其他已注册命令统一报无文档错误。

```sh
npm run build
node dist/main.js
```

输入 EOF 结束会话（Windows 终端已验证空提示符 Ctrl+D），Ctrl+C 中断进程。内存编辑不会自动保存，请在退出前使用 `save`。

## 最小会话

在 REPL 中依次输入以下命令，不要输入代码框外的提示符：

```text
init 400 200
create g scene
create rect start 20 20 120 50 #f5a623 in scene
create text label 35 50 "中文 & < >" in scene
move scene 10 10
undo
redo
tree
show label
save "my diagram.svg"
read "my diagram.svg"
canvas
```

`save` 在当前工作目录写入文件。用浏览器直接打开 `my diagram.svg` 查看效果；文件修改后刷新页面。`read` 会替换当前文档，请先保存需要保留的工作。

## 命令速查

`help` 无需初始化即可查看全部已登记语法，`init` 或 `read` 可建立当前文档；其他命令需要当前文档。

| 类别 | 命令与语法 |
|---|---|
| 文档 | `init [w] [h]`、`read <file.svg>`、`save [file.svg]`、`canvas [w] [h]` |
| 基础编辑 | `delete <id>`、`move <id> <dx> <dy>`、`scale <id> <factor>`、`set <id> <attr> <value>` |
| 层级与顺序 | `group <newGid> <id1> [id2 ...]`、`addto <gid> <id>`、`ungroup <gid>`、`front <id>`、`back <id>` |
| 查询 | `tree [id]`、`show <id>`、`help` |
| 历史 | `undo`、`redo` |

创建语法如下；每行都可追加 `in <containerId>`，省略时挂在 SVG 根下。

```text
create rect <id> <x> <y> <width> <height> [fill]
create circle <id> <cx> <cy> <r> [fill]
create ellipse <id> <cx> <cy> <rx> <ry> [fill]
create line <id> <x1> <y1> <x2> <y2> [stroke]
create text <id> <x> <y> "content"
create g <id>
```

id 必填、唯一且区分大小写；`set` 不允许修改 id。几何数值必须有限，坐标允许负数，尺寸、半径与描边宽度不得为负，画布尺寸和缩放倍数必须为正。

### 输入与错误

空行和行首可带空白的整行 `#` 注释会被跳过；参数里的 `#ffffff` 是颜色，不支持行尾注释或 shell 命令链。双引号包裹完整词元，保留空格、中文和空文本；引号内支持 `\"` 与 `\\` 转义，其余反斜杠序列原样保留。紧接结束引号前的字面反斜杠须写成两个反斜杠。不支持部分词元拼接、单引号引用或分号分隔命令。

`in` 只有在 create 必填参数之后、且未加引号时才作为父容器子句；文本内容 `"in"` 和合法 id `in` 不会被误判。可选 fill/stroke 若为字面值 in，应加双引号。

命令逐行按序执行，包括异步读写。错误以单行 `error:` 输出，之后仍可继续输入；失败不改变文档、默认路径或历史。缺失 id 的读入警告使用 `warning:`，只有完整读入成功后才输出。

### 编辑与历史

一次成功编辑是一个 undo 单元；undo 后新的成功编辑清空 redo，查询与失败操作保留历史。零位移、倍数 1、相同属性值和已在边界的排序也视为成功编辑。

成功 `init`、`read`、`save` 或画布修改后，历史清空，undo/redo 报 `error: undo not allowed after io command`，直到下一次成功编辑。`canvas` 无参查询不改变历史。普通空栈分别报 `nothing to undo` / `nothing to redo`。

`move` 修改选中子树的局部坐标；`scale` 将所有局部位置、尺寸同乘倍数，线的两个端点都参与，文字只缩放位置，字体与 stroke-width 不缩放。先校验整个子树，溢出时不产生部分变更；undo 精确恢复快照，不依赖逆运算。有限下溢为零遵循 JavaScript 数值规则。

`set` 设置一个节点的本地属性，白名单如下。g 的样式不覆写孩子，保留 SVG 继承。撤销区分缺省属性、空字符串、none 和显式零。

| 类型 | 可修改属性 |
|---|---|
| 全部六种类型 | fill、stroke、stroke-width |
| rect | x、y、width、height |
| circle | cx、cy、r |
| ellipse | cx、cy、rx、ry |
| line | x1、y1、x2、y2 |
| text | x、y、text |
| g | 仅公共样式 |

`tree` 展示有序层级和规范属性名，`show` 显示真实 parent 与本地属性；显示转义不修改原始内容。

### 分组与绘制顺序

`group` 接受至少一个已有节点；同父选择在最早选中位置生成组，跨父选择在根末尾生成组，孩子按原文档顺序排列。重复选择和祖先/后代同时选择被拒绝。空组使用 `create g`。

`addto` 把已有子树放到目标容器最后，同父操作也移到最后。容器不能加入自己或自己的后代。`ungroup` 只允许解散嵌套普通 g，把直接孩子按原顺序放在组的原位置；顶层 g 和未开放解散能力的复合容器被拒绝。一条 undo 恢复原实例、原父和顺序。

`front` 移到当前同级末尾（后绘制，视觉最前），`back` 移到同级开头。分组、收编、解组和排序保留本地属性；**不补偿继承样式或 transform，重组可能改变外观**。

## 文件与 SVG 支持范围

`init` 默认 800×600，仅给宽度时高度为 600。`canvas <w> <h>` 必须同时提供两个尺寸，并把 viewBox 同步为 `0 0 w h`；保持图形和默认路径。无参 canvas 只查询尺寸。

`read` 成功后记录默认路径，显式 `save` 成功也更新默认路径，后续无参 `save` 使用它。相对路径以进程工作目录为准，含空格路径使用双引号。成功 init 清空默认路径；无默认路径时须先使用 `save <file.svg>`。元素计数包含 g 和子孙，不包含根 svg。

保存先在目标同目录创建独占的短临时文件，写入、同步、关闭后替换目标；失败清理临时文件并保留旧文件。替换的原子性取决于文件系统 rename 语义，不承诺断电恢复。read/save 失败分别报 `cannot read file: <path>` / `cannot write file: <path>`，保留当前文档、路径与历史。

- 支持根 svg 和 rect、circle、ellipse、line、text、g；支持 SVG 命名空间前缀或整体无命名空间输入，禁止两种元素命名空间模式混用。
- 几何接受有限的无单位 SVG 数值（小数、指数）；不支持 px、百分比等单位。缺省几何通常补零，ellipse 缺省 rx/ry 保留 auto 语义；显式零保持零。缺省画布尺寸采用 800×600，画布与 viewBox 尺寸必须为正。
- 读入先预留全部显式 id，再按文档顺序为缺失 id 分配“标签名+序号”，避免与后部元素冲突。显式空 id、重复 id（含根 id 冲突）被拒绝。
- 保留尺寸、独立 viewBox、层级、顺序、本地属性和文本；缺省 fill/stroke 不额外补值。文本使用 XML 子文本，中文、实体和空白可往返。
- 支持节点的附加属性（如 transform、字体和带命名空间元数据）可保留，重组后保留必要前缀绑定；不计算 transform 或完整 CSS/引用语义。CLI set 仍受上述白名单限制。
- 不支持 path、tspan、嵌套 svg、box 等未知元素或外来元素命名空间；拒绝处理指令，XML 声明除外。不保留注释与原始排版。

### 输入边界与已知限制

文件必须是 XML 1.0、UTF-8（可不写编码声明）。输入上限为 **5 MiB UTF-8、128 层（根算第 1 层）、50,000 个元素（含根）**；文件按实际读取字节限额，深度/数量在解析期间检查。拒绝 DTD/DOCTYPE、自定义实体和外部实体，不解析本地外部文件或发起网络请求；支持预定义实体和合法数字引用。

这些限制针对输入。编辑扩大后的输出仍允许保存；若实际 UTF-8 大小、深度或元素数超出读入预算，保存成功后会打印 warning，说明当前版本无法直接读回。保存失败不发布该警告。保留附加属性**不等于 SVG 净化**：事件、URL、CSS 引用可能保留，浏览器打开时的行为不受解析器外部资源禁用约束。请只预览可信文件。

本工具使用内存历史，无自动保存或历史持久化；没有 GUI、HTTP API、完整 SVG/CSS 引擎或发布包流程。浏览器样例检查不代表跨浏览器兼容性认证。

## 可回放样例与预览证据

先构建，从仓库根目录执行：

```powershell
Get-Content -Encoding utf8 examples/demo.commands | node dist/main.js
```

支持输入重定向的 shell：

```sh
node dist/main.js < examples/demo.commands
```

这会写入 [examples/demo.svg](examples/demo.svg)，包含全部六种类型、420×220 画布与 `SVG 编辑器：中文 & < >`。用户提供的 [打开截图](doc/evidence/demo-preview.png) 已完成样例视觉验收；未声称独立浏览器自动化或跨浏览器测试。

[局部坐标示例](examples/local-coordinates.svg) 包含 transform 和组继承样式，可用同样方式回放 [对应命令](examples/local-coordinates.commands)。`move translated 10 0` 把 panel 的本地 x 从 0 改为 10，组的 translate(60,40) 保留；不是在浏览器世界坐标中加 10。随后 `addto destination panel` 保留 panel 的本地属性，但新父组的平移与橙色 fill 会影响外观。脚本生成的 local-moved.svg、local-regrouped.svg 可供对比预览，已排除在版本管理外。Reader/Writer 保留这些属性，不计算样式或补偿矩阵；自动回归核对坐标、层级和属性往返。

## 质量检查与项目文档

```sh
npm run format:check
npm run typecheck
npm run check:repo
npm run build
npm test
```

`npm test` 的 pretest 会重新构建，再运行一次 Vitest。当前 **39 个测试文件、762 项测试**覆盖词法与 REPL、领域不变量、六种图形、所有编辑命令执行/撤销/重做、失败状态不变、IO 历史、SVG 往返、资源边界及源码/编译入口。需求第 6 节和 6.1 版本 A 有完整入口输出回放测试，box 按未支持类型验收。

GitHub Actions 在每次 push/PR 上执行 Windows、Linux 干净安装、格式、源码/测试类型检查、仓库检查、构建和测试。Prettier 检查代码及配置；`check:repo` 检查生产依赖方向、类与文件同名、公开可写字段、顶层过程函数和 switch，单独检查文档章节、链接、围栏、过程标题、日期及架构 PNG 内嵌图源，并用 3 项损坏样例验证检测能力。两处名字分派、模式合理性和文档内容仍需人工复核，不设任意覆盖率阈值。

`npm run benchmark` 从独立进程测量 5,000/20,000 个矩形、2,000 次移动、10 轮删除/撤销/重做和序列化，输出耗时、保留堆增量及进程峰值内存；包含构造输入的读入耗时，不包含磁盘写入。它是诊断命令，结果随机器变化，不作为 CI 时间门槛。

- [需求文档](phase_cli_1.md)
- [开发方案、阶段状态与验收记录](DEVELOPMENT_PLAN.md)
- [最终提交文档：架构、过程记录、一致性自查、质量保证](doc/README.md)

`final` 标签等待用户确认最终版本后创建；当前提交可继续审查和优化。
