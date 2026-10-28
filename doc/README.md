# SVG 编辑器（CLI）项目文档

本项目按照 `phase_cli_1.md` 实现一个基于 TypeScript、面向对象的 SVG 命令行编辑器。本文件是最终提交文档的工作版本，先确定架构基线；实现过程中如有必要，将在提交记录中迭代本方案。

架构基线：2026-10-26，v1.1；实现更新至 5C：2026-10-28。逐阶段实施、状态与验收见根目录 [DEVELOPMENT_PLAN.md](../DEVELOPMENT_PLAN.md) v1.1。Factory/Registry、EditorSession Facade、Create/Delete/Move/Scale/SetAttribute/Group/AddTo/Ungroup/ReorderCommand 和 HistoryManager 已落地，tree/show/help/undo/redo/set/group/addto/ungroup/front/back 已连接真实入口；Composite 几何操作、属性修改和原子拓扑变更已接入。SVG IO 仍按后续阶段实现；5C 的远程验收状态见开发方案第 8 节。

## 架构方案

### 1. 总体目标与边界

程序提供 `svg>` 交互式 REPL，编辑一个 SVG 文档，并支持：

- `init`、`read`、`save`、`canvas` 文档操作；
- rect、circle、ellipse、line、text、g 六种内置图形的创建与属性编辑；
- `move`、`scale`、`set`、`delete`、`group`、`ungroup`、`addto`、`front`、`back`；
- `tree`、`show`、`help` 查询；
- 编辑命令的 undo/redo，以及 IO 命令后的历史锁定规则；
- 外部 SVG 缺少 id 时自动补 id 并输出 warning；
- 保存后可被浏览器直接打开，并能重新读回。

本阶段不实现 `box`。架构只为后续 ShapeProvider 插件预留注册边界，内核遇到 `box` 时输出 `error: unknown shape type: box (is the plugin loaded?)`。

### 2. 模块划分

代码按职责拆分为以下模块。每个类放在独立文件中，文件名与类名一致；模块内部通过接口和多态协作。

| 模块 | 目录 | 主要职责 | 允许感知的内容 |
|---|---|---|---|
| 领域文档 | `src/domain/document/` | `SvgDocument`、画布尺寸、根级图形集合、id 索引、父子关系和文档级约束 | SVG 文档语义；不感知终端和文件系统 |
| 领域图形 | `src/domain/shapes/` | `Shape`、`ContainerShape` 等抽象契约；封装公共属性、几何操作和子树遍历接口 | 图形语义与 Composite 操作 |
| 图形注册 | `src/shapes/` | 六种内置图形类、`ShapeFactory`、图形类型注册表和 SVG 属性映射 | 类型名到图形类的唯一工厂分派 |
| 命令 | `src/commands/` | `Command` 接口及每个编辑命令；保存执行前状态并实现 `execute` / `undo` | 领域对象和恢复状态，不读写终端 |
| 应用编排 | `src/application/` | `EditorSession`、命令注册与处理器、参数验证、`HistoryManager`、结果和 tree/show 格式化 | 命令、领域文档、工厂、IO 服务 |
| 输入解析 | `src/cli/parser/` | 通用词法解析：行拆分、双引号、整行注释；返回保留引号来源的词元 | 不按命令名或类型名二次分派，不改变领域状态 |
| CLI 界面 | `src/cli/` | REPL 生命周期、`svg>` 提示符、输入输出和错误前缀格式 | 应用层返回的结构化结果 |
| SVG IO | `src/io/` | XML 读取、序列化、缺失 id 自动分配、文件错误转换，以及外部解析禁用和输入资源限制 | 文档结构和图形工厂；不依赖 CLI |
| 测试 | `test/` | 领域、命令、IO、解析和 CLI 会话测试 | 被测公共接口 |
| 组合根 | `src/main.ts` | 实例化依赖、注册内置命令和图形、注入 IO、启动 REPL | 可依赖各模块用于装配 |

六种具体类型（含 `GroupShape`）只放在 `src/shapes/`，避免领域抽象与具体类重复归属。`SvgDocument` 持有领域抽象，负责统一维护树与索引；具体类不反向调用工厂。

阶段 3A 建立的结构基础：`SvgDocument` 是父子关系的唯一事实来源，Shape 不重复保存 parent/children；通过 `parentOf`、`childrenOf` 和 `walk` 查询，返回冻结的顺序快照。`insert`/`insertSubtree` 完整校验候选后才加入索引和树；`remove` 摘除整棵子树并返回冻结的 `ShapeSubtree` 拓扑，保留原 Shape 实例供恢复使用，不将其当作几何属性快照。命令恢复原位置时另行保存父节点和同级索引。跨文档的同一 Shape 实例在摘除前不得重复挂接；不同文档可以各自使用相同 id 的不同实例。4B 已接入子树移动/缩放及精确恢复，4C 接入受控属性修改；5A 补充受控拓扑准备与恢复。

阶段 3C 的查询实现：具体图形覆写 `Shape.geometry`，基类 `attributes` 合并显式公共样式，返回冻结的属性快照；GroupShape 沿用空几何视图。`DocumentFormatter` 只依赖领域抽象，迭代读取文档关系并生成 tree/show；不按 type/tag 判断具体几何。两种查询使用规范属性名，show 从 `parentOf` 读取真实父节点，根级显示 parent=svg。文本与有特殊字符的值转义为单行，原属性不变。它是应用层格式化职责，不新增 Strategy 模式。

阶段 4B.1：DeleteCommand 通过 SvgDocument.remove 摘除子树，保存冻结拓扑、原父 id 和原同级索引；undo 使用 insertSubtree 完整校验后恢复原实例。EditorSession 生成删除/恢复摘要，HistoryManager 将整棵子树作为一个历史单元；根级恢复显示 restored into svg，组内显示 restored into g#id。失败恢复不推进命令状态，修复冲突后可重试。

帮助同源：`CommandDispatcher` 的注册项同时保存处理器与语法回调；create 的回调枚举 `ShapeFactory` 同一类型表的 CLI 语法，内置语法直接由已有 schema 生成。回调在查询时求值，后注册的 CLI 类型也能显示，不执行参数解析或构造。扩展注册可同时提供 CLI parser 与语法；无 CLI parser 的内部类型不显示创建帮助。help 未初始化可用，只列当前已接入命令，后续阶段随命令注册补齐最终完整清单。

目标目录结构：

```text
src/
├── domain/
│   ├── document/
│   └── shapes/
├── shapes/
├── commands/
├── application/
├── cli/
│   └── parser/
├── io/
└── main.ts
test/
doc/
└── README.md
```

### 3. 运行时协作流程

一次编辑命令的调用链如下：

1. `Repl` 读取一行输入，由 `CommandParser` 跳过空行及整行注释；参数中的颜色 `#ffffff` 正常保留。
2. `CommandParser` 只产生词元请求并保留 quoted 信息，不负责按命令名或图形标签分派。
3. `EditorSession` 调用 `CommandDispatcher` 查找唯一命令注册项，由该项校验参数；create 通过 `ShapeFactory` 的类型注册项解析几何参数和尾部 `in`。
4. 应用处理器调用工厂构造未挂接的候选 Shape，再传给 `CreateCommand`；编辑命令只操作领域对象。read/save 等文档处理器在应用层调用 IO，不把 IO 注入编辑命令。
5. 编辑命令成功后进入 `HistoryManager` 的 undo 栈，并清空 redo 栈；失败时不修改文档也不入栈。
6. 应用层返回 `CommandResult`，由 CLI 统一输出成功摘要或 `error:` 信息。

`tree`、`show`、`help` 和无参数 `canvas` 不改变历史。成功的 `init`、`read`、`save` 和带参数 `canvas` 清空旧栈并设置 IO 锁定标记；undo/redo 报需求指定错误。下一次成功编辑建立新的历史并解除锁定；失败编辑和失败 IO 保留原文档、路径与历史。

`HistoryManager` 只在操作成功后移动栈项；撤销后只有新成功编辑会清空 redo。read 使用临时文档，save 先完整生成内容并写同目录临时文件，最终替换成功后才更新路径与历史。

当前实际流程为 `main.ts → Repl → CommandParser → EditorSession → CommandDispatcher → CommandResult → TerminalOutput`。`CommandRequest`、`CommandToken` 和 `CommandExecutor` 属于应用层边界契约；Parser 返回 skip/error/command，保留参数的值、顺序与 quoted 信息。REPL 对每行原文调用 Parser，词法错误只呈现，不调用执行器。EditorSession Facade 已接入 init/create/delete/move/scale/set/group/addto/ungroup/tree/show/help/undo/redo，命令名由 CommandDispatcher 唯一分派；候选文档构造成功后才替换当前文档并重置历史。ShapeFactory 同一注册项保存创建函数与 CLI 参数规则；按必填参数、可选样式、尾部未加引号 in 的顺序解析。CreateCommand 保存图形实例、父 id 和首次同级位置，DeleteCommand 保存完整子树及原位置，MoveCommand/ScaleCommand 保存已校验的几何前后状态，SetAttributeCommand 保存属性状态，GroupCommand/AddToCommand/UngroupCommand 保存受控拓扑变更；HistoryManager 调用 execute/undo，领域接口恢复实例、拓扑或数值。应用层生成成功及恢复摘要。查询和失败请求保留历史；undo/redo 先验证文档、参数，再检查锁定和空栈。

### 4. PlantUML 组件图

下图展示模块依赖，运行时返回值不另画反向依赖；组合根 `src/main.ts` 负责创建具体实现并装配。

```plantuml
@startuml
skinparam componentStyle rectangle

component "CLI REPL" as cli
component "Command Parser" as parser
component "Application\nEditorSession" as app
component "Command Dispatcher" as dispatcher
component "History Manager" as history
component "Command Objects" as commands
component "SVG IO" as io
component "Built-in Shapes\nFactory / Registry" as factory
component "SvgDocument" as document
component "Domain Shape\nAbstract Contracts" as shapes

cli --> parser
cli --> app
parser --> app : request contract
app --> dispatcher
app --> history
app --> factory : create candidate
dispatcher --> commands : editor handlers
history --> commands : execute / undo / redo
commands --> document
commands --> shapes : abstract interfaces
document --> shapes : abstract interfaces
app --> io
io --> factory
factory --> shapes : implementations of abstractions
io --> document

note right of dispatcher
已实现；按需求标记待重构的名字分派点 1：
命令名 -> Handler
end note

note right of factory
已实现；按需求标记待重构的名字分派点 2：
类型名 -> Shape
后续可接 ShapeProvider 插件
end note
@enduml
```

### 5. 设计模式及落地方式

#### Command：编辑行为的统一撤销边界

`Command` 的实际接口为 `execute(): void`、`undo(): void`；文档、目标图形等依赖在构造命令时注入，不再传入 context，也不向命令接口加入终端摘要。redo 对同一命令对象再次调用 execute。`CreateCommand`、`DeleteCommand`、`MoveCommand`、`ScaleCommand`、`SetAttributeCommand`、`GroupCommand`、`AddToCommand`、`UngroupCommand`、`ReorderCommand` 已实现这一接口。

成功摘要由应用层处理器依据已验证参数和目标对象生成，并转换为 `CommandResult`；CLI 只负责统一呈现。阶段 4A 的 HistoryManager 保存命令及应用层提供的撤销/重做反馈，操作成功后才返回相应反馈；不让 commands 反向依赖应用层结果、终端或历史。领域恢复由命令负责，历史层不按命令名判断摘要或操作。

4A 已实现 `HistoryManager.execute(command, feedback)`、`undo()`、`redo()` 与 `resetAfterIo()`，并接入 EditorSession。反馈在执行前复制并冻结；执行成功才入 undo 栈、清空 redo 并解除 IO 锁定，undo/redo 成功才移动栈顶。成功 init 重置两栈并锁定；read/save/canvas 后续复用该接口。历史管理器不修复命令的部分写入，`Command` 契约要求失败时领域状态不变。撤销 create 输出 `类型#id removed`，重做复用首次创建摘要（含父容器）。

每条编辑命令对应一个 undo 单元。从首次接入 create 开始就走 Command 路径，不先实现一条绕过历史的直接编辑路径。命令保存父节点、同级位置、旧属性或封装快照；先验证完整候选结果再写入。move/scale 恢复旧几何值，不仅使用逆运算，以免浮点误差积累；redo 复用保存结果。`GroupCommand` 即使移动多个图形，也只作为一个命令进入历史栈。

文档操作采用相同的应用入口，由应用层文档处理器负责，编辑 Command 不持有 IO 服务。只有成功的文档操作清空历史并锁定，符合需求中“undo not allowed after io command”的规则。

#### Composite：统一容器与叶子操作

`Shape` 是所有图形的共同抽象，`ContainerShape` 提供容器契约，`GroupShape` 是具体实现。4B 的统一几何操作由 `SvgDocument` 按唯一拓扑迭代汇总各 Shape 的本地准备结果：叶子经 `GeometryShape` 校验坐标/尺寸，容器本地为空操作，子孙各处理一次。整个子树准备成功后才应用 `GeometryChange`，避免递归调用栈及中途失败造成部分修改。GroupShape 不另存 children；命令无需区分容器与叶子。4C 的 attributeType/prepareSet 多态接口分别提供属性类型白名单和已校验的本地 AttributeChange；公共样式由 Shape 处理，数值几何沿用 GeometryShape 的坐标轴/尺寸声明，TextShape 补充 text。领域接收 number/string，不负责 CLI 数字转换。SetAttributeCommand 保存前后状态，撤销缺省样式时恢复 undefined，使属性重新缺失，不写入渲染默认值；容器属性不传播。删除和重组通过统一子树接口维护索引与归属。XML 生成仍位于 IO 层。

`GeometryChange` 封装已校验的前后状态及只赋值的 apply/restore；准备阶段允许失败但不得修改模型，应用/恢复阶段不得抛错。`GeometryCommand` 使用局部 **Template Method**：固定快照保存与执行/恢复生命周期，MoveCommand/ScaleCommand 只覆写准备钩子，redo 重用保存结果。数值视图冻结，文字和样式不参与运算；scale 乘全部坐标和尺寸，文本仅有 x/y 数值，不扩大字体，stroke-width 不变。有限下溢为零可接受，非有限结果拒绝；极小倍数的撤销同样恢复原值，不依赖除法。扩展 Shape 未实现相应准备时明确拒绝，不能静默跳过；扩展若提供该接口，也必须遵守上述契约，本阶段不承诺任意插件的事务隔离。

5A 的 `SvgDocument.prepareGroup`、`prepareAddTo` 返回 `TreeChange`，只捕获受影响记录和必要的根顺序，前后拓扑封装在文档内部闭包。每次 apply/restore 先验证预期实例、关系、归属及最终父链无环，全部通过后统一写入；失败不推进命令状态，冲突消除后可重试。GroupCommand/AddToCommand 缓存同一变更，undo/redo 精确恢复原父节点、同级顺序和实例，不重新解析输入。同父 group 占最早选中位置，跨父 group 放根末尾，孩子按操作前文档顺序；addto 放目标最后位置，同父也移到末尾。两者均不修改本地几何、样式或文本，重新归属可能改变继承后的呈现。反馈仍由应用层生成并由历史项冻结保存。

5B 的 `SvgDocument.prepareUngroup` 同样返回 TreeChange，将嵌套组的直接孩子按原顺序替换组所在同级位置；更深子树保持原结构。ContainerShape 的 `canUngroup` 默认 false，普通 GroupShape 显式覆写为 true；按能力校验后检查顶层限制，不根据 type 名判断或在领域引用具体 GroupShape。空嵌套组可以解散；UngroupCommand 保存同一变更，undo 恢复原组实例、属性、父关系和位置，redo 重用保存结果。所有本地属性保持原值，不补偿移除组造成的继承变化；冲突失败不写入且可重试。应用层按直接孩子数生成 `类型#id ungrouped; N children promoted into 类型#原父`，undo 为 `类型#id restored with N children`，身份转义与查询保持一致。

5C 的 `SvgDocument.prepareReorder(id, position)` 返回 TreeChange，`front` 对应 end，`back` 对应 start。只调整原父的同级序列（含 svg 根），目标记录同时参与对象身份校验；不摘除子树、不改变 parent、属性或后代顺序。ReorderCommand 缓存前后拓扑，undo 精确恢复位置，redo 不重新计算；边界位置与唯一同级仍作为一次成功编辑并清空 redo。应用层显式登记两个命令并注入方向、语法和反馈，共用处理器，不读取命令名再次分派。成功/重做为 `类型#id brought to front` / `sent to back`，撤销为 `类型#id sibling order restored in svg` 或实际父身份；反馈由应用层生成，HistoryManager 保存。

`group`、`addto`、`ungroup` 改变树关系；front/back 改变同级绘制顺序；move/scale 通过多态作用于子树。g 的 set 修改容器自身样式，保留 SVG 继承语义，不覆盖后代显式样式。普通 g 只有在嵌套时允许 ungroup，顶层 g 必须拒绝；未来插件的内部复合图形可通过容器能力契约拒绝解散。

#### Factory / Registry：隔离类型创建与扩展

`ShapeFactory` 将 `rect`、`circle`、`ellipse`、`line`、`text`、`g` 映射到具体类，并提供注册接口。读入 SVG 时由同一个工厂创建节点，避免 IO 层直接实例化具体图形。未注册类型统一生成未知类型错误。

注册项同时提供 CLI 参数与 SVG 元素构造入口，所有类型名查找集中在同一工厂。当前预留注册边界，后续可扩展为 `ShapeProvider` 的模板、set 传播和 data-kind 读回能力；本阶段不实现完整插件协议，也不新增 box 分支。

#### IO 隔离：按实际变化需求预留接口

`SvgReader`、`SvgWriter` 的边界隔离 XML 与文件系统，通过应用层使用。当前 id 分配和格式化只有单一规则，不额外拆 Strategy；等出现可替换算法时再评估，避免为了使用模式而增加类。

#### Facade：应用层的稳定入口

`EditorSession` 对 CLI 暴露稳定的执行入口，集中持有当前文档、工厂、IO 服务和历史管理器。CLI 不需要了解命令内部如何修改树；未来接入 GUI 或 HTTP 适配器时，可以复用同一应用入口。

### 6. 依赖方向规则

允许的依赖方向如下：

- `cli → application、cli/parser`：CLI 只处理交互和展示。
- `cli/parser → application`：解析器只构造结构化请求，不直接写文档。
- `application → commands、domain、io、shapes`：应用层负责组合依赖和生命周期。
- `commands → domain`：命令只通过领域接口完成编辑和恢复。
- `io → domain、shapes`：读写层把 XML 转为领域树或把领域树序列化为 XML。
- `shapes → domain`：具体图形实现领域抽象。
- `test → 任意生产模块`：测试只依赖被测公开接口。
- `main.ts → 上述模块`：组合根负责实例化和注册，是明确的装配依赖例外。

以下依赖禁止出现：

- `domain` 不得依赖 `cli`、`application`、`io` 或具体命令类；
- `commands` 不得直接调用终端 API 或文件系统；
- `shapes` 不得依赖命令分发器；
- `io` 不得依赖 CLI 的文本输出格式；
- 具体图形不得通过全局变量查找文档或其他图形。

理由是把 SVG 语义和树操作留在核心，把终端、命令语法和文件格式放在边界；这样每一层都能独立测试，也能在不改领域模型的情况下替换交互界面或 XML 实现。

按名字分派只保留两个位置：命令分发器的“命令名 → 处理器”和图形工厂的“类型名 → Shape 类”。两处均标注为**待重构点**：本阶段集中注册已足够，未来再评估动态注册发现机制。Parser、IO 和 tree/show 不得另设同类分派。

### 7. 变化点假设与预留取舍

1. **图形类型扩展**：最可能增加 box 等复合图形。预留 `ShapeFactory` 注册接口，后续再扩展为完整 ShapeProvider；本阶段不在核心命令中写 `box` 特判。
2. **命令语法扩展**：可能增加命令、别名、脚本或更严格的参数校验。预留 Parser 与 Command 分离；当前不为 GUI 手势设计另一套语法抽象。
3. **SVG 格式读写变化**：可能更换 XML 库、格式化策略或支持更多元素。隔离 `SvgReader`/`SvgWriter`；set 仅接受白名单，读入则保留六种支持节点上的附加普通属性和根 viewBox。transform 保留而不展开，未知图形标签明确拒绝；具体边界见开发方案，不承诺完整 SVG/CSS 引擎。
4. **撤销历史策略变化**：可能支持命令宏、历史持久化或更高效的快照。保留 Command 的执行/撤销边界和 `HistoryManager`；当前按单条命令保存恢复信息。
5. **交互渠道变化**：可能增加 GUI 或 HTTP API。由 `EditorSession` 返回结构化 `CommandResult`；当前不把展示字符串写入领域对象。
6. **文档规模变化**：未来可能处理更大的 SVG。当前先保证模型清晰和状态正确，不提前引入缓存、数据库或复杂增量索引；只有性能测试显示需要时再调整。

## 过程记录

本节只记录从已生成的文档或代码中发现的问题、确认方式和纠正动作。实现推进后按“问题 → 证据 → 修正”追加，不记录没有技术结论的流水账。

### 2026-10-26：初始化文档内容的校验

- **问题**：首次生成文档后通过 `Get-Content` 检查，发现 `doc/README.md` 实际为空，之前的写入命令没有把多行内容正确传入文件。
- **确认**：直接读取文件并检查 Git diff；提交中只有需求文档的新增内容，架构文档没有有效文本。
- **纠正**：改用补丁方式完整写入文档，并在提交前重新读取文件、检查 Git 状态和提交内容。

### 2026-10-26：审查生成的开发建议与架构基线

以下只记录本次从生成方案和既有文档发现的问题及修正，不将计划中的功能写成已经实现。证据来源为开发建议的阶段安排、本文原架构和需求 2.1、3、4.1—4.3。

| 发现的问题 | 确认依据 | 修正方式 |
|---|---|---|
| init 排在 IO 阶段，create 又先于 Command | 原建议第三阶段验收 CLI create，第六阶段才实现 init，第四阶段才引入 Command；当前文档前置条件和编辑路径不成立 | 阶段 3 提前接入 init，首个 create 就封装 Command；History 在阶段 4 扩展 |
| 领域和具体图形重复归属 | 原模块表同时在 domain/shapes 和 shapes 放叶子及 GroupShape | domain 只放图形抽象；六种具体类型及工厂放 shapes，同步修订模块表与图 |
| Parser 和工厂可能各建类型分发表 | 原 Parser 职责含所有命令参数和 in；需求 2.1 限定两处分派 | Parser 仅处理词元，命令注册项校验命令参数，工厂注册项校验类型参数；统一供 CLI 与 SVG 读入使用 |
| 编辑命令接收 IO 与只依赖 domain 冲突 | 原协作流程向命令注入工厂和 IO，但依赖规则只允许 commands → domain | 应用层先构造候选 Shape；CreateCommand 只接收领域对象；文档处理器在应用层调用 IO，明确组合根装配例外 |
| 单一实现仍拆 Strategy，且插件承诺超出阶段 | 原文列出 id/格式化多种策略并暗示完整 box 插件协议已可使用，实际本阶段未实现 | 保留 Reader/Writer 与注册边界，取消额外 Strategy；完整 ShapeProvider 留待后续 |
| 普通 g 的 ungroup 描述缺少顶层限制 | 原文称普通 g 允许解散，而需求 4.2 禁止顶层 g 解散 | 修订 Composite 描述，并把顶层拒绝、嵌套提升、原位恢复加入阶段 5 验收 |
| 仅校验异常不足以证明失败状态不变 | 需求要求失败不改任何状态，原建议没有覆盖历史、路径、多节点和中途溢出 | 补充完整候选验证、旧几何状态恢复、临时文档与文件替换；测试比较文档和后续历史行为 |
| 缺 id 补全可能撞上文件后部已有 id | 需求同时要求自动补 id 和全局唯一，原建议未给冲突算法 | 先收集显式 id，再跳过占用值生成；重复显式 id 拒绝，阶段 6 加入 fixture |
| #、in、g set 与外部属性的边界不清 | 参数有 # 颜色与引号文本，set 白名单不等于读入可丢弃额外属性；原建议未规定处理方式 | 执行方案区分明确需求与默认决策，补充词法、继承、scale、transform 和未知元素测试边界 |
| 阶段较大，验收未覆盖完整架构约束 | 基础编辑阶段含多个命令和历史，容易大提交；最终检查缺少实际 import 和模式证据 | 拆分 3A—6C 等提交点，模块完成即反馈并 push；最终自查必须引用实际文件和验证结果 |

此次形成根目录 `DEVELOPMENT_PLAN.md` v1.0，并将架构修订为 v1.1。尚未实现生产代码，默认语义及测试计划将在对应阶段落地验证。

### 2026-10-27：复核执行体系审核并补齐交付门槛

本次根据审核意见重新检查自己生成的 `DEVELOPMENT_PLAN.md` v1.0、根 README 和本文，确认以下缺口真实存在，采纳四项主要建议。它们补充执行与交付要求，不改变模块和设计模式；尚未将 CI 或输入限制实现为代码。

| 发现的问题 | 确认依据 | 纠正方式 |
|---|---|---|
| 阶段复选框只有完成/未完成，且开头状态描述会过时 | v1.0 第 8 节只有 15 个勾选项，没有进行中、验收证据、实现 SHA、CI 或阻塞记录 | 改为五态进度表和阶段记录模板；完成需验收、推送和该实现提交的 CI 证据。反馈持续说明已完成、证据、阻塞和下一步 |
| 记录 SHA 容易形成自引用，审核意见未说明如何维护 | 如果把记录文件所在提交的 SHA 写入文件，修改文件又会产生新 SHA | 实现提交验收后用独立小文档提交记录其 SHA；记录提交自身的 push/CI 在阶段报告核实，最终 tag 仍需指向通过检查的最终提交 |
| 使用者交付缺少根 README | 根 README 只有项目标题，v1.0 阶段 7 关注课程验收但没有使用说明清单 | 阶段 1 先交代环境与可用入口，阶段 7 完成交接：安装、启动、示例、预览、SVG 范围、限制和文档链接；保持课程/个人工具定位，不增加 npm 发布流程 |
| 本地检查无法保证后续提交重复通过 | v1.0 有 typecheck/build/test，但无 Node/npm 基线、CI 和格式门槛 | 采用 Node.js 24 LTS，在阶段 1 确定 npm 主版本；加入 Windows/Linux push/PR CI、npm ci 和 Prettier 检查，不设置任意覆盖率目标 |
| CI 成功不能自动等同全部验收 | 提示符、实际浏览器显示和架构抽样不完全被自动化任务覆盖 | 精确记录 CI 对应 SHA 与链接，并保留交互/浏览器手工证据；不默认修改分支保护配置 |
| SVG 读入缺少外部实体与解析期间资源限制 | v1.0 规定临时文档和失败恢复，但未禁 DTD/外部资源，也未限制输入大小、深度和节点数 | 阶段 6 选库时验证并禁用外部解析；初始预算 5 MiB、128 层、50,000 元素，解析期间检查，边界与超限测试通过后落实到实现和 README |
| 资源限制值与安全承诺需要限定 | 审核建议值按库能力确定；仅限制 XML 不会消除保留属性中的浏览器行为 | 将限值标为待阶段 6A 验证的初始预算，调值须有证据；不把读写器宣传为 SVG 净化工具，也不声称已安全处理任意外部 SVG |

修订结果：根开发方案 v1.1，新增持续状态与证据记录、使用者交付清单、仓库级门槛及 XML 输入边界。所有实现阶段仍为未开始，当前无生产代码测试或 CI 通过证据。

### 2026-10-27：工程和 REPL 实现中的问题校验

| 发现的问题 | 确认依据 | 纠正方式 |
|---|---|---|
| 初选测试框架版本带入已知漏洞，镜像源不能提供有效审计 | 安装 Vitest 3 后在 npm 官方源执行 audit，报告 3 项漏洞（1 moderate、2 critical）；本地镜像源的 audit 接口返回 404，不能作为无漏洞证据 | 更新至 Vitest 4.1.12，使用官方源生成锁文件并重新安装、审计，结果为 0 漏洞；不将镜像源审计不可用写成通过 |
| 工程骨架允许没有测试仍成功，且类型检查只覆盖源码 | 检查生成的脚本发现 `--passWithNoTests`；tsconfig 只包含 src，测试中的类型错误可能不被 tsc 检出 | 加入真实输入循环和入口测试后移除空测试放行选项；增加 tsconfig.test.json，typecheck 同时检查 src 与 test |
| 首次 CI 在 Windows 格式检查失败，Linux 成功 | `a65140f` 的 CI 40461811313 中 Windows 的 format:check 失败、后续检查跳过，Linux 成功；尚未获取原始失败日志，按平台换行差异假设修正并重跑 | 独立提交 `9ca1c8a`，通过 .gitattributes 固定文本 LF、Prettier 显式 endOfLine=lf；CI 40462330364 在 Windows/Linux 均通过，确认该修正消除了跨平台格式失败，不据此断言已读取失败日志 |
| REPL 的关闭状态和提示符实现没有覆盖提前 EOF | 首次访问非公开的 reader.closed 导致 TS2551；改用无条件 prompt 后，预缓冲输入的 4 项测试报 `readline was closed`，证明 EOF 到达时仍可能有待处理行 | 用公开 close 事件记录关闭；真实终端仅在未关闭时调用 prompt，管道独立写提示符并继续消费队列。加入空 EOF、末行无换行、异步顺序测试；10 项测试及 Windows 真实终端 Ctrl+D 验收通过 |
| 文档仍称“没有生产代码”和“REPL 未实现” | 对照新增 src/cli、应用结果契约和 2 个测试文件，根 README 与一致性自查已经过时 | 同步当前可用行为、暂不支持的业务命令、实际依赖和验收证据；保留以日期标记的旧审查结论作为历史，不把计划模式写成已落地 |

### 2026-10-27：复核阶段一测试覆盖建议

两项建议均采纳，属于回归证据补强，不是已确认的运行缺陷。检查自己生成的 `Main.test.ts`，仅有 tsx 源码子进程测试；REPL 测试将异步执行顺序和输入流失败分开验证，没有交叉场景，手工补查无法持续防止回归。

- **编译入口**：将入口测试参数化，同时启动源码与 `dist/main.js`，断言欢迎语、过滤、错误及 EOF 退出。增加 npm 的 pretest 构建钩子，确保本地 `npm test` 和 CI 都先重新构建，不依赖遗留 dist；CI 的独立构建步骤并入该钩子，避免重复构建。
- **异步中输入失败**：用受控 Promise 确保执行器尚未完成，再销毁输入流，确认错误事件已发生后才释放执行器；断言 REPL 最终拒绝原输入错误且没有多次执行。验证通过，无需修改 REPL 生产逻辑；不以计时 sleep 制造竞态。
- **结果**：2 个测试文件、12 项测试通过（原 10 项全部保留，新增编译入口和交叉场景各 1 项）。推送与 CI 证据在开发方案中追加。

### 2026-10-27：Parser 边界与生成测试的校验

- **问题**：生成方案要求保留 quoted 标记，却未规定部分引号拼接时的含义；同时阶段 2 写“测试注册项契约”，阶段 3B 才引入分派注册项，容易提前增加占位框架。
- **确认**：对照开发方案阶段 2/3B 和 `in` 必须为尾部未加引号子句的约束；`"in"suffix` 若接受拼接，将无法仅用布尔标记表达整词来源。
- **修正**：双引号只包裹完整词元，拼接报受控词法错误；Parser 对未知命令、类型、非法数值和参数数量不做语义判断。阶段 2 建立只读请求与执行器契约，注册项与语义测试明确随阶段 3B 实现。
- **生成测试问题**：末尾反斜杠 fixture 最初使用 raw 模板字符串，反斜杠转义了模板结束符，Prettier/Vitest 均报告未闭合字符串，尚不能验证 Parser。改为显式转义的普通字符串后，24 项词法测试和原 12 项回归全部通过；不将测试文件的语法错误误认为解析器缺陷。

### 2026-10-27：复核图形工厂的扩展边界

- **问题**：生成的扩展 specification 使用任意字符串类型，可能以 `g` 等内置名字携带扩展 properties；原工厂直接断言类型，且未验证扩展回调返回的节点身份。扩展回调若返回其他 id/type，会破坏后续文档索引和序列化的一致性。
- **确认**：检查 `ShapeCreationSpecification` 的联合类型与注册表调用边界，新增内置名字扩展 payload、覆盖内置注册、返回错误 id/type 的测试。
- **纠正**：保留唯一类型注册表；内置与扩展构造数据入口互斥，重复注册拒绝且不替换原项，构造结果核对 id/type。接口命名为 `register`，仅承诺未来类型扩展点，不将其描述为已实现插件加载协议。六种内置构造器校验有限几何值及非负尺寸/描边宽度。
- **阶段边界复核**：只读 getter 是字段封装，并不要求采用不可变对象替换策略；几何运算与受控状态恢复仍随阶段 4B/4C 引入。当前不提前实现编辑命令，也不把图形构造验收冒称为 Composite 移动/缩放验收。

### 2026-10-27：真实入口接线后的文档一致性校验

- **发现**：接入 EditorSession/init 后，根 README 和架构运行流程仍宣称真实入口只返回阶段占位错误，与新代码及入口测试不符。
- **确认**：对照 main.ts 的实例化、EditorSession 的 init 注册以及源码/编译入口子进程输出，确认已能创建画布；create、历史与 IO 此时尚未接入。
- **修正**：同步欢迎语和当前接线与功能边界，保留未实现能力的说明。验收用真实入口断言成功摘要，避免只有注入的假执行器测试通过。

### 2026-10-27：create 参数边界与可扩展接线校验

- **发现**：最初生成的工厂 CLI 适配器只返回 specification，把 parentId 固定为 null；若继续在 EditorSession 扫描 in，则既会丢失嵌套语义，也会把类型参数知识移出注册项。另一个数值隐患是 Number(空字符串/纯空白) 得到 0，可绕过“非数值拒绝”的意图。
- **确认**：对照需求 create 类型参数和尾部 in 规则，以文本 "in"、id in、带样式嵌套及空字符串坐标构造回归输入；检查注册项与应用处理器之间的返回数据，确认原适配器没有父容器信息。
- **纠正**：注册项返回 specification 与 parentId；schema 先消费必填参数，再处理可选样式及尾部未加引号 in。数值转换前拒绝空/纯空白，再验证有限值，非负尺寸由图形构造器约束。增加状态快照比较，确认错误参数、重复 id 和错误父目标不改变树、索引及顺序。
- **依赖修正**：工厂使用 shapes 内的只读 ShapeCliToken 结构边界，与应用词元结构兼容，不反向 import application/CLI。为注册入口增加可选 CLI 解析回调，测试新增 marker 类型可通过同一 create 路径；这只是扩展验证，不实现 box 或插件加载器。

### 2026-10-27：查询属性边界与显示安全校验

- **发现**：已有图形类只提供各自 getter，缺少统一属性入口；直接让 tree/show 读取具体类会使显示层知道全部图形类型。已有模型还允许文本、id 和样式含换行等字符，直接插值会破坏树的行结构。
- **确认**：逐项检查 Shape 和六种具体类的公开接口；用包含中文、引号、反斜杠、换行、控制字符的 TextShape 作为查询输入，并以自定义 marker 类型检验扩展是否要求修改格式化器。
- **纠正**：提供只读 geometry/attributes 视图，将样式合并留在 Shape，排版和字符转义留在 DocumentFormatter。tree 迭代遍历而不递归调用，测试 1500 层领域树；六种图形、缺省/显式样式、真实父关系、子树和失败状态均有回归。查询没有引入新的名字分派或编辑命令，完整历史仍留待 4A。

### 2026-10-27：帮助清单与执行能力的一致性复核

- **发现**：原分派器只保存处理器，工厂已有参数 schema 却不暴露帮助。单独硬编码 help 清单会复制类型列表；若一次列出后续全部命令，又会把尚未实现的 undo/read 等显示为可用。
- **确认**：对照 CommandDispatcher 注册表、ShapeFactory 的六种 schema 及当前 EditorSession 接线，确认本阶段实际只具备 init/create/tree/show/help；最终需求的“全部命令”须随后续阶段补齐。
- **纠正**：语法与处理器/图形 parser 保存在原有注册项，内置 create 语法由 schema 生成；help 动态枚举当前可执行注册信息并注明阶段范围。用后注册 marker、无 CLI parser 类型、未初始化 help、错误参数和两种入口会话验证同源行为及状态不变，不新增名字分派。
- **自查修正**：初版扩展帮助缺省为 `<id> [parameters]`，但注册回调可能要求必填参数，无法从任意 parser 推断。改为明确提示附加语法未提供；注册者可传入准确语法，测试覆盖两种情况，不把未知参数错误标为可选。

### 2026-10-28：复核 Command 契约与帮助登记约束

- **发现**：架构模式段仍写 execute(context)/undo(context) 与命令摘要，实际 Command.ts 和 CreateCommand.ts 已采用构造注入、无参方法；CommandDispatcher 的 syntax 默认值只回显名称，后续带参命令遗漏语法时不会被发现。
- **确认**：对照接口、构造器及 EditorSession 的成功结果生成位置，并检查当前五个注册项均已显式传入语法；这是文档偏差和后续登记风险，不是当前命令运行缺陷。
- **纠正**：文档以无参接口为准，明确应用处理器生成摘要，4A 的历史项保存应用层反馈。移除 syntax 默认参数，类型层要求显式登记，同时对运行时缺失回调拒绝且不占用名称；测试验证漏填不能编译、不能注册，随后可正确登记。保留回调的动态求值，不额外引入帮助清单或名字分派。

### 2026-10-28：历史接线中的父容器错误与残留文档校验

- **发现**：为在编辑前生成摘要，初版接线把父 id 直接交给 require，缺失父目标会变成 no such shape，而原 CreateCommand 按容器查询应报 no such container。另发现模块表仍写命令感知“命令结果”，与刚明确的无参 void 契约不一致。
- **确认**：对照 SvgDocument.require/childrenOf、原 create 错误断言和 Command 接口；缺失与非容器父目标是既有验收要求，不能因摘要职责调整而改变。模块表与模式段交叉核对确认残留表述。
- **纠正**：应用处理器先验证容器，再生成反馈并交给 HistoryManager；CreateCommand 仍保留自身校验。原错误断言继续通过，新增查询/失败请求保留 undo 与 redo 的会话测试。模块表改为感知领域对象与恢复状态，摘要仅归应用层；同步移除“CLI 未开放历史”的过时说明。

### 2026-10-28：只读几何模型与子树原子移动的衔接

- **发现**：已有叶子只提供 readonly 数字字段和只读视图，不能受控修改；原架构“容器递归执行”若直接逐个改子孙，会在后代溢出时留下部分变更，也容易迫使 GroupShape 复制文档已有的 children。
- **确认**：检查五种叶子、Shape、GroupShape 与 SvgDocument 的字段归属；构造前部正常、末端极大坐标的组，要求移动失败后所有节点属性、索引和拓扑均与之前相同。0.1 加 0.2 的恢复测试确认逆算不适合作为精确 undo。
- **纠正**：数值封装收拢到 GeometryShape，具体类声明坐标轴/尺寸并保持原 getter；文档迭代准备整棵子树的多态 GeometryChange，全部校验后统一应用。命令保存前后值供 undo/redo，不做逆算；用 2000 层容器、末端溢出、未支持移动的扩展类型及样式/文本保持验证。同步修正 Composite 的具体协作描述，不重复保存树关系。

### 2026-10-28：属性修改入口与缺省样式恢复校验

- **发现**：现有 Shape 样式和 TextShape 文本仍为 readonly 字段，没有受控 set 入口；attributes 仅包含已存在值，若据此判断可编辑属性，会错误拒绝缺省的 fill/stroke/stroke-width。把缺省样式恢复成 black/none 也会改变后续 SVG 继承语义。
- **确认**：逐项对照需求 4.1 白名单与现有 getter/attributes，使用缺省样式、空字符串、none、零描边宽度及嵌套容器构造恢复测试；检查原实现字段声明，确认需要补充受控修改能力，而非开放字段赋值。
- **纠正**：增加与属性是否存在无关的 attributeType 白名单和 prepareSet；所有校验在变更前完成，AttributeChange 捕获前后值，SetAttributeCommand 复用同一快照重做。恢复 undefined 后 attributes 省略该键，g 只修改自身；公开 getter/视图仍只读。命令仅依赖领域及 Command，不为属性名字新增命令/图形类型分派，也不把样式/文本修改强行并入几何运算。

### 2026-10-28：基础编辑完成后的架构状态交叉核对

- **发现**：架构首页已更新基础编辑进度，但 Command 模式正文仍仅写 CreateCommand 已实现，把 Delete/Move/Scale/SetAttributeCommand 列为后续；组件图仍把两个名字注册点标为待重构，正文与实际实现状态不一致。
- **确认**：逐项对照 commands 下的接口实现、EditorSession 注册项与 CommandDispatcher/ShapeFactory 的真实注册表，确认这是遗留文档状态，实际已通过的基础编辑和两个分派点不需要重新实现。
- **纠正**：正文明确已实现的五个编辑命令，图中两个分派点改为已实现；仍将 Group/Ungroup/AddTo/Reorder 与 IO 保留为后续范围。阶段进度和提交/CI 证据集中在开发方案第 8 节，避免把历史记录当作当前状态。

### 2026-10-28：组合操作的原子拓扑变更与分派标记复核

- **发现**：既有文档只提供整棵子树插入/摘除接口，直接用多次 remove/insert 编写跨父 group，会把完整校验分散在多次写入之间；撤销也可能在中途冲突后只恢复部分选择。另发现上一条记录把图中的“待重构”误读为“尚未实现”，删去了需求要求的标记。
- **确认**：检查 SvgDocument、CreateCommand/DeleteCommand 的恢复边界；以跨父选择、祖先后代同时选择、撤销前组内出现额外节点、重做前 id 被占用/实例被其他文档占用等场景验证失败前后树和归属完全一致。重新核对需求 2.1 的两处分派限制，确认“待重构”与当前是否实现是独立含义。
- **纠正**：由 SvgDocument 准备受影响节点及必要根顺序的前后拓扑，TreeChange 封装应用/恢复；每次先检查全部预期关系、实例和归属，再一次写入。GroupCommand 缓存同一变更供精确 undo/redo；不修改本地属性、不复制第二份可变树。图中同时写明“已实现”和“按需求标记待重构”；保留上条作为历史，并以本条纠正其对标记的解释。

### 2026-10-28：拓扑恢复遗漏间接祖先变化的回归

- **发现**：5A.1 的 TreeChange 已检查受影响记录与根顺序，但仅凭直接 parent/children 一致仍不足以证明恢复后无环。调用领域接口把更高祖先移到源子树深处，可能保持被检查记录和根顺序不变，却让下一次 apply 或 group undo 形成间接环。
- **确认**：构造源 → 深层容器及目标 → 多层祖先的场景；先准备收编/执行跨父 group，再移动不在受影响记录中的祖先。临时移除新增父链检查后，两项针对性回归均以“应抛错但未抛错”失败；恢复检查后两项通过。验证失败前后完整可观察结构一致，并在撤销中间操作后成功重试。
- **纠正**：共享拓扑提交先按目标记录覆盖现有关系，迭代检查最终父链无环且所需父记录存在，再写入任何索引或关系。已验证祖先复用检查结果，不递归、不快照整份文档；group 与 addto 的执行、撤销、重做都受此保护。普通 CLI 连续操作依然按 HistoryManager 的 LIFO 恢复，不把该领域恢复边界误称为已发生的终端会话缺陷。

### 2026-10-28：容器归属与可解散能力的边界

- **发现**：ContainerShape 只表达可持有子节点，尚无可解散能力；若直接允许所有容器 ungroup，会无法表达需求规定的复合图形拒绝。按 type 判定普通 g 则会在领域增加第三个名字分派点。既有 TreeChange 可恢复受影响关系，不需要通过多次 remove/insert 实现提升。
- **确认**：对照 ContainerShape、GroupShape、SvgDocument 与需求 2.1/4.2，确认可嵌套与可解散是独立约束。用仅继承 ContainerShape 的测试容器验证默认保护，普通 g 验证原位提升；顶层普通 g 继续返回指定错误。
- **纠正**：ContainerShape 提供默认 false 的 canUngroup，GroupShape 显式覆写为 true；文档先按能力及顶层限制校验，再准备原子拓扑变更。UngroupCommand 复用 TreeChange 和既有 Command 生命周期，undo 恢复原实例与顺序；本地属性不做继承补偿。没有新增 box、插件加载器或按图形名分派。

### 2026-10-28：单行解析与结构化接口的测试边界

- **发现**：初版 UngroupSession 的特殊 id 参数化用例将实际换行放入 executeLine，试图同时验证 CLI 输入与单行转义反馈，混淆了输入限制和应用接口可表达的值。
- **确认**：测试失败于 executeLine 的 expected command，尚未调用 EditorSession；检查 CommandParser 确认其按既有契约返回 expected a single input line，且只解释引号与反斜杠转义，不把字面量反斜杠 n 转换为换行。放宽 Parser 会破坏既有边界。
- **纠正**：普通 in、# 与带空格中文 id 继续走 Parser；换行 id 改为通过结构化 CommandRequest 创建和解组，断言成功/撤销反馈转义为单行且存储值保持原样。真实 CLI 继续覆盖未闭合引号失败后 redo，不增加多行输入或新的转义语法。

### 2026-10-28：排序回归测试复用既有属性契约

- **发现**：新生成的 ReorderCommand 测试为验证“撤销排序不覆盖后来属性修改”，误调用了不存在的 prepareSetAttribute，和现有 Shape 契约不一致。
- **确认**：首次类型检查报告 TS2339；24 项专项测试中对应根级/嵌套两项均在调用该方法时失败，其余 22 项通过。核对 Shape 与 SetAttributeCommand，实际受控属性入口为 prepareSet；失败尚未进入排序撤销逻辑。
- **纠正**：测试改用既有 prepareSet('fill', 'blue').apply()，不新增重复属性接口。两项测试通过，且验证 undo 只恢复拓扑、不覆盖后续样式或无关深层子树变动；完整回归通过。此项是测试契约错误，不把它描述成生产排序缺陷。

## 一致性自查

阶段 2 实际源码抽样（2026-10-27）：

1. **模块划分与封装**：`src/cli/Repl.ts`、`TerminalOutput.ts`、`src/cli/parser/CommandParser.ts` 各自单类同名文件；REPL/输出使用私有字段，Parser 无跨行可变状态。application 的请求/词元为只读传输契约，执行器为接口，不承担领域模型职责。`src/main.ts` 显式装配 Parser 和执行器。已删除临时 `src/cli/LineExecutor.ts`；领域、命令、图形与 IO 按后续阶段建立，没有空类占位。
2. **依赖方向**：逐项检查实际 import：CLI 依赖应用契约与内部 Parser；Parser 仅依赖 application 的请求/词元类型；application 契约只互相引用，不依赖 CLI 或 Node IO；组合根依赖 CLI 与应用契约；测试依赖公开接口与 Node 流/进程。未发现反向依赖。Parser 没有按命令名或图形名分派，计划中的两处注册表仍未实现。
3. **模式实际状态**：使用依赖注入隔离终端、Parser 和结构化执行器，尚未实现业务 Command、Composite、Factory/Registry 和 Facade。只读请求契约不等于业务 Command 对象；后续首个 CreateCommand、图形树及 EditorSession 落地时补充实际证据，不提前计入模式使用。

阶段 3A 增量源码抽样（2026-10-27，补充上面的历史检查）：

1. **模块与封装**：抽查 `src/domain/document/SvgDocument.ts`、`src/domain/shapes/Shape.ts`、`ContainerShape.ts` 及 `src/shapes/RectShape.ts`、`TextShape.ts`、`GroupShape.ts`、`ShapeFactory.ts`。生产类均一类一文件、字段私有；图形公开只读 getter。文档独占索引和关系存储，不公开可修改集合；内部 `DocumentNode` 和只读 `ShapeSubtree` 是关系记录，不代替领域对象行为。
2. **依赖方向**：`SvgDocument` 仅依赖领域图形抽象与拓扑类型；六种具体类型只依赖领域抽象；工厂依赖具体类型与创建 specification；领域层没有 CLI、application、具体图形、Node 或文件系统 import。现有 REPL/Parser 接线保持阶段 2 行为。
3. **模式实际状态**：Factory/Registry 已由 `ShapeFactory` 的单一注册表落地，注册保护和返回身份验证有测试。`GroupShape extends ContainerShape extends Shape` 与文档子树形成结构基础，但完整 Composite 移动/缩放及 set 仍在后续阶段验收；Command 和 Facade 尚未实现，不将领域插入/摘除冒称为 CLI 命令或完整历史管理。
4. **原子性与恢复**：抽查 `insertSubtree`，先验证全部候选 id、归属、父容器与位置，再修改关系和索引。`remove` 先构造冻结拓扑，再统一摘除子孙。测试比较失败前后可观察的树、索引、归属及顺序，并确认失败候选未被占用、恢复保留原实例。

阶段 3B 增量源码抽样（2026-10-27）：

1. 抽查 `src/application/EditorSession.ts`、`CommandDispatcher.ts`、`src/commands/CreateCommand.ts`、`src/shapes/ShapeFactory.ts` 和 `src/main.ts`。生产类保持单类同名文件、字段私有；Command 接口不依赖应用层结果。
2. EditorSession 组合命令、领域与工厂；CreateCommand 只 import 领域及 Command；工厂只依赖领域抽象、具体类型与 shapes 内数据契约。Parser 和领域没有业务接线变更，类型/命令名仅在两个注册表查找，无额外 switch。
3. Command 由 CreateCommand 首次落实，保存实例、父 id 与同级索引，失败插入不推进命令状态；测试执行→撤销→重执行并恢复身份及顺序。Facade 已提供真实结构化入口，Factory/Registry 同时支持结构化数据与 CLI 创建。History 和完整 Composite 仍按后续阶段实现。

阶段 3C 增量源码抽样（2026-10-27）：

1. 抽查 `src/domain/shapes/Shape.ts`、五种叶子类、`src/application/DocumentFormatter.ts`、`EditorSession.ts`、`CommandDispatcher.ts` 和 `src/shapes/ShapeFactory.ts`。几何视图由具体图形覆写，样式合并在基类；返回冻结值快照，不暴露私有字段或可写树集合。
2. DocumentFormatter 只 import SvgDocument、Shape 和 ContainerShape，不依赖具体图形；容器判断使用抽象类型，属性值按数值/字符串格式化，不按标签分派。领域层没有终端、应用或文件系统依赖；Parser 保持原有词法职责。
3. 命令与图形语法都附在原有注册项，help 枚举注册信息，不另建命令/类型映射。扩展 marker 证明新增几何与创建帮助无需改格式化器或 EditorSession。查询直接返回结构化结果，不创建 Command、不改变文档；历史接入后仍须验证查询保留 undo/redo。
4. Factory/Registry 与 Facade 持续复用；本阶段未增加新模式。Composite 的统一显示依赖抽象属性和文档拓扑，完整几何行为仍由 4B/4C 验收；不将查询成功等同于完整编辑器完成。

阶段 4A 增量源码抽样（2026-10-28）：

1. 抽查 `HistoryManager.ts`、`EditorSession.ts`、`Command.ts`、`CreateCommand.ts` 和 `CommandDispatcher.ts`。生产类保持单类同名文件、私有字段；历史只依赖 Command 接口，不认识具体命令名或图形类型。CreateCommand 仍只依赖领域与命令接口，领域与 Parser 无接线变更。
2. HistoryManager 作为 Command 的调用方，使用同一实例执行/撤销/重做；命令负责恢复，历史负责成功后移动栈项。EditorSession Facade 生成并提交反馈，成功 init 才重置历史。反馈只读复制，错误反馈不会作为历史项保存。
3. Command/Factory/Registry/Facade 沿用既定职责，没有新增模式或名字分派。完整 Composite 几何操作和其他编辑命令仍待 4B/4C/5 验收；IO 重置目前只接入 init，不把未来文件操作声称为已实现。

阶段 4B 一致性抽样（2026-10-28）：检查 DeleteCommand、GeometryCommand、MoveCommand、ScaleCommand、SvgDocument、Shape、ContainerShape、GeometryShape、GeometryChange、五种叶子与 EditorSession。领域及命令没有应用层、CLI、Node/文件系统 import；命令只依赖领域及 Command 层。字段私有、一类一文件，数值和拓扑返回只读快照；未新增命令名或图形名分派。坐标轴/尺寸角色判断是图形类声明的几何规则，不是按 tag 分派。Composite 的拓扑集中在文档，通过迭代聚合本地变更；与先前递归描述的具体调整已写入模式段及过程记录。set、重组与 IO 尚未实现，不提前计入验收。

阶段 4C 一致性抽样（2026-10-28）：检查 SetAttributeCommand、AttributeChange、Shape、GeometryShape、TextShape、EditorSession 和 DocumentFormatter。领域按多态提供属性类型/准备接口，命令只 import 领域及 Command；应用层完成数值转换与摘要，历史保存只读反馈。未改 Parser、未增加类型名分派；几何属性沿用类声明的坐标轴/尺寸规则，公共样式与 text 各归所属抽象/具体类。私有字段通过受控快照修改，对外 getter/属性视图保持只读；g set 不遍历后代。沿用 Command、Composite、Factory/Registry 与 Facade，没有额外设计模式；set 的属性变更与几何聚合各有明确职责，不为文本修改复用几何缩放接口。

阶段 5A 一致性抽样（2026-10-28）：检查 GroupCommand、AddToCommand、TreeChange、SvgDocument、EditorSession 和 DocumentFormatter。两个新命令只依赖领域及 Command，领域没有应用层、CLI、具体 shapes 或文件系统依赖；生产类保持私有字段、一类一文件。拓扑前后记录只在文档内部，GroupShape 没有新增 children 存储；命令缓存变更，应用层生成单行反馈，历史冻结反馈并在成功后移动栈项。Parser 未改语义职责，没有新增命令名/图形名分派或 switch；图中仍明确标记两个已实现注册点为需求规定的待重构点。沿用 Command、Composite、Factory/Registry 和 Facade，TreeChange 是领域恢复边界，不额外宣称新设计模式。ungroup、front/back 与 SVG IO 仍属后续范围。

阶段 5B 一致性抽样（2026-10-28）：检查 UngroupCommand、SvgDocument.prepareUngroup、ContainerShape、GroupShape 和 EditorSession。命令仅依赖领域及 Command；领域不 import 应用层、CLI、具体 shapes 或文件系统。生产类保持单类同名文件、私有字段，canUngroup 是只读能力；父子关系仍由文档唯一持有。沿用 Command/Composite/Factory/Registry/Facade，未新增设计模式或名字分派；可持有孩子与可解散分开表达。Parser、HistoryManager 的边界没有变化，反馈由应用层生成并由历史冻结，失败不入栈。测试中的受保护容器仅验证能力契约，不是 box 或插件实现。front/back 与 SVG IO 尚待实现。

阶段 5C 一致性抽样（2026-10-28）：检查 ReorderCommand、SvgDocument.prepareReorder、TreeChange、EditorSession 注册及共享排序处理器。命令只依赖领域与 Command；领域未引用应用、CLI、具体 shapes 或文件系统；生产类保持单类同名文件与私有字段。拓扑和 id 索引由文档唯一维护，排序仅修改当前父的同级序列，缓存变更检查目标实例及受影响记录；不复制后代属性或 children 存储。两个命令在既有分发器显式登记并注入方向，没有第二次按名字分派，Parser 和 HistoryManager 契约不变。继续使用 Command、Composite、Factory/Registry、Facade，没有新增模式；SVG IO 留待阶段 6。

## 质量保证手段

阶段 5C 质量证据：30 文件 554 项通过，保留原 498 项；新增领域/命令 24 项、应用会话 30 项、源码/编译入口各 1 项。typecheck、pretest 构建、format:check、git diff --check 通过。覆盖根/嵌套双方向、首中尾与唯一同级、边界不变编辑、对象身份及同 id 替换、原属性/子树保持、陈旧拓扑失败与重试、2000 层树、失败保留历史、混合命令多轮撤销重做及 IO 锁定。真实入口验证词法/语义错误后 redo、中文、顺序与父关系；Windows PTY 验证交互和 Ctrl+D 退出 0。两个实现模块分别推送，并通过精确 SHA 的 Windows/Linux CI，提交和链接见开发方案第 8 节。

阶段 5B 质量证据：28 文件 498 项通过，保留原 456 项；领域/命令新增 21、应用会话新增 19、源码/编译入口各新增 1。typecheck、pretest 构建、format:check 和 git diff --check 通过。覆盖首/中/尾原位提升、空组、只提升直接孩子、2000 层树、原实例/属性/缺省样式保持、顶层及受保护容器拒绝、失败不改双栈、拓扑冲突与重试、id 复用、跨文档归属、混合命令重复撤销重做、IO 锁定和输出转义。源码及编译入口回放中文解组、show 父关系、词法错误与顶层拒绝后 redo；Windows PTY 验证交互与 Ctrl+D 退出 0。两个实现模块分别推送且精确 SHA 的 Windows/Linux CI 均通过，完整 SHA、链接和阶段状态见开发方案第 8 节。

阶段 5A 质量证据：26 文件 456 项通过，保留原 392 项，group 新增 28、addto 新增 36；typecheck、pretest 构建、format:check、git diff --check 通过。覆盖跨父/同父拓扑与文档顺序、单节点/空组收编、重复和祖先后代选择拒绝、自身/直接与间接环拒绝、整棵子树原实例保持、准备不写入、拓扑冲突不部分恢复及可重试、2000 层树、混合历史与错误保留双栈、无变化成功编辑清空 redo。两项间接环回归临时移除父链检查时失败，恢复后通过；源码和编译入口均回放新增命令。Windows PTY 验证中文、跨父组合/收编、失败后 redo、同父顺序恢复和 Ctrl+D 退出 0。group/addto 分别推送并通过各自精确 SHA 的 Windows/Linux CI，链接及完整 SHA 见开发方案第 8 节。

阶段 4C 本地证据：22 文件 392 项（保留原 314 项，领域/命令新增 31、会话新增 45、源码/编译入口新增 2），typecheck、pretest 构建、format:check、git diff --check 通过。覆盖六种类型完整白名单、原型名字/id/跨类型属性拒绝、有限非空数值与非负尺寸、属性准备不变更、缺省/空/none/零恢复、嵌套 g 样式不传播、中文/引号/反斜杠/控制字符显示、原实例/索引/拓扑保持、五轮混合历史恢复、错误保留双栈、无变化编辑清空 redo、IO 锁定与成功解锁。Windows PTY 编译入口回放中文文本、非法数值后 redo、缺省 fill 和零描边宽度恢复、init 重锁，Ctrl+D 退出 0。模块精确 SHA/远程 CI 以开发方案第 8 节为准。

阶段 4B 质量证据：20 文件 314 项（保留原 235 项，新增 79 项），typecheck、pretest 构建、format:check、git diff --check 全部通过。delete 验证完整子树原位/原实例恢复、id 复用和恢复冲突后重试；move/scale 验证六种类型、双端点、2000 层容器、浮点精确恢复、文本/样式/描边宽度保持、末端溢出不产生部分变更、非法参数保留双栈、无变化成功编辑清空 redo，以及混合历史多轮回放。scale 另验证正有限倍数、有限下溢恢复和数值型扩展。源码/编译入口均回放三条新命令；Windows PTY 实际验证中文组操作、非法倍数后 redo、溢出后已有矩形保持原值、删除恢复、init 锁定及 EOF 退出 0。三个实现提交独立推送并通过各自 Windows/Linux CI，精确 SHA/链接见开发方案第 8 节。

阶段 4A 本地与手工证据：14 文件 235 项通过，包含原 189 项、帮助登记约束 1 项、HistoryManager 7 项、历史会话 36 项、源码/编译入口历史回放各 1 项。严格 typecheck、pretest 构建、format:check、git diff --check 通过。历史专项验证失败执行/撤销/重做保留栈且可重试；会话验证六种类型与父关系、查询/失败请求保留双栈、成功编辑清空 redo、成功 init 锁定及失败 init 不改历史。真实入口加入待重做期间词法错误，后续 redo 仍成功。Windows PTY 验证中文文本撤销重做、重复 id 后重做、init 锁定、新编辑解锁和 Ctrl+D 退出码 0。精确提交与双平台 CI 证据见开发方案第 8 节。

阶段 3C 本地与手工证据：12 文件 189 项通过，原 156 项回归全部保留；新增查询/属性/深树 24 项、帮助与注册元数据 5 项、源码/编译入口查询及 help 各 2 项。严格 typecheck、pretest 构建、format:check、git diff --check 均通过。Windows PTY 验证编译入口 tree/show 中文内容、实际 parent、错误后继续查询、未初始化 help、错误 help 后成功创建，以及 Ctrl+D 退出码 0。两个实现模块的精确 SHA、推送与 CI 证据以开发方案第 8 节为准。

阶段 3B 当前本地证据：10 文件 156 项通过，包含原 91 项回归、Dispatcher/init 17 项、create 应用集成 39 项、CreateCommand 4 项、工厂 CLI 扩展保护 3 项及源码/编译入口新增 2 项。严格类型检查、构建、Prettier 和 diff 检查通过。六种图形根级/嵌套、空/中文文本、in 词元歧义、非法数值、父目标错误、未初始化、unknown box、失败状态不变及 init 重置已覆盖；真实入口连续错误后可继续成功创建。远程精确证据及最终状态见开发方案第 8 节。

阶段 3B 远程与手工验收：3B.1 `3659408` 随文档 `f16c816` 推送，由该最终提交的 [CI 40472518602](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40472518602) 验证；3B.2 `7854c52` 独立推送并通过 [CI 40473725887](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40473725887)，均在 Windows/Linux 成功。在 Windows PTY 创建画布、组与中文文本，错误父目标之后下一条创建仍成功，Ctrl+D 退出码 0。完整 SHA 与范围见开发方案第 8 节。

当前本地证据（阶段 3A）：Node.js 24.15.0 / npm 11.12.1，严格源码/测试类型检查、构建、Prettier 检查和 diff 空白检查通过；6 个测试文件共 91 项通过。新增领域契约 4 项、六种图形与工厂 15 项、文档树 28 项；原 Parser 24 项、REPL 16 项、源码/编译入口各 2 项全部保留。文档树覆盖默认/非法画布、大小写敏感 id、父子关系与顺序、冻结快照、重复/非法插入前后状态相等、跨文档归属、环拒绝、子树摘除恢复及千层树的迭代处理。此时 CLI 仍未调用领域对象，领域原子性与词法错误不执行是分别验证的边界，不冒称业务端到端验收已通过。

阶段 3A 三个实现提交均已分别推送并通过 Windows/Linux CI：[图形契约 34de27b](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40468255670)、[图形与工厂 1db5e7f](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40470080167)、[文档树 45aa8c8](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40470589609)。完整 SHA、远程核实与验收边界见开发方案第 8 节。

手工证据：在 Windows PTY 运行 `node dist/main.js`，验证空行、含未闭合引号的整行注释被跳过，未闭合文本输出一行词法错误，下一条中文/含 #/in 的合法词法输入到达阶段占位执行器，空提示符 Ctrl+D 退出码为 0。源码与编译入口都由真实子进程测试持续验证。阶段 1 补强提交 [CI 40465418386](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40465418386)、阶段 2A [CI 40465817080](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40465817080) 及阶段 2B [CI 40466534090](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40466534090) 均在 Windows/Linux 通过；精确实现 SHA、远程核实及完成状态见根开发方案第 8 节。

后续阶段仍须落实以下证据，不把下述计划写成已通过：

- 保留已完成的 front/back、group/addto/ungroup/set、Composite 移动/缩放、id/工厂/父子关系及 Parser、REPL 回归；SVG IO 接入后验证顺序可序列化并读回。
- 对每个新增编辑命令验证“执行 → undo → redo”，沿用已建立的 redo 清空、init 后禁止 undo 和错误命令不入栈回归；read/save/canvas 接入时扩展 IO 历史验收。
- 用含缺失 id、嵌套 g、文本和非法文件的 SVG 做读入测试，验证自动补 id 警告和错误前缀。
- 对保存结果做 XML 检查，再 read 回来比较画布、层级、属性和文本，验证 round-trip。
- 运行 TypeScript 类型检查、测试命令和典型 CLI 会话；每完成一个小模块先验证，再单独提交并推送。
- 阶段 1 起按 Node.js 24 LTS / 约定 npm 主版本建立 Windows、Linux CI；每次 push/PR 运行 npm ci、format:check、typecheck、build 和 test，保留精确 SHA 的结果链接。CI 不能替代交互与浏览器验收。
- 阶段 6 验证外部实体/网络解析禁用、DTD 拒绝，以及大小、深度、元素数量的解析期间限制；超限失败不改变文档、路径或历史。
- 根开发方案第 8 节持续记录阶段状态与证据；最终按根 README 从干净检出验证使用者交接。
