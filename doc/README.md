# SVG 编辑器（CLI）项目文档

代码仓库：[Mengyzh-2003/SVG-cli](https://github.com/Mengyzh-2003/SVG-cli)

需求文档：[phase_cli_1.md](../phase_cli_1.md) · 开发与验收记录：[DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md)

## 架构方案

### 1. 模块划分与职责

项目采用 TypeScript 和面向对象设计，实现 SVG 文档的命令行编辑，支持六种内置图形、19 条命令、层级操作、撤销重做及 SVG 读写。`box` 属于后续插件阶段，当前保留图形注册扩展点。

| 模块 / 目录 | 主要类或接口 | 职责 |
|---|---|---|
| `src/domain/document/` | SvgDocument、ShapeSubtree | 管理画布、唯一 id 索引、父子关系、同级顺序及子树操作 |
| `src/domain/shapes/` | Shape、GeometryShape、ContainerShape、GeometryChange、AttributeChange、TreeChange | 定义图形抽象，封装属性、几何变更及状态恢复 |
| `src/shapes/` | 六种具体 Shape、ShapeFactory | 实现 rect、circle、ellipse、line、text、g；集中登记构造方式、CLI 参数和 SVG 转换规则 |
| `src/commands/` | Command、各编辑命令、GeometryCommand | 将编辑封装为可撤销命令，保存执行和恢复所需的状态 |
| `src/application/` | EditorSession、CommandDispatcher、HistoryManager、DocumentFormatter | 校验命令参数，编排编辑、查询、历史和 IO，生成结果摘要与帮助 |
| `src/cli/parser/` | CommandParser | 解析单行词元、双引号、空行和整行注释，保留参数是否加引号的信息 |
| `src/cli/` | Repl、TerminalOutput | 读取输入，按序等待命令完成，输出结果、错误和警告，处理 EOF |
| `src/io/` | SvgReader、SvgWriter、SvgFileStore、SvgInputLimits | 转换 SVG 与领域对象，补齐缺失 id，管理文件读写、输入限额和临时文件 |
| `src/main.ts` | 组合根 | 创建并连接工厂、文件服务、会话、Parser 和 REPL |
| `test/` | 分层测试与 CLI 会话测试 | 验证领域规则、命令、解析、IO 及源码和编译入口 |
| `scripts/` | RepositoryAudit、PerformanceProbe | 检查架构、文档和图源，测量典型负载下的性能 |
| `examples/`、`doc/evidence/` | 命令脚本、SVG、截图 | 提供可回放样例和视觉验收材料 |

领域层只依赖图形抽象，具体图形统一放在 `src/shapes/`。父子关系和同级顺序由 `SvgDocument` 统一维护，Shape 不重复保存拓扑。属性通过私有字段、只读视图和领域方法封装。

### 2. PlantUML 组件图

![SVG CLI 模块依赖组件图](architecture.png)

图源：[architecture.puml](architecture.puml)。箭头表示源码依赖；`main.ts` 装配各模块，`EditorSession` 创建编辑命令，Dispatcher 调用登记的处理器。

按需求 2.1，图中将 CommandDispatcher 和 ShapeFactory 的两处名字分派标记为**待重构**。其余模块通过接口和多态完成协作。

### 3. 命令执行流程

1. Repl 将输入交给 CommandParser。空行和整行注释跳过；词法错误直接返回。
2. Parser 生成 CommandRequest。EditorSession 通过 CommandDispatcher 找到处理器，由处理器校验参数；create 的类型参数和尾部 `in` 子句由工厂注册项处理。
3. 编辑处理器创建 Command。HistoryManager 执行成功后将其压入 undo 栈，并清空 redo 栈；应用层生成反馈，CLI 输出 CommandResult。
4. tree、show、help 和无参 canvas 查询不改变历史。成功的 init、read、save 及 canvas 尺寸修改清空并锁定历史，下一次成功编辑重新开启撤销。
5. read 在完整解析后替换当前文档；save 在文件替换成功后更新默认路径和历史。异步 IO 期间，会话拒绝重叠请求；失败保留原文档、路径和历史。

### 4. 设计模式的选择与实现

| 模式 | 实现位置 | 用途 |
|---|---|---|
| **Command** | [Command](../src/commands/Command.ts)、各编辑命令、[HistoryManager](../src/application/HistoryManager.ts) | 一条编辑命令对应一个 undo 单元，group 等多节点操作整体恢复 |
| **Composite** | [Shape](../src/domain/shapes/Shape.ts)、[ContainerShape](../src/domain/shapes/ContainerShape.ts)、[GroupShape](../src/shapes/GroupShape.ts)、[SvgDocument](../src/domain/document/SvgDocument.ts) | 叶子与容器共用图形接口，通过统一子树操作完成移动、缩放和删除 |
| **Factory / Registry** | [ShapeFactory](../src/shapes/ShapeFactory.ts) | 集中登记图形类型，复用创建、参数解析和 SVG 转换规则 |
| **Facade** | [EditorSession](../src/application/EditorSession.ts) | 向 CLI 提供统一入口，协调命令、领域对象、历史和文件服务 |
| **Template Method** | [GeometryCommand](../src/commands/GeometryCommand.ts)、MoveCommand、ScaleCommand | 复用准备、应用和恢复流程，由子类提供具体几何变更 |

Command 接口为 `execute(): void` 和 `undo(): void`，依赖在构造时注入，redo 再次执行同一命令对象。结果摘要由应用层生成，HistoryManager 保存对应的撤销和重做反馈。

几何修改先计算整棵子树的结果，全部校验通过后再应用。move、scale 保存修改前后的数值，撤销直接恢复原值；set 区分缺省属性与显式值。容器样式只修改本地属性，由 SVG 继承机制影响子节点。

层级命令使用 TreeChange 保存受影响的父子关系和顺序，检查最终父链无环后统一提交。同父 group 放在最早选中位置，跨父 group 放在根末尾；孩子按原文档顺序排列。addto 放到目标容器末尾，front/back 调整同级顺序，嵌套 g 解组后孩子原位提升。重组保留本地属性与 transform。

Reader、Writer 和 FileStore 分别负责解析、序列化和文件操作。id 分配与输出排版目前各有一种规则，保留在所属模块内。

### 5. 依赖方向规则

| 发起方 | 允许依赖 | 原因 |
|---|---|---|
| cli | application、cli/parser、Node 输入输出流 | 隔离终端交互，复用应用入口 |
| cli/parser | application 的请求与词元类型 | 解析输入，不执行编辑 |
| application | commands、domain、shapes、io 及本模块 | 编排编辑和外部服务，管理会话生命周期 |
| commands | domain 及本模块 | 编辑和撤销围绕领域行为实现 |
| shapes | domain 及本模块 | 具体图形实现领域抽象 |
| io | domain、shapes、Node 文件接口、XML 库及本模块 | 在文件、XML 与领域对象之间转换 |
| domain | 仅 domain | 保持核心规则独立于终端、应用、具体工厂和文件系统 |
| main.ts | 所有生产模块 | 作为组合根完成依赖注入 |
| test | 被测公开接口与测试工具 | 从生产代码外验证行为 |

领域层不反向依赖应用、CLI、IO 或具体图形；编辑命令不访问终端和文件系统；IO 不依赖 CLI 的输出文本。违反规则的依赖列为待处理项。

### 6. 变化点与预留取舍

| 可能变化 | 当前设计 | 取舍 |
|---|---|---|
| 新图形与 box | 工厂注册、多态图形接口、容器解散能力接口 | 插件加载、子部件所有权和 data-kind 还原留到插件阶段 |
| 新命令、别名和参数 | Dispatcher 注册处理器及必填语法，create 帮助复用参数 schema | 命令登记与帮助同源，Parser 保持词法职责 |
| SVG 支持范围或 XML 库 | Reader/Writer 隔离，工厂提供类型转换，图形提供 SVG 视图 | 新格式规则集中修改转换层 |
| GUI 或其他交互入口 | CommandRequest、CommandResult 和 EditorSession | 可复用应用层，当前只实现 CLI |
| 大文档与长会话 | 独立历史管理、迭代遍历、输入限额和性能测量脚本 | 根据实际负载再决定是否增加缓存或历史持久化 |
| id 和显示规则 | 分别集中在 Reader 与 DocumentFormatter | 规则尚无多种实现，暂不引入 Strategy |

## 过程记录

开发中，我结合代码、测试结果和审查反馈，对 AI 生成的方案与实现进行了以下修订。各阶段提交和 CI 结果见开发方案第 8、9 节。

### 1. 调整开发顺序与模块归属

我发现初版方案把 init 和 Command 放在 create 之后，领域抽象与具体图形的目录归属也有重叠。对照命令的文档前置条件和 Command 要求后，我将 init 提前，要求首个 create 就通过命令对象执行；领域抽象归 domain，六种具体图形归 shapes，Parser 只负责词法解析。

### 2. 补齐阶段验收与交接要求

我审查执行计划时发现，复选框无法说明某阶段通过了哪些验证，根 README 也缺少运行说明。为此，我补充阶段状态、验收证据、提交和 CI 记录，统一 Node 24 与 npm 11.12.1，并将 Windows/Linux 检查、使用指南和 XML 输入限额纳入验收。

### 3. 修正 EOF 处理并补测编译入口

早期回放出现 `readline was closed`。我检查输入流生命周期后确认，流关闭时仍可能有待处理的缓冲行，因此要求通过 close 事件管理状态。随后检查入口测试，发现它只启动 tsx 源码；我将测试扩展为源码和编译产物两组，并补充异步命令执行期间输入流失败的场景。

### 4. 统一 Command 契约与帮助登记

我发现文档中的 execute(context)、undo(context) 与实际无参接口不一致。核对 Command、CreateCommand 和 EditorSession 后，我将说明统一为构造注入依赖、无参执行，明确结果摘要由应用层生成。同时将帮助语法设为登记命令时的必填项，避免新增命令遗漏参数说明。

### 5. 保证几何变更完整提交与精确撤销

我检查容器移动和缩放时，发现逐个修改子孙会在后续节点溢出时留下部分变更，逆运算撤销也可能引入浮点误差。根据末端极大坐标和 0.1 加 0.2 的回归结果，我采用 GeometryChange 先准备全部结果，再统一应用，并保存前后值供 undo/redo 恢复。

### 6. 修复拓扑恢复的间接成环风险

我复核 TreeChange 时发现，仅检查直接受影响的节点不足以覆盖间接祖先变化。回归测试中，移除最终父链检查会导致两项测试失败。于是我要求用候选关系覆盖现有关系，检查完整父链无环后再写入；校验失败时，命令状态保持不变，冲突消除后可以重试。

### 7. 保留文本与命名空间语义

我对照 TextShape 的属性视图和 SVG 格式，发现编辑属性不能直接用作 XML 属性：text 内容应写成子文本。另一个迁移用例表明，子节点离开原父组后可能丢失前缀绑定。我采用多态 svgAttributes/textContent 输出，并在读入时保存节点需要的命名空间声明，补测文本空白、实体及跨组迁移后的往返结果。

### 8. 修复椭圆缺省半径与混合命名空间

根据审查反馈，我复核了仅提供 rx 或 ry 的 ellipse，确认统一补零会把缺省半径变成显式零，改变绘制结果；中途出现 xmlns="" 的子树也会被错误转换为 SVG 节点。我要求工厂按类型配置缺省规则，保留 ellipse 的 auto 语义；Reader 区分整篇 SVG 命名空间和整篇无命名空间两种模式，拒绝混用。仅 rx、仅 ry、双缺省、显式零及四类命名空间用例均加入回归。

### 9. 修正异步 IO 与跨盘测试路径

文件服务改为异步后，我发现应用层仍有同步签名和异常捕获，交错请求还可能在 IO 完成时被清掉历史。我核对 REPL 的等待流程和延迟 IO 测试后，要求应用层统一接收结果或 Promise，并用执行门保护会话。Windows 入口测试中的 ENOENT 则来自跨盘路径拼接；我将 join 改为 resolve，兼容 path.relative 返回绝对路径的情况。

### 10. 修复合法长文件名保存失败

按反馈复核 SvgFileStore 时，我确认临时文件名拼入完整目标名后增加了 42 个字符，使合法目标路径保存失败。真实文件系统测试验证了 214 和 255 字符目标名的情况。我将临时文件改为同目录短名 `.svg-cli-<UUID>.tmp`，保留独占创建、同步、替换和清理流程，并验证首次保存、覆盖保存及无临时文件残留。

### 11. 区分测试预期错误与模型缺陷

AI 生成的典型会话测试曾把 TextShape.geometry 预期为只有 x/y，导致两个入口各失败一项。我核对已有接口，确认视图还应包含 text，保存内容与坐标均正确。因此我修正完整相等断言，继续单独验证 textContent，保留原模型契约。

### 12. 对齐显示格式与无文档行为

我对照需求的 tree/show 示例，发现原实现使用 width/height、文本键值和逐行属性，输出布局与要求不同；help 还绕过了无文档检查。我要求图形提供结构化几何摘要，由 Formatter 统一排版；help 遵循文档前置条件。源码和编译入口改用完整响应断言，同时保留特殊字符与失败后历史测试。

### 13. 补充保存预算提示与局部坐标示例

我发现读入限额不能阻止编辑后的文档变大，文件可能保存成功却无法读回。核对 Writer 的实际输出后，我让 Reader、Writer 和 FileStore 共用预算，保存成功后提示超限情况。另补充 transform 和继承样式示例，验证移动修改局部坐标，重组保留属性并由新父级影响外观。

### 14. 固定仓库检查并整理提交材料

我检查 CI 和 Git 文件清单时，发现架构检查仍是临时操作，Markdown 缺少自动检查，样例也曾漏入提交。我要求补交样例，将依赖方向、类与文件名、封装、文档结构和图源一致性检查纳入 CI，并用有意损坏的样例验证检查器。随后按需求的四节重整文档，修正组件图中的依赖箭头、旧 help 说明和测试数量，删除重复图源与过时待办。最终通过干净检出、会话回放和一轮追加复核确认交付内容。

## 一致性自查

### 1. 实际目录与方案是否一致？

实际目录与架构表一致。具体图形统一归 shapes，领域层只依赖抽象，父子关系和顺序由 SvgDocument 管理。init 与首个 Command 前移、摘要归应用层、IO 分层、共享预算和多态显示摘要等调整，已记录在过程记录及开发方案中。

生产类遵循一类一文件、文件名与类名一致。文档和图形承担校验、变更与恢复职责；请求和结果接口用于跨层传输。测试、脚本、示例和截图位于独立目录。

### 2. 依赖方向是否被违反？

自动检查和人工抽样未发现依赖违规。`npm run check:repo` 检查生产导入、类文件名、公开可写字段、顶层过程函数及 switch，人工复核注册表、多态调用和状态变更路径。

| 抽样关系 | 核对结果 |
|---|---|
| Repl、Parser → 应用接口 | Parser 只依赖请求和词元类型，词法失败不执行命令 |
| EditorSession → Dispatcher、History、Commands、Domain、Factory、IO | 应用层编排协作、创建命令并生成摘要 |
| HistoryManager → Command | 通过接口执行和撤销命令 |
| 编辑命令 → Domain | 无应用结果、终端或文件系统依赖 |
| SvgDocument → 领域图形抽象 | 无具体工厂、应用或 IO 依赖 |
| ShapeFactory → 具体图形与领域接口 | 同一注册表服务 CLI 与 SVG 转换 |
| Reader/Writer/FileStore → 领域、工厂或文件接口 | 转换器不依赖 CLI，FileStore 不持有文档与历史 |

CommandDispatcher 和 ShapeFactory 保留两处名字分派，已在架构图中按要求标为待重构。

## 质量保证手段

### 1. 逐项需求核对

| 需求部分 | 实现与验证依据 |
|---|---|
| 1.1 Git 管理 | 工程、领域、命令、IO、修复与优化分步提交并推送，最终版本以 `final` 标签标识 |
| 1.2 文档 | doc/README.md 包含四个指定章节，以及模块职责、PlantUML 图、模式、依赖规则和变化点 |
| 2 通用约定 | 测试覆盖提示符、注释、唯一且大小写敏感的 id、自动补 id 警告、双引号、单行错误及成功摘要 |
| 2.1 面向对象与模式 | 类与多态、属性封装、Command、Composite、两处名字分派和依赖规则经过自动检查与人工抽样 |
| 3 文档命令 | init/read/save/canvas、默认路径及文档命令后的历史锁定有会话测试；无参 canvas 保留历史 |
| 3 编辑、显示与历史 | create/delete/move/scale/set/group/ungroup/addto/front/back、tree/show/help、undo/redo 均已实现并接入 CLI |
| 4.1 类型与参数 | 工厂和会话测试覆盖六类型、缺省样式、几何属性、text 子文本、白名单与 in 子句 |
| 4.2 错误处理 | 对规定错误逐项测试，并核对失败后文档、默认路径和历史不变；复合容器解组错误通过测试类型验证 |
| 4.3 撤销重做 | 每条编辑一个单元；成功后迁栈，undo 后新编辑清空 redo，查询与失败保留历史，IO 后锁定 |
| 4.4、6.1 版本 B | 按阶段边界保留注册扩展点，create box 返回 unknown shape type |
| 5 显示格式 | 源码和编译入口验证 tree 的几何内联、文本及线端点格式，以及 show 的父级、几何和属性输出 |
| 6、6.1 版本 A | 6 项完整会话测试回放典型会话和手工组合流程图，核对完整输出及保存、读回后的领域状态 |
| SVG 读写与预览 | 真实文件测试覆盖往返、资源限额、缺省半径、命名空间和长文件名；样例及截图用于视觉验收 |

### 2. 自动化验收与交付复现

环境为 Node.js 24 LTS / npm 11，已验证 Node.js 24.15.0 / npm 11.12.1。从仓库根目录执行：

```sh
npm ci
npm run format:check
npm run typecheck
npm run check:repo
npm run build
npm test
```

功能回归共 **39 个测试文件、762 项测试**，覆盖解析与 REPL、领域索引和拓扑、六种图形、编辑命令的执行与撤销重做、浮点恢复、失败状态、异步会话、IO 历史和 SVG 往返。pretest 先构建项目，入口测试同时运行源码与编译产物。

仓库检查器有 **3 项回归测试**，通过有意损坏的代码、文档和架构图验证检测能力。文档检查包括章节顺序、链接、代码围栏、日期和过程标题；架构图检查比对 PNG 内嵌 PlantUML 与源文件，布局另作目视核对。

GitHub Actions 在每次 push 和 PR 上执行 Windows、Linux 干净安装、格式检查、类型检查、仓库检查、构建和测试。阶段提交和 CI 链接保存在开发方案中。

交付验收使用隔离的干净检出，安装锁定依赖后执行全部检查，再回放中文最小会话和两个编译入口示例，核对画布、图形类型、层级、坐标、文本及 demo.svg 的字节一致性。追加复核逐项对照需求、代码和文档，修正了过时说明与重复内容。

### 3. 文件读写与视觉验收

Reader 限制输入为 5 MiB UTF-8、128 层、50,000 个元素（含根），在文件读取和解析期间检查限额。DTD、自定义实体、外部实体和处理指令被拒绝，XML 声明除外；HTTP 与本地文件访问回归验证解析过程不访问外部资源。缺失 id 在预留全部显式 id 后分配，完整读入成功再输出警告。

Writer 使用多态 SVG 视图，检查 XML 字符、名称和命名空间。FileStore 在目标同目录创建短临时文件，完成写入、同步和关闭后替换目标；失败清理临时文件，保留原文件。真实文件测试覆盖首次保存、覆盖、长文件名及错误清理，超出读入预算的输出在保存成功后给出警告。

[demo.commands](../examples/demo.commands) 生成的 [demo.svg](../examples/demo.svg) 和我提供的截图用于检查六种图形、中文及 XML 字符的显示。自动化另行核对 420×220 画布与层级，架构图完成图源检查和目视核对。

![样例 SVG 打开后的显示证据](evidence/demo-preview.png)
