# SVG CLI 开发执行方案

版本：v1.1（进度更新至 2026-10-28）

## 1. 目标、依据与当前状态

本方案是后续逐阶段执行的基线，需求依据为 [phase_cli_1.md](phase_cli_1.md)，架构依据为 [doc/README.md](doc/README.md)。需求中的明确规定优先；本方案补充实现顺序、验收条件和未明确行为的默认决策。若发现冲突，先记录证据并修订文档，再调整实现。

目标是实现 TypeScript 面向对象 SVG CLI，覆盖 REPL、六种内置图形、层级编辑、Command 撤销重做、SVG 读写及规定错误。截至 2026-10-28，阶段 1–2、3A–3C、4A–4C、5A 已完成，5B 正在开发。持续进度及验收证据以第 8 节为准，不把本段当作永久状态。

本阶段不实现 box、插件加载器、GUI、HTTP API 或历史持久化。ShapeFactory 提供图形注册扩展点；不承诺当前已具备完整 ShapeProvider 插件协议。

## 2. 对原建议的审查结论

| 问题或可优化点 | 依据与影响 | 本方案修正 |
|---|---|---|
| init 到第六阶段才实现 | 第三阶段的 create/tree/show 需要当前文档，CLI 无法形成可用闭环 | 第三阶段提前接入 init 与最小应用流程；第六阶段完成其 IO 历史规则与文件操作 |
| create 先实现，Command 到下一阶段才引入 | 容易出现直接改模型和命令对象两条编辑路径，后续返工 | 第三阶段起 create 就是 Command；第四阶段扩展历史和基础编辑 |
| Parser 负责全部命令参数和 in 子句 | 若内部按命令名、类型名 switch，会形成额外分派点 | Parser 只做词法解析；命令注册项解析命令参数，图形工厂注册项解析类型参数 |
| 图形类在 domain/shapes 与 shapes 中重复归属 | 原架构表同时把叶子和 GroupShape 放在两处，依赖难以执行 | domain/shapes 放抽象；shapes 放六种具体类型和工厂 |
| commands 仅依赖 domain，却描述为接收工厂、IO 服务 | 接口可能反向依赖 application，或让编辑命令接触 IO | 应用层构造候选 Shape 后传给 CreateCommand；文档处理器在应用层调用 IO；编辑命令只依赖领域接口 |
| 一个基础编辑阶段承载过多工作 | create/delete/move/scale/set 和 History 同时完成会形成大提交 | 阶段内部设置 4A、4B、4C 等可验收提交点，小模块完成即反馈和 push |
| 组合验收遗漏顶层 ungroup 禁止规则 | 需求 4.2 明确禁止解散 svg 的直接子容器 | 明确区分顶层拒绝与嵌套提升，并验证恢复顺序 |
| “先校验”不足以覆盖全部原子性 | read/save 失败、数值溢出和多节点变更可能在中途失败 | 校验完整候选结果后提交；读入临时文档；保存先完整生成内容，再原子替换 |
| 自动补 id 未说明已有 id 冲突 | 单遍生成 rect1 可能撞上文件后部已有 rect1 | 先收集显式 id，再按文档顺序补全，跳过全部占用 id；重复显式 id 拒绝 |
| 旧架构预留多种 Strategy | 单一 id 分配、格式化实现没有可替换算法需求 | 保留 Reader/Writer 隔离边界，暂不引入额外 Strategy 类 |
| 部分语义没有落到验收用例 | # 颜色、带引号的 in、g 的 set、scale 属性范围可能被误解 | 在第 5 节列出明确约束和需求未规定时的默认决策 |
| 最终典型会话不足以证明质量 | 会话示例不覆盖失败后的历史、索引和父子关系一致性 | 每阶段验证领域不变量和边界，最终回放用于集成验收 |

2026-10-27 补充审核：采纳执行状态、使用者交接、仓库级质量门槛和 XML 资源边界四项意见，分别落实到第 8 节、阶段 7、阶段 1/第 6.1 节及阶段 6/第 6.2 节。它们是对执行体系的补充，不改变既定模块和模式。CI 不能代替手工验收；XML 限制也不是 SVG 净化能力的承诺。

## 3. 架构与模式落地

### 3.1 模块边界

| 目录 | 职责 |
|---|---|
| src/domain/document/ | SvgDocument、尺寸、根节点顺序、唯一 id 索引；集中维护跨节点结构不变量 |
| src/domain/shapes/ | Shape、ContainerShape 等抽象；封装公共属性、几何操作和遍历契约 |
| src/shapes/ | RectShape、CircleShape、EllipseShape、LineShape、TextShape、GroupShape；ShapeFactory 与注册项 |
| src/commands/ | 编辑命令对象，保存恢复状态，执行与撤销；不接触终端或文件 |
| src/application/ | EditorSession、CommandDispatcher、HistoryManager、命令处理器、结构化结果、tree/show 格式化 |
| src/cli/parser/ | CommandParser：空行、整行注释、双引号、词元和引号来源；不改变文档 |
| src/cli/ | Repl、终端输入输出和统一 error:/warning: 呈现 |
| src/io/ | SvgReader、SvgWriter、XML 与文件转换、临时文档、缺 id 分配 |
| src/main.ts | 组合根：创建具体对象、注册命令与图形、注入依赖、启动 REPL |
| test/ | 按模块和典型会话组织测试及 SVG fixtures |

src/main.ts 是唯一组合根，可以依赖上述模块用于装配。测试和入口以外按架构文档的单向依赖规则执行。可先建立必要目录，不添加只用于占位的空类。

当前实际接线为 `main.ts → Repl → CommandParser → EditorSession → CommandDispatcher → CommandResult → TerminalOutput`。结构化 CommandRequest/CommandToken 与 CommandExecutor 位于 application；create 由 ShapeFactory 同一注册项解析参数，再由 HistoryManager 执行 CreateCommand。delete/move/scale/set/group/addto 同样由应用处理器校验参数和生成摘要，经历史管理器执行各自命令；领域层负责子树摘除/恢复、几何/属性准备及原子拓扑变更。undo/redo 经历史管理器复用命令，成功 init 清空并锁定历史；IO 后续接入 Facade。空行/整行注释全部交由 Parser；词法错误不调用执行器。

### 3.2 主流程与分派限制

Repl → CommandParser → EditorSession → CommandDispatcher 的注册项 → 参数验证与处理器 → 领域模型或 IO → CommandResult → CLI 输出。

Parser 返回命令名与保留 quoted 信息的词元；结构化请求不要求 Parser 理解所有命令的语义。命令名到处理器只在 CommandDispatcher 注册表查找一次；create 的类型名及 SVG 标签只由同一个 ShapeFactory 注册表解析。每个注册项自行校验参数、提供帮助语法或创建对象。

词法状态判断、参数数量校验、属性白名单查找和多态方法调用不属于额外的类型分派；禁止在 Parser、SvgReader、tree/show 或业务命令中另写命令名/图形标签 switch。两处集中分派在架构中显式标注为待重构点，后续评估注册发现机制即可，不增加第三处分派。

### 3.3 设计模式

- **Command**：从首个 CreateCommand 开始使用；一条编辑一个 undo 单元。execute/undo/redo 使用同一命令对象，redo 重用已保存的执行结果，不重新解析输入。
- **Composite**：Shape 抽象统一叶子与 GroupShape 的几何准备契约；SvgDocument 作为唯一拓扑持有者，迭代汇总子树各节点的多态本地变更，完整校验后统一应用，不在 GroupShape 重复保存 children。删除和重组同样由文档维护子树及 id 索引。4C 已接入 g 的公共属性设置，保留 SVG 继承语义；5A 的 group/addto 通过同一领域树操作叶子与整棵子树。
- **Factory/Registry**：ShapeFactory 集中注册六种具体图形，CLI 创建与 SVG 读入复用注册项；未来可新增提供者，本阶段不实现 box。
- **Facade**：EditorSession 提供稳定执行入口，编排处理器、历史和 IO；不承担具体图形运算或 XML 解析。
- **Template Method（4B 局部复用）**：GeometryCommand 固定执行/恢复及快照保存顺序，MoveCommand 与 ScaleCommand 只覆写准备钩子；两种具体运算复用同一生命周期，不新增分派表。

Reader/Writer 接口用于隔离 IO。当前不把单一实现称为 Strategy，也不为凑模式拆分 id 分配器、颜色格式化器等额外策略。每个模式首次落地及有实质调整时，在阶段反馈中说明类名、协作关系和验证证据。

## 4. 分阶段开发与验收

每次任务限定一个阶段或一个子步骤。只为当前验收必需的依赖补最小实现；不得把未到阶段的完整功能一并做完。每个小模块都要测试、检查 diff、反馈、commit、push 后再进入下一模块。

### 阶段 1：工程与 REPL 骨架

工作：建立 package.json、锁文件、严格 TypeScript 配置、.gitignore、运行和测试入口；实现可注入输入输出的 Repl、统一结果呈现和 EOF 正常退出。约定 npm run cli、npm run typecheck、npm run build、npm test；使用一个测试框架即可。以 Node.js 24 LTS 为支持基线，在 engines、.node-version、CI 和根 README 中保持一致；锁定 npm 主版本并记录首次验证的确切 Node/npm 版本。阶段 1 建立 GitHub Actions 和 Prettier 检查，具体门槛见第 6.1 节。

验收：npm run cli 能启动并显示欢迎语和 svg>；EOF 能结束；空输入不出错；利用假的应用入口验证成功和单行 error: 输出，不冒充已有领域命令。自动化测试必须覆盖真实输入循环，并安排一次真实交互终端检查提示符。

提交粒度：工程配置、质量脚本与 CI；REPL 和输入输出测试。不得将 node_modules、dist、coverage 或临时输出纳入 Git。根 README 在本阶段先给出环境、已可用的安装/启动方法及当前实现状态，不让读者误认为所有功能已经完成。

### 阶段 2：Parser 与请求边界

工作：实现通用词法解析；保留词元值与 quoted 标记；命令参数校验随阶段 3 的注册项提供，不建立第二套命令分发表。阶段 2 先建立并测试结构化请求和执行器契约；注册项、分发器与语义校验测试在阶段 3B 落地，不为本阶段额外创建只有占位实现的注册框架。

验收：双引号中的空格、中文、空字符串、# 和 in 能保留；未闭合引号产生一行错误；以 # 开头的整行跳过，参数中的 #ffffff 不视作注释。约定支持双引号内的 `\"` 和 `\\` 转义，未识别的反斜杠序列保留，避免破坏 Windows 路径。词法错误不会调用应用执行入口。

补充语法决策：双引号须包裹完整词元，不支持 `prefix"in"`、`"in"suffix` 或相邻引号拼接，避免 quoted 标记含义不明确；单引号、分号和参数内 # 均为普通字符，不实现 shell 命令链。空命令名与直接向 Parser 传入 CR/LF 多行输入报词法错误。命令名保持原样，大小写和是否注册由下游决定。

提交粒度：2A 请求契约、词法解析与边界测试；2B REPL 过滤迁移、结构化执行入口与集成回归。create 参数数量、数值和 in 的语义测试随阶段 3 的注册项落地。

### 阶段 3：领域、工厂与首个 CLI 闭环

3A：实现 Shape/ContainerShape 抽象、SvgDocument、六种具体图形和 ShapeFactory。字段封装；通过受控领域操作维护父子关系、根顺序和唯一 id 索引，不公开可修改的 children 数组。

3A 内部再分三次验收和推送：3A.1 图形抽象与公共属性；3A.2 六种具体图形、结构化创建数据与工厂注册；3A.3 文档树与索引。工厂本步骤接收已转换为数值的结构化参数，CLI 参数转换在 3B 接入同一注册表，SVG 参数转换在 6A 接入，不另建类型分发表。图形属性当前只读访问不代表模型永久不可变；受控几何修改和状态恢复随 4B/4C 实现，不能由命令直接写字段。

3B：建立 EditorSession、CommandDispatcher、CommandResult 和 Command 契约，提前实现 init。create 从第一版起封装为 CreateCommand；工厂创建未挂接候选节点，全部校验通过后原子加入文档。

3B 内部提交点：3B.1 应用契约、分派器、EditorSession 与真实入口 init；3B.2 工厂注册项 CLI schema、六种 create/in、CreateCommand 及会话回归。3B.1 推送并验收 CI 后再进入 3B.2。CreateCommand 自身验证执行/撤销/重执行；CLI undo/redo 与完整历史仍随 4A 接入。

3C：接入 tree、show、help，完成 init → create → tree/show 的真实 CLI 回放。帮助语法来自命令注册信息；节点显示由多态描述或统一属性视图产生，不按 tag 分支。

3C 内部提交点：3C.1 只读属性视图、DocumentFormatter 与 tree/show 会话；3C.2 同一命令/图形注册表的帮助元数据与 help。前一模块提交、推送并核实 CI 后才开始后一模块。tree 使用迭代遍历，show 从文档关系查询实际 parent。

验收：六种类型、默认 800×600、浮点参数、大小写不同 id、重复 id、缺少 id、create ... in g、目标缺失/非容器、unknown type（含 box）均覆盖；tree 内联几何属性，show 显示 parent。init 前依赖文档的命令按规定报错；help 可在未初始化时使用。

提交粒度：3A 领域和工厂；3B 创建闭环；3C 查询与帮助。此时完整 undo/redo 尚未验收，不伪报已完成。

### 阶段 4：History 与基础编辑

4A：HistoryManager 接入 CreateCommand，验证 undo/redo、IO 锁定状态与失败不改历史。init 成功清空历史并锁定；新成功编辑建立新的历史。

4A 内部提交点：先独立修正旧 Command 文档和帮助登记约束，再做 4A.1 HistoryManager 及失败重试/IO 锁定单元验收，最后 4A.2 接入 EditorSession 的 create/init 与 CLI undo/redo 会话；每个模块分别推送并核实 CI。Command 沿用构造注入和无参 execute/undo，摘要由应用处理器生成；历史项保存应用反馈，不向领域命令加入终端职责。所有命令注册必须显式传入帮助语法回调。

4B：实现 DeleteCommand、MoveCommand、ScaleCommand；删除保留整棵子树、原父节点和原同级位置；移动缩放保存旧几何状态，避免仅用逆运算导致浮点误差积累。

4B 内部提交点：4B.1 delete 子树删除与恢复；4B.2 受控几何快照、move 和容器原子移动；4B.3 scale 与溢出/精确恢复。每个模块本地验收、独立推送并核实对应 SHA 的 Windows/Linux CI 后，再开始下一模块。

4C：实现 SetAttributeCommand 和严格的类型属性白名单，恢复时区分“属性不存在”与“显式值”。

4C 内部提交点：4C.1 领域属性类型/准备接口、SetAttributeCommand 与直接执行/恢复测试；4C.2 CLI set 注册、参数转换、单行摘要与历史/真实入口回归。领域接收已转换的 number/string，不解析 CLI；属性白名单由图形多态提供，不能从当前属性是否存在推断可编辑性。前一模块测试、独立推送及双平台 CI 核实后再进入后一模块。

验收：每条编辑均覆盖执行 → undo → redo；容器与叶子走统一接口；撤销后新成功编辑清空 redo，查询和失败编辑保留 redo。scale 非正数、非有限数和结果溢出不改状态；g 的 fill/stroke/stroke-width 保持容器自身属性；scale 只乘几何属性，不改 stroke-width。

提交粒度：4A、4B、4C 各自反馈、提交和推送；规模仍大时再按命令拆分。

### 阶段 5：组合与层级命令

5A：GroupCommand、AddToCommand。5B：UngroupCommand。5C：front/back 的 ReorderCommand。

5A 内部提交点：5A.1 group 的领域拓扑变更、命令和 CLI；5A.2 addto 复用受控拓扑变更并接入历史。前一模块独立测试、推送并核实精确 SHA 的 Windows/Linux CI 后再进入下一模块。拓扑始终归 SvgDocument 持有，TreeChange 只封装已校验前后关系的应用/恢复；命令不直接搬动公开 children，不修改图形本地数值或样式。

5B 内部提交点：5B.1 容器解散能力、SvgDocument.prepareUngroup、UngroupCommand 与领域/命令测试；5B.2 EditorSession 注册、帮助、历史会话与源码/编译入口回归。前一模块单独推送并核实精确 SHA 的 Windows/Linux CI 后再进入下一模块。沿用 TreeChange，不通过逐个 remove/insert 提升孩子；容器默认不可解散，普通 GroupShape 显式开放能力，不按类型名识别复合图形。本阶段不实现 box。

验收：跨父节点收编、原有相对顺序、同级前后位置与 id 索引一致；拒绝重复选择、祖先与后代同时 group、自己移入自己或移入后代；顶层 g 的 ungroup 必须拒绝，嵌套 g 解散后子节点准确占据原位置。每条命令一次 undo 恢复所有原父节点与同级位置，redo 恢复操作后结构；嵌套容器 move/scale 的结果正确。

提交粒度：5A、5B、5C；若 group 与 addto 各自已形成完整验收，也可分开提交。

### 阶段 6：文档命令与 SVG IO

6A：内存 SVG 编解码，选用成熟 XML 库；验证命名空间、层级、属性、text 子文本、实体转义和默认外观。读取完整临时文档后才替换当前文档；先收集显式 id，再补缺失 id。选库时确认实体处理、外部资源解析及解析期间深度/数量限制能力，按第 6.2 节落实边界并提交针对性测试；不能只在完整建树后才检查资源限制。

6B：read/save 文件适配、路径上下文、文件错误转换；读取时按实际累计字节限制大小，不能仅依赖读取前 stat。save 在同目录生成临时文件后替换目标，失败清理临时文件。保存成功后才更新默认保存路径和历史状态，失败保留原状态。

6C：补齐 canvas 查询与修改以及所有文档命令的历史规则；接入 read/save 完整 CLI 回放。

验收：显式 id 重复拒绝、自动 id 不与后续显式 id 冲突、每个补全产生规定 warning；读入失败保留当前文档/路径/历史。文本含中文、引号、&、<、> 可保存读回；fill/stroke 省略时保持属性缺省，不写入人为默认值。保存后能在浏览器显示，并读回相同尺寸、顺序、结构、属性和文本。

成功 init/read/save/canvas 修改后，undo 和 redo 均输出 error: undo not allowed after io command；下一次成功编辑开始新历史。canvas 无参、tree/show/help 不改历史；失败的文档命令也不锁定或清空已有历史。

提交粒度：6A、6B、6C。XML 往返测试先于文件路径测试，防止 IO 与模型问题混在一起。

### 阶段 7：端到端验收与提交收尾

工作：回放需求第 6 节及 6.1 版本 A；覆盖全部命令、规定错误、状态不变和 round-trip。版本 B 的 box 不执行成功验收，单独验证 unknown shape type。把示例会话的关键输出作为稳定断言，不用无关的空格对齐快照替代语义测试。

验收：在干净检出后按锁文件 npm ci，运行第 6.1 节全部质量脚本，确认目标提交在 Windows/Linux CI 上均通过；检查 CLI、浏览器预览和 Git 历史；检查一类一文件、字段封装、两处分派和全部 import 方向。doc/README.md 的一致性自查必须记录实际抽样文件和结果，质量保证写实际命令和证据，不把计划写成已通过。

使用者交付：补齐根 README.md，至少包含课程/个人 CLI 工具定位、支持的 Node/npm 与操作系统、npm ci 和启动/构建/测试方法、可直接回放的最小命令示例、保存后预览方法、六种类型及 SVG 支持范围、transform/重组语义、输入限制、已知限制和三份项目文档链接。明确它并非完整 SVG 编辑器，当前不发布 npm 包，不要求 bin 入口或发布流水线。照 README 从干净检出实际走一遍，验证命令可用而非只检查文字。

先提交并推送代码、测试和最终文档；确认该提交的验证结果、工作区干净、远程与 HEAD 一致后，再在该提交创建并推送 annotated final tag。截止时间尚未提供，执行时以实际截止时间为约束；当前不创建 final。

## 5. 必须落实的语义与默认决策

### 5.1 需求规定与采用的 SVG 语义

以下以需求明确规则为基础；g 样式继承、绘制顺序和不缩放字体等是本方案依据 SVG 属性语义采用的解释，调整时仍需记录依据。

- 所有图形含 g 都有唯一、大小写敏感 id；根 svg 作为文档，不要求用户给根 id。
- CLI create/group 必须显式给 id，不能自动补；set 不允许修改 id，白名单外使用需求中的 unknown attribute 错误。
- 只有整行注释被跳过，不支持把命令尾部的 # 当注释；颜色 #ffffff 是普通参数。行首可带空白。
- in 是 create 最后的未加引号子句；通过具体图形的参数规则判断，不能把文本内容 "in" 或一个合法 id in 误判为子句。
- move 是增量；scale 把各叶子的全部几何坐标和尺寸同乘 factor，对容器递归；线的两个端点都缩放，文本只缩放 x/y，不扩大字体。
- g 的 set 只设置该容器的公共样式，SVG 渲染按继承生效，不覆写子节点的显式样式。容器没有 x、y 等几何属性。
- front 将节点移到同级数组末尾（SVG 后绘制，视觉最前），back 移到同级数组开头。
- ungroup 顶层 g 被禁止；嵌套普通 g 的子节点提升到其父级并占原位置。Composite 的统一接口不等于允许所有类型进行 ungroup。
- 失败不得改变文档、id 索引、父子关系、默认路径、undo/redo 栈和 IO 锁定标记；规定错误文本以需求 4.2 为准。内部异常消息不可直接带换行输出。
- 元素计数包含 g 及所有子孙，不包含根 svg；tree/show 必须反映真实父子关系和关键几何属性。

### 5.2 需求未明确部分的默认实现决策

这些是当前可执行约定，不能冒充需求原文；后续若调整，同步修订方案与测试。

| 未明确部分 | 默认决策与验证 |
|---|---|
| group 的新父节点与输入顺序 | 选择项同父时，新 g 放在最早被选节点的位置；跨父时新 g 挂根末尾。子节点按变更前文档深度优先遍历顺序排列，不以参数排列顺序重排；undo 精确恢复每个原位置 |
| group 数量与反馈 | 接受至少一个已有节点，空组使用 create g；语法 group <newGid> <id1> [id2 ...]。成功/重做沿用需求示例 g#id created with N children；撤销显示 g#id removed; N children restored，准确描述恢复所有原父位置，不等同于受顶层限制的 ungroup 命令 |
| addto 错误与反馈 | 先校验目标容器，再校验源节点；自身/后代成环分别报 cannot add a container into itself: id / cannot add a container into its own descendant: id。成功/重做显示 类型#id added to 类型#目标，撤销显示 类型#id restored into svg 或 类型#原父；本地属性不做补偿 |
| ungroup 校验与反馈 | 先按节点查询（缺失报 no such shape），叶子报 not a container；不可解散容器报需求规定的 cannot ungroup composite shape，之后检查顶层限制。成功/重做显示 类型#id ungrouped; N children promoted into 类型#原父，撤销显示 类型#id restored with N children。空嵌套组可解散并占一个历史单元；只提升直接孩子，保留所有本地属性，不补偿失去的组样式继承 |
| 重复选择和 addto 同父 | group 重复 id 拒绝；addto 到当前父容器仍按需求移到末尾，恢复时保留原位置 |
| 没有可用历史 | 未初始化先报 no document；IO 锁定优先报指定错误；其余空栈分别报 error: nothing to undo / error: nothing to redo |
| undo/redo 参数与反馈 | 均不接受参数；先检查文档，再检查参数数量，合法请求才检查 IO 锁/栈。撤销 create 输出 类型#id removed，重做复用首次创建摘要（含父容器）；反馈由应用层生成，领域命令不返回终端结果 |
| delete/move 反馈 | delete 撤销显示 restored into svg 或 类型#父id；move 叶子显示本地锚点 moved to / moved back to（line 使用首端点），容器显示 moved by / moved back by。反馈只描述结果，撤销实际恢复保存值，不使用反馈中的逆增量计算 |
| scale 反馈与下溢 | 执行/重做显示 类型#id scaled by factor，撤销显示 类型#id geometry restored；有限结果允许 IEEE 754 下溢为零，undo 恢复原值，溢出为非有限值则整体拒绝 |
| set 反馈与恢复 | 执行/重做显示 类型#id updated: 属性=值；撤销恢复原值，原属性缺失时显示 类型#id attribute removed: 属性。文本始终双引号，身份/属性/值复用查询转义；缺省与空字符串、none、零均不同，不补渲染默认值 |
| 默认保存路径 | read 成功记录读入路径；save 显式路径成功后也作为后续默认路径；init 清空路径；init 后首次无参 save 报 error: no file path. use 'save <file.svg>' first |
| 数值域 | 接受有限浮点与负坐标；尺寸、半径、stroke-width 不得为负，画布宽高及 scale factor 必须为正；参数过多、缺失和非数值一律拒绝 |
| init 可选尺寸 | init 默认 800×600；只给 w 时 h 取 600；canvas 修改必须同时给 w/h，无参只查询 |
| 成功但没有变化的编辑 | 若参数合法，按一次成功编辑记录，包括 move 0 0、scale 1、set 原值、已在最前的 front；因此会清空 redo 并解除 IO 锁定 |
| 外部 SVG 的 transform、附加属性和未知元素 | CLI set 白名单不等于读入丢弃属性。保留六种支持节点上的附加普通属性（含 transform、字体属性）及根 viewBox；不展开 transform，move/scale 作用于节点本地几何。未知图形标签明确拒绝，XML 声明/注释跳过；不静默删掉未知图形。阶段 6 为此添加 fixture，暂不承诺完整 SVG/CSS/引用系统 |
| 重组带样式或 transform 的 g | 按规定重建树关系，不额外计算世界坐标或补偿继承样式；外部变换下重组可能改变渲染，不能宣称保持视觉不变。必要时在阶段 6 记录更严格的支持边界 |
| canvas 与 viewBox | init 默认 viewBox 为 0 0 w h；read 保留原 viewBox；canvas 修改尺寸时同步设为 0 0 w h，查询不改动 |
| 查询显示格式 | tree 使用规范属性名 width/height，不使用 w/h 缩写；tree id 的根不带 svg 标题或连接线，叶子仅一行。show 根级 parent=svg，嵌套 parent=类型#id，每个显式属性独占一行。省略样式不补默认值；文本始终双引号，特殊字符转义，查询不修改原值 |
| 分阶段 help 内容 | help 无参且未初始化可用，从现有注册项显示当前全部可执行命令，标题注明 current implementation；未实现命令不冒充可用。后续阶段注册命令时必须同时提供语法，最终验收覆盖需求的完整命令集合 |

## 6. 状态不变量与验证方法

文档每个节点只能有一个父节点，树不能有环；根集合与每个 children 都有稳定顺序；id 索引与当前树一一对应。新增、删除、重组和恢复必须通过受控操作维护这些不变量。

多节点修改先解析引用、校验目标、预计算全部结果和有限数值，再一次提交。可逆状态由命令封装；如采用快照，必须通过图形多态复制或封装状态恢复，不能 JSON 反序列化后失去类行为。undo/redo 同样先成功恢复，再移动栈项。

测试主要比较公开可观察结果：树、属性、父节点、同级顺序、索引查询和后续 undo/redo 行为。失败前后进行语义状态比较；不要只断言异常抛出，也不要把实现细节逐行复制成测试。

### 6.1 可重复的仓库质量门槛

支持基线为 Node.js 24 LTS，开发与 CI 使用相同 npm 主版本，package-lock.json 纳入版本管理。阶段 1 确定 npm 版本并记录；不把任意本机版本能运行当作兼容承诺。后续调整支持版本时，同步 engines、版本文件、CI 和 README。

GitHub Actions 从阶段 1 起对每次 push 和 pull_request 执行；矩阵为 ubuntu-latest、windows-latest，以覆盖本项目的 Windows 路径和终端差异。只授予 contents: read，不配置部署、发布或写仓库权限。每个矩阵任务独立执行：

1. 检出触发提交，安装约定 Node/npm。
2. npm ci，禁止在 CI 中更新锁文件。
3. npm run format:check（Prettier 只检查，不自动修改）。
4. npm run typecheck。
5. npm test：pretest 钩子先执行 npm run build，再单次运行 Vitest（禁止 watch），同时测试源码和编译入口。直接执行 npm run build 仍可单独构建。

本项目先采用 Prettier 统一格式，语义质量由严格 TypeScript 和行为测试把关；暂不叠加另一套 lint 工具，也不设任意覆盖率百分比。脚本失败必须返回非零退出码，不能用跳过测试或忽略错误让门槛变绿。

每个小模块提交前在本地执行适用检查；CI 建立后，阶段完成还需提供精确实现 SHA 对应的 CI 链接和结果，不能引用旧提交的绿灯。CI 失败或仍在排队时记录为待验收；需要外部操作才能解决时说明阻塞。交互提示符和浏览器显示仍需单独记录手工证据。CI 是状态门槛，默认不更改 GitHub 分支保护配置。

### 6.2 XML 输入与资源边界

这些是本工具额外采用的输入约束，必须在阶段 6 实现并在根 README 公开；不修改课程原需求，也不声称当前已经完成。

- 禁止 DTD、DOCTYPE 和自定义实体声明；不解析外部实体、不启用 XInclude、不访问输入中声明的网络或本地文件资源。允许 XML 预定义实体和合法数字字符引用。选择明确支持此配置的库；不能仅凭“默认安全”判断，必须核对其行为并测试。
- 初始资源预算：文件及内存解码入口均限制 UTF-8 输入不超过 5 MiB（5 × 1024 × 1024 字节）；元素嵌套深度不超过 128（svg 为第 1 层），元素总数不超过 50,000（含根 svg）。阶段 6A 在选库时用边界 fixture 复核并确定常量；如需调值，先写明性能证据并同步本方案、测试和 README，不能留作无上限。
- 限额在读取和解析过程中执行：累计实际字节超过上限即拒绝，不继续解析超限内容；恰好等于上限的合法输入应允许，并以有界读取确认是否还有额外数据。在流式事件或等效的受控解析阶段检查深度/节点数，在完整建树前拒绝超限输入。仅先看文件大小、或解析完成后再遍历，不满足验收。输入预算也约束单个文本/属性的总空间，不另造未经验证的性能保证。
- 测试必须覆盖 DTD/外部实体、自定义实体膨胀、未知实体、上限边界及超限大小/深度/数量；验证拒绝时没有外部解析调用，当前文档、路径和历史保持不变。单纯断言解析失败不能证明未读取外部资源。
- 拒绝输出单行 error:；磁盘读取和 XML 失败使用需求规定的 error: cannot read file: <path>，内部保留受控的错误类别供测试和诊断，内存解码错误由应用层映射。不要输出多行解析器堆栈，也不要在失败前发布补 id 的成功警告。

禁止解析外部资源只描述 CLI 读入行为。保留附加属性不等于对 SVG 做内容净化；本阶段不承诺清除所有事件属性、URL 或 CSS 引用，浏览器打开外部来源 SVG 的行为也不属于 XML 解析器的限制。README 必须准确说明这一边界，不能把生成文件宣传为已净化或保证可安全发布。

## 7. 提交、反馈与文档规则

继续在 main 顺序开发，不按模块创建分支；大范围实验才使用临时分支。每次提交聚焦一个已验证的小模块，禁止最后把全部模块汇总成一次大提交，也不伪造或重写历史制造开发过程。

每次小模块完成按顺序执行：

1. 对照当前阶段验收项运行必要测试、类型检查；检查 diff 和依赖方向。
2. 向用户反馈实现内容、验证结果、首次使用的模式及落地点、发现的问题和实际架构偏差。
3. 必要时更新架构及过程记录；stage 精确文件，形成一个可说明目的的 commit。
4. push 并核验远程提交与本地 HEAD；失败如实报告并保留本地提交，不宣称同步成功。
5. 更新第 8 节状态和证据，CI/手工检查齐全后才标为完成；完成当前阶段报告后等待下一次阶段任务，不自动跨阶段扩展。

进度反馈规则：开始任务时说明阶段、验收目标与当前状态；执行中及时报告实质进展、发现的问题和下一步，持续工作时不超过约 60 秒没有更新；测试结束、提交完成、push/CI 成功或失败分别给出结论。反馈用“阶段/状态、已完成、证据、阻塞、下一步”，不把局部测试通过说成整个阶段完成，也不用主观百分比代替证据。

doc/README.md 的过程记录只记自己从生成文档或代码发现的问题、确认依据与纠正方式。常规开发进度保存在提交和阶段报告中；根目录本方案跟踪执行顺序，架构文档跟踪最终职责和实际一致性，避免两处维护重复的大段设计。

## 8. 执行状态与验收记录

状态限定为：未开始、进行中、待验收、阻塞、完成。进行中表示有实际实施工作；待验收表示实现已提交但检查、CI 或推送仍未全部核实；阻塞必须写外部依赖或具体失败原因。只有本阶段全部验收通过、实现提交已核实推送且该实现的 CI 通过，才可完成。

下面是持续维护的状态入口；详细证据在其后追加记录。多次小提交可共享一条阶段记录，但每个实现 SHA 和验收范围必须可追踪。若已完成阶段出现回归，重新改为进行中或阻塞并写明原因。

| 阶段 | 状态 | 验收证据 / 实现 SHA / 推送与 CI | 阻塞项 | 下一步 |
|---|---|---|---|---|
| 1 工程与 REPL | 完成 | 原验收见下文；回归补强 acb500b 已推送，[CI 40465418386](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40465418386) Windows/Linux 均通过，12 项测试通过 | 无 | 已进入阶段 2 |
| 2 词法 Parser | 完成 | 2A `99b3908`、2B `ca87dcf` 分别推送并核实 SHA；[2A CI](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40465817080)、[2B CI](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40466534090) Windows/Linux 均通过；44 项测试及交互验收通过 | 无 | 已完成阶段 3A |
| 3A 领域与工厂 | 完成 | 3A.1 `34de27b`、3A.2 `1db5e7f`、3A.3 `45aa8c8` 已分别推送并核实 SHA；三个实现提交的 Windows/Linux CI 均通过（链接见下文）；91 项测试及全部本地质量检查通过 | 无 | 已进入阶段 3B |
| 3B init/create Command | 完成 | 3B.1 `3659408` + 文档 `f16c816` 已推送，[CI 40472518602](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40472518602) 通过；3B.2 `7854c52` 独立推送，[CI 40473725887](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40473725887) 双平台通过；156 项测试及手工验收通过 | 无 | 已进入阶段 3C |
| 3C tree/show/help | 完成 | 3C.1 `53ab90c`、3C.2 `b395131` 分别推送并核实 SHA；[查询 CI](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40476152693)、[帮助 CI](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40476788895) 双平台通过；189 项测试、质量检查及 Windows 交互验收通过 | 无 | 已完成阶段 4A |
| 4A History | 完成 | 优化 `befdf88`、4A.1 `0df2526`、4A.2 `739e8df` 已分别推送并核实 SHA/双平台 CI；235 项测试及交互验收通过，详见下文 | 无 | 已完成阶段 4B |
| 4B delete/move/scale | 完成 | `997de0f`、`6bfa850`、`3adeade` 已分别推送、核实远程 SHA 且双平台 CI 通过；314 项及 Windows 交互验收通过，详见下文 | 无 | 已完成阶段 4C |
| 4C set | 完成 | `f1f069b`、`f65f8ff` 分别推送并核实 SHA，Windows/Linux CI 均通过；392 项及交互验收通过，详见下文 | 无 | 下一阶段 5A group/addto |
| 5A group/addto | 完成 | `f81defa`、`405ffae` 分别推送并核实 SHA，Windows/Linux CI 均通过；26 文件 456 项及交互验收通过，详见下文 | 无 | 下一阶段 5B ungroup |
| 5B ungroup | 进行中 | 5B.1 本地 27 文件 477 项通过，等待模块远程验收 | 无 | 独立推送 5B.1 并核实 CI，再接入 CLI |
| 5C front/back | 未开始 | — | 无，依赖 5B | 按阶段 5C 验收 |
| 6A SVG 编解码 | 未开始 | — | 无，依赖 5C | 选库并验证 XML/资源约束 |
| 6B 文件与路径 | 未开始 | — | 无，依赖 6A | 验证有界读取与保存失败恢复 |
| 6C canvas/文档历史 | 未开始 | — | 无，依赖 6B | 按阶段 6C 验收 |
| 7 最终交付 | 未开始 | — | 无，依赖 6C；打 tag 前需确认截止时间 | 完整验收、README、final tag |

阶段记录模板（每次更新保留必要历史，不把模板当作证据）：

```text
阶段与更新时间：
状态：
已完成 / 尚未完成的验收项：
实际命令、执行环境及结果：
测试用例或日志位置 / 手工验收证据：
实现提交 SHA（可多条）：
远程分支、核实时间与结果：
CI 链接、对应 SHA、Windows/Linux 结果：
阻塞项及解除条件：
下一步：
```

避免 SHA 自引用：实现提交推送且验收通过后，再以小型文档提交记录该实现 SHA、CI 和完成状态；不把记录文件所在提交的 SHA 写进它自己。记录提交的 push/CI 在阶段报告中核实；若失败则如实补记，不能把实现已通过与记录已同步混为一谈。final tag 指向包括最终文档记录、并已通过质量门槛的最终提交。

### 阶段 1 验收记录（2026-10-27）

- **状态**：完成。工程配置、REPL、自动化测试和手工终端验收均完成，实现提交已推送并通过双平台 CI。完成记录以独立文档提交保存；该记录提交自身的推送和 CI 结果在阶段报告核实。
- **环境**：Windows；Node.js 24.15.0、npm 11.12.1。锁文件使用 npm 官方源；`npm ci --registry=https://registry.npmjs.org` 成功，官方源依赖审计 0 漏洞。
- **工程模块**：`a65140fc12c470a3bce460510649dde50ac67554` 建立工程、质量脚本和 CI，已推送至 origin/main。首次 [CI 40461811313](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40461811313) 的 Linux 成功，Windows 格式检查失败；未将首次失败记作验收通过。
- **独立修正**：`9ca1c8a3c83b0f64b3d41cc0135efad1878d8eb7` 统一检出换行与 Prettier 换行规则，已推送；[CI 40462330364](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40462330364) 的 Windows/Linux 均 completed/success。
- **REPL 模块**：`6e9f262e98c7c9be24d581b03a6a96490c4cb965` 实现输入循环、统一输出、可注入执行器和 10 项行为测试，单独推送至 origin/main；2026-10-27 使用 `git ls-remote` 核实远程分支与本地实现 SHA 一致。[CI 40463661746](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40463661746) 对应这一精确 SHA，Windows/Linux 均 completed/success，执行干净安装、格式检查、源码/测试类型检查、构建和测试。
- **REPL 本地证据**：`npm run typecheck` 检查源码和测试；`npm run build`、`npm run format:check`、`git diff --check` 通过。`npm test`：2 个测试文件、10 项通过，覆盖真实输入循环、输出、异常后继续、空输入 EOF、CRLF、末行无换行、原始文本保留、异步执行顺序、输入流错误及真实入口子进程。
- **手工终端验收**：在 Windows PTY 执行 `node dist/main.js`，看到欢迎语与 `svg>`；依次输入空行、`# terminal check`、`init`，前两项继续提示，后一项输出单行阶段占位错误；在空提示符 Ctrl+D 后退出码为 0。另以 `npm run cli` 启动源码入口并 Ctrl+D 退出，结果一致。
- **架构落地**：已建立 Repl、TerminalOutput、LineExecutor 和 CommandResult。CLI 使用依赖注入；本阶段未声称实现 Command、Composite、Factory/Registry 或 EditorSession Facade，也未接入领域状态。
- **阻塞项**：无。REPL 推送曾因 GitHub 连接超时和本机多账号凭据选择等待失败，已通过单次命令选择可用 HTTPS 解析地址及现有正确账号完成；未修改远程地址、系统网络配置或关闭证书校验。
- **当时的下一阶段目标**：阶段 2 实现通用 CommandParser，保留词元值与 quoted 标记，处理双引号、约定转义、空行和整行注释，词法错误不得调用执行入口；不提前实现领域模型或业务命令。此为阶段 1 完成时的记录，当前进度见下文，不创建 final tag。

阶段一非阻塞建议补强（2026-10-27）：采纳编译入口 CI 冒烟与异步执行期间输入流失败回归建议。`npm test` 现在先构建，再运行源码/编译入口及 REPL 测试，共 12 项通过；生产 REPL 无须修复。提交 `acb500b26fad7bbc1ae929d8e60a9e68487c40cb` 已推送，远程 SHA 已核实；[CI 40465418386](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40465418386) Windows/Linux 均通过。Git 直连不稳定，发现系统代理可用后仅在命令级使用该代理完成推送；未修改持久配置。

### 阶段 2 验收记录（2026-10-27）

- **状态**：完成。2A/2B 按顺序各自测试、提交并推送；本地、手工与双平台 CI 均通过。阶段完成以独立文档提交记录，该记录提交自身的推送及 CI 在阶段报告核实。
- **2A 实际实现与远程证据**：application 定义只读 CommandRequest/CommandToken；CommandParser 返回 skip/error/command 三类结果。提交 `99b3908c91ba370706018bef5034d121ebfbab60` 在开始 2B 前已单独推送，ls-remote SHA 核实一致；[CI 40465817080](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40465817080) 对应该精确 SHA，Windows/Linux 均 completed/success。2A 新增 24 项词法测试，加原 12 项回归共 36 项通过。
- **2B 实际实现**：Repl 每行原文交给 Parser，删除旧过滤；只对 command 结果调用 application CommandExecutor，对 error 统一呈现并继续。删除 CLI LineExecutor；组合根注入 Parser 和结构化占位执行器，后续 EditorSession 实现同一契约。欢迎语及根 README 如实说明当前能力。
- **2B 远程证据**：提交 `ca87dcff18be0be9a400a836326f62c115e1d4c0` 已单独推送至 origin/main，2026-10-27 使用 ls-remote 核实远程 SHA 与本地实现一致；[CI 40466534090](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40466534090) 对应该精确 SHA，Windows/Linux 均 completed/success。
- **本地证据**：Node.js 24.15.0 / npm 11.12.1，`npm test` 先构建再运行，3 文件 44 项通过（Parser 24、REPL 16、入口 4）；`npm run typecheck`、`npm run format:check`、`git diff --check` 均通过。覆盖引号、空文本、中文、#、in、转义/Windows 路径、词法错误不执行、错误恢复和语义透传；保留异步顺序、异步执行中输入失败、EOF/CRLF 及源码/编译入口回归。
- **手工验收**：Windows PTY 启动编译入口，空行及 `# "unclosed comment` 跳过；未闭合文本输出单行词法错误；下一条含中文/#/in 的完整命令进入阶段占位执行器；Ctrl+D 后退出码 0。
- **依赖与模式**：Parser 只依赖 application 数据契约，无文件系统或领域依赖；application 不引用 CLI；未增加名字分派。依赖注入与只读请求边界已落地，业务 Command、Composite、Factory/Registry 和 Facade 仍在后续阶段，不提前计数。
- **计划澄清**：原文“本阶段测试注册项契约”与阶段 3B 才引入注册项不一致，改为本阶段测试请求/执行器契约，阶段 3B 再测试注册项及语义校验，避免提前创建空框架。引号拼接等未规定行为已列为本方案决策。
- **阻塞与下一步**：无。阶段 3A 将实现领域抽象、文档树/id 索引、六种具体图形与工厂，验收构造、id 冲突、父子关系、同级顺序及模型受控修改；阶段 3B 再接入 EditorSession、分派器、init 与 CreateCommand。本次不开始阶段 3，不创建 final tag。

### 阶段 3A 验收记录（2026-10-27）

- **状态**：完成。按 3A.1 → 3A.2 → 3A.3 顺序分别验收、提交、push 并核实双平台 CI 后，才进入下一模块；完成记录另作小型文档提交，其自身推送和 CI 在阶段报告核实。
- **3A.1 图形契约**：提交 `34de27b4a1628f09bb1026644d9837cd441b4c71` 已推送；[CI 40468255670](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40468255670) 对应该精确 SHA，Windows/Linux 均 completed/success。Shape 封装大小写敏感 id 和可缺省公共样式；ContainerShape 提供容器类型边界，增加 4 项领域测试。
- **3A.2 六种图形与工厂**：提交 `1db5e7ff42b6cf2d06a7e105de0c1e0b7178e5f6` 已推送并以 ls-remote 核实；[CI 40470080167](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40470080167) 对应该精确 SHA，Windows/Linux 均 completed/success。六种独立图形类、带类型的创建数据和 Factory/Registry 落地；增加 15 项测试，共 63 项通过。有限数值、非负尺寸、可缺省样式、未知类型、重复注册及扩展结果身份均有验证；box 未实现。
- **3A.3 文档树与索引**：提交 `45aa8c8146b98f39b0c8024289c496de513e2b8e` 已推送，ls-remote 核实 origin/main 与本地 SHA 一致；[CI 40470589609](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40470589609) 对应该精确 SHA，Windows/Linux 均 completed/success。SvgDocument 统一维护尺寸、根顺序、父子关系、全树 id 索引与实例归属；增加 28 项文档测试，共 91 项通过。
- **文档树验收**：覆盖默认 800×600 与有限正数画布、大小写敏感 id、显式同级插入、嵌套查询、整树/子树前序遍历、叶子与容器的摘除/恢复、原对象行为保留及冻结快照。重复 id、缺失/叶子父节点、非法位置、环、重复子节点和跨文档重复实例均拒绝，比较失败前后的树、顺序、父节点、索引与候选归属确认无部分变更。千层树的插入、遍历和摘除恢复采用迭代处理；这是领域健壮性检查，不改变阶段 6 的 XML 深度上限。
- **本地质量门槛**：Windows，Node.js 24.15.0 / npm 11.12.1；`npm run typecheck`、`npm test`（pretest 构建后 6 文件 91 项通过）、`npm run format:check`、`git diff --check` 均通过。原 44 项 Parser/REPL/入口回归全部保留。
- **模式与依赖自查**：Factory/Registry 已实现，图形树建立 Composite 结构基础；几何递归操作留待 4B/4C，未声称完整 Composite 行为已验收。领域仅依赖领域抽象和数据契约；具体图形不反向依赖工厂，未引入额外类型名分派。详见 doc/README.md 一致性自查。
- **发现与修正**：生成工厂的开放类型 specification 与内置数据边界重叠，且扩展回调可返回错误身份，已通过入口互斥、重复注册保护与结果核对修正并测试，记录于过程记录。父子关系只保存在 SvgDocument，不在 Shape 上复制；摘除快照只表示拓扑，后续命令另存原位置及几何状态。
- **当前交付边界**：本阶段提供内部领域 API；CLI 仍使用阶段 2 的明确占位执行器，因此不进行虚假的 create/tree/show CLI 成功演示。没有阻塞项；远程公共 API 经代理一度限流，改用直连公共 API 后完成核实，未修改持久 Git/系统代理。
- **下一阶段 3B**：建立 EditorSession Facade、CommandDispatcher 和 Command 契约；提前实现 init；以 CreateCommand 接入首次图形编辑。CLI 几何参数与尾部未加引号 in 的验证接入同一工厂注册表；覆盖未初始化、参数数量/数值、缺少/重复 id、错误目标和未知类型，失败不改文档。3C 再接 tree/show/help；4A 再验收完整 undo/redo。本次不开始 3B，不创建 final tag。

### 阶段 3B 验收记录（2026-10-27）

- **状态与顺序**：完成。3B.1 推送和 CI 核实后才开发 3B.2；完成记录另作文档提交，其自身远程及 CI 在阶段报告核实。本次不跨阶段接入查询或历史。
- **3B.1 远程证据**：应用入口提交 `3659408e9650c2698441d49d33e1b33427e6869b`、文档修正 `f16c816532ffed585a79fd781593226c4a2c8f95` 一并推送，ls-remote 核实远程 main 为 f16c816；[CI 40472518602](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40472518602) 对应精确 f16c816 SHA，Windows/Linux 均 success，验证包含 3659408 的全部代码。本地当时 8 文件 108 项通过。
- **3B.2 远程证据**：`7854c5221f0bdc865e4a9b67c34fee4465500b90` 独立推送；2026-10-27 16:28–16:30（UTC+8）用 ls-remote 核实 origin/main 与本地一致；[CI 40473725887](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40473725887) 对应此精确 SHA，Windows/Linux 均 completed/success。
- **实际实现**：EditorSession Facade 经 CommandDispatcher 注册项执行 init/create；ShapeFactory 同一注册表提供结构化构造和 CLI schema，解析后返回候选 Shape 与 parentId；CreateCommand 保存图形实例、父 id 与首次同级位置，经领域接口插入/摘除。main 显式注入工厂。工厂词元采用 shapes 内只读结构契约，未反向依赖 application。
- **验收范围**：默认/单参数/浮点画布；六种类型根级及嵌套、可选样式和缺省样式、中文/空文本；文本/id in 与尾部 in 的区分。缺少或重复 id、参数数量/数值错误、非有限或负尺寸、错误父容器及 unknown box 被拒绝。失败前后比较画布、节点实例、索引、父关系、遍历和同级顺序，并验证后续正常命令可继续。
- **Command 边界**：直接验证执行→undo→再次 execute，恢复原身份与顺序，失败插入不推进命令状态。会话尚无 HistoryManager，CLI undo/redo、IO 锁定与 redo 清空留待 4A，不误报完整历史能力。
- **本地质量与手工证据**：Windows，Node.js 24.15.0 / npm 11.12.1；typecheck、npm test（先构建，10 文件 156 项）、format:check、git diff --check 全部通过。源码/编译入口各回放六种创建、嵌套及连续错误恢复。在 Windows PTY 实际创建 400×200 画布、scene 与中文文本，错误父目标 label 输出单行 not a container 后仍可创建矩形；Ctrl+D 退出码 0。
- **发现与修正**：初版工厂适配器 parentId 固定 null，空字符串坐标可经 Number 转成 0；已补齐返回边界、空值拒绝及回归。当前入口文档已同步移除占位描述。详细过程与依赖自查见 doc/README.md。
- **阻塞**：无。推送采用命令级代理与已有正确账户选项；匿名 API 限流后从公开 Actions 页面核实 SHA/CI，未更改持久配置或输出凭据。
- **下一阶段 3C**：接入 tree/show/help；帮助来自注册信息，显示采用多态属性视图，不增加类型名分派。验证层级、顺序、几何属性、show parent、help 未初始化可用及 init→create→tree/show 会话。继续逐模块测试、提交、push 与 CI 核实，不创建 final tag。

### 阶段 3C 验收记录（2026-10-27）

- **状态与顺序**：完成。3C.1 独立测试、提交、push 且 CI 验收后才开发 3C.2；阶段记录另作文档提交，其自身 push/CI 在最终报告核实。没有开始 4A 或创建 final tag。
- **3C.1 查询模块**：`53ab90c54e54df7b6673d71f0bc0271c0dabab0f` 已推送至 origin/main，并通过 ls-remote 核实；[CI 40476152693](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40476152693) 对应该精确 SHA，Windows/Linux 均 success。当时 11 文件 182 项通过。Shape 提供只读属性视图，五种叶子多态暴露几何，GroupShape 沿用空几何；DocumentFormatter 迭代展示文档关系，EditorSession 注册 tree/show。
- **3C.2 帮助模块**：`b3951314eee8bdae7c18797ad6864fc0b120bf0c` 独立推送，2026-10-27 16:55 前后（UTC+8）核实远程 SHA；[CI 40476788895](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40476788895) 对应该精确 SHA，Windows/Linux 均 success。CommandDispatcher 注册项保存语法回调；ShapeFactory 从同表 schema 生成内置创建语法，help 动态读取且可在 init 前使用。
- **验收范围**：完整树、指定子树/叶子、空画布/空组、同级顺序、六种几何、根及嵌套 parent、样式缺省和显式值。中文、引号、反斜杠及控制字符单行转义；冻结属性视图与 1500 层领域树迭代遍历。缺失 id、未初始化、错误参数均被拒绝，比较文档身份、属性、父关系、节点实例、索引与树输出确认无变更。help 不调用 parser/creator，后注册 CLI 类型自动出现，无 CLI parser 类型不冒充可创建。
- **本地门槛**：Windows，Node.js 24.15.0 / npm 11.12.1；npm run typecheck、npm test（pretest 先 build，12 文件 189 项通过）、npm run format:check、git diff --check 均通过。原 156 项回归保留；新增 33 项，包含源码和编译入口各自的真实查询与 help 会话。
- **手工验收**：在 Windows PTY 运行 node dist/main.js，创建 400×200 画布、scene 与中文文本，tree/show 显示真实层级与属性；缺失 id 报错后 tree scene 仍成功。另一次会话验证 init 前 help、help extra 单行错误、随后成功创建圆并 show，Ctrl+D 均退出 0。
- **模式与偏差**：复用 Factory/Registry、EditorSession Facade 和领域抽象；格式化职责留应用层，没有新增 Strategy 或标签分派。查询不构造编辑 Command；history 尚未实现，不能声称已验证查询保留 undo/redo。显示采用规范 width/height 和每属性一行，需求未规定的排版决策已写入第 5.2 节。help 仅列当前全部已实现命令，最终阶段须覆盖完整需求命令集。
- **发现与修正**：已有 getter 缺少统一显示入口，直接读取具体类型会违反分派约束；属性视图和多态已纠正。初版扩展帮助把未知参数显示为可选，改为语法未提供提示并测试。过程记录及实际 import 抽样已更新 doc/README.md；根 README 同步当前命令与可回放示例。
- **阻塞与下一阶段**：无。4A 接入 HistoryManager 和 CLI undo/redo，建立“成功编辑入栈、失败不改历史、undo/redo 成功后移动栈项、撤销后新编辑清空 redo、查询保留历史、成功 init 清空并锁定直到下一次成功编辑”的回归；delete/move/scale/set 留后续阶段。

### 阶段 4A 验收记录（2026-10-28）

- **状态与开发顺序**：完成。先审查并修正 Command 契约/帮助登记，再实现 4A.1，最后接入 4A.2；每个模块独立提交、推送、核实远程 SHA 和双平台 CI 后才进入下一个。此验收记录另作小型文档提交，其自身推送及 CI 在阶段报告核实。
- **优化提交**：`befdf883c018da9492b7fd0be03ff2aae306ed83`；[CI 40619565754](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40619565754) Windows/Linux completed/success。文档对齐构造注入、无参 execute/undo；应用层生成摘要，帮助语法回调必须显式登记，缺失时类型检查及运行时均拒绝。190 项测试通过。
- **4A.1 历史模块**：`0df252637570761410b2a2837175ea44063d8a9a`；[CI 40619961473](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40619961473) Windows/Linux completed/success。HistoryManager 管理命令与只读反馈、双栈和 IO 锁；成功后才推进栈状态。7 项专项测试覆盖 LIFO、原实例/顺序、多轮重做、失败重试、redo 分支清空及 IO 清栈/解锁，本地当时 197 项通过。
- **4A.2 会话接线**：`739e8df9058776430c77ae43f4235803e6a3744b`；[CI 40620604308](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40620604308) Windows/Linux completed/success。create 统一经 HistoryManager 执行 CreateCommand；init 候选构造成功后才替换并锁定历史。新增无参 undo/redo 注册与帮助，普通空栈、无文档及 IO 锁定错误均按方案处理。2026-10-28 用 ls-remote 核实三次模块推送的 origin/main 与对应本地 HEAD 一致。
- **本地验收**：Windows、Node.js 24.15.0 / npm 11.12.1；typecheck、npm test（含 pretest 构建）、format:check、git diff --check 均通过。14 文件 235 项：原 189 项全部保留，登记约束 1 项、历史 7 项、会话 36 项、两种真实入口新增 2 项。会话覆盖六种图形根级/组内恢复、嵌套顺序、查询/失败请求保留双栈、失败 init 保留文档/历史、成功 init 清空双栈及下一成功编辑解锁；入口回放覆盖待重做期间词法失败后仍可 redo、CRLF 和末行 EOF。
- **手工验收**：Windows PTY 运行 node dist/main.js，验证未初始化 undo、init 后 redo 锁定、中文文本 undo/redo、重复 id 后仍能 redo、show 实际 parent、新 init 锁定及新编辑重新建立历史；最后 tree 只显示新文档 fresh，Ctrl+D 退出码 0。
- **模式与职责**：HistoryManager 是 Command 的调用方，redo 复用同一对象；EditorSession Facade 负责摘要和生命周期，命令只负责领域恢复。没有新增命令名/类型名分派，Factory/Registry 沿用；Composite 几何行为尚未进入本次验收。命令自身必须保证失败原子性，历史管理器只保证失败时栈不推进。
- **发现与修正**：摘要前移一度改变父目标缺失错误，已先校验容器恢复原错误语义；模块表残留“命令结果”表述及未开放历史说明已同步纠正。过程记录只记上述生成物问题，常规进度留在此处。根 README 已补当前历史行为及示例。
- **阻塞与下一阶段**：无。下一阶段 4B 实现 DeleteCommand、MoveCommand、ScaleCommand，接入现有历史；删除恢复完整子树/父关系/同级位置，几何修改保存原值，覆盖容器递归、非法参数与溢出原子性。4B 内继续分模块推送，本次不开始 4B，不创建 final tag。

### 阶段 4B 模块进度（2026-10-28）

- **4B.1 delete**：`997de0fc5c133d4ce8a07c99b5ddb9f485836cfb` 已独立推送并核实远程 SHA；[CI 40625108180](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40625108180) Windows/Linux completed/success 后才开始移动模块。16 文件 246 项通过，typecheck、pretest 构建、format:check、diff 检查通过。新增子树恢复、身份/属性/父关系/顺序、冲突后重试、混合历史、删除 id 复用、失败保留双栈及源码/编译入口删除会话。
- **4B.2 move 本地验收**：18 文件 276 项全部通过；typecheck、pretest 构建、format:check、diff 检查通过。GeometryShape 封装数值，GeometryChange 捕获前后值，SvgDocument 迭代准备子树；MoveCommand 复用 GeometryCommand 快照生命周期，EditorSession 生成锚点或增量摘要。覆盖六种类型、双端点、精确浮点恢复、文本/样式保持、末端溢出失败后重试、未支持扩展拒绝、2000 层树和无变化编辑清空 redo；真实两种入口验证需求中的圆与容器移动反馈。远程核实见下一项。
- **4B.2 远程核实**：`6bfa85025df15f8e22ef29f3b96a2a45fb697281` 独立推送并以 ls-remote 核实；[CI 40625689104](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40625689104) Windows/Linux completed/success 后才开始缩放。Windows PTY 编译入口验证中文文本随组移动、0.1/0.2 撤销精确恢复、子树删除后查询报错、undo/redo 和 EOF 退出 0。
- **4B.3 scale 本地验收**：20 文件 314 项通过，typecheck、pretest 构建、format:check、diff 检查通过。ScaleCommand 复用既有 GeometryCommand/GeometryChange，领域统一验证正有限 factor，所有数值几何同乘，文字/样式/描边宽度不变。覆盖六种类型、2000 层树、末端坐标/尺寸/端点溢出原子性、有限下溢、十轮精确恢复、数值型扩展以及 create/move/scale/delete 混合历史；源码/编译入口各回放组缩放、失败保留 redo、后代溢出不改已有节点和 init 重锁。
- **4B.3 远程核实**：`3adeade1781061bc9d6aab9ff2952adcdce39930` 独立推送并以 ls-remote 核实；[CI 40626220947](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40626220947) 对应该精确 SHA，Windows/Linux completed/success。三个模块均前一实现远程/CI 核实后才开始下一模块。
- **阶段验收与环境**：完成。Windows、Node.js 24.15.0 / npm 11.12.1；20 文件 314 项通过，保留原 235 项回归，delete 新增 11、move 新增 30、scale 新增 38。所有源码/测试严格类型检查、pretest 构建、Prettier 及 diff 空白检查通过。Windows PTY 编译入口验证组移动/缩放、中文、精确恢复、scale 0 后仍可 redo、后代溢出不改已有矩形、删除子树恢复、init 锁定及 Ctrl+D 退出 0。
- **模式与架构调整**：Command 统一入历史，Composite 由文档迭代遍历唯一拓扑与 Shape 多态本地准备协作；GeometryShape 私有冻结数值封装，GeometryChange 保存精确状态；GeometryCommand 用模板方法复用 move/scale 生命周期。Facade 只做参数/摘要/历史编排，工厂注册点保持不变。抽查新命令、文档、五种叶子与基类，无反向依赖或新增按名字分派，一类一文件。
- **发现与纠正**：旧只读几何类缺少受控修改入口，逐个改后代无法保证后代溢出时状态不变；已改为全子树准备后统一应用并保存前后值。原“容器递归执行”的实现描述与唯一关系来源约束衔接不足，已明确文档层迭代协调，不在 GroupShape 复制 children；证据与修正写入 doc/README.md 过程记录。根 README 同步当前命令、可回放示例与数值边界。
- **记录提交与下一步**：本阶段记录独立作文档提交，避免自引用 SHA；其自身 push/CI 在本次最终报告核实。无阻塞。下一阶段 4C：SetAttributeCommand、按类型严格属性白名单、属性缺省与显式值的精确恢复、g 样式不覆写子节点及失败保持文档/历史。本次未实现 set、重组、IO、box，未创建 final tag。

### 阶段 4C 验收记录（2026-10-28）

- **状态与开发顺序**：完成。先实现/验收 4C.1，独立推送并核实其 Windows/Linux CI 后，再开始 4C.2；两个实现提交均已推送且精确 SHA 的 CI 成功。本验收记录另作小型文档提交，其自身推送与 CI 在阶段报告核实，避免 SHA 自引用。
- **4C.1 领域与命令**：`f1f069b9ab39fa5e9d715f327290b21775eb7052`；[CI 40629439341](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40629439341) Windows/Linux completed/success。Shape 提供公共样式 attributeType/prepareSet，GeometryShape 沿用坐标轴/尺寸声明，TextShape 补充 text；AttributeChange 封装已校验前后值，SetAttributeCommand 首次执行准备并缓存，undo/redo 恢复精确状态。21 文件 345 项通过，其中新增直接领域/命令测试 31 项，包含六种类型完整属性白名单、原型名字拒绝、准备不变更、非法值、缺省/显式属性恢复、本地容器样式、扩展和失败重试。
- **4C.2 CLI 与历史**：`f65f8ff573fe1c15c4a5365ac123b782ab5b2632`；[CI 40629995891](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40629995891) Windows/Linux completed/success。EditorSession 注册 set 和显式帮助语法，按多态属性类型转换 number/string，沿用有限非空数值校验。SetAttributeCommand 经 HistoryManager 执行，摘要由应用层 DocumentFormatter 生成；查询与编辑复用转义。撤销缺省样式明确显示 attribute removed，不伪造 black/none。不存在额外类型名分派，Parser 未增加语义职责。
- **远程核实**：每个模块推送后使用 ls-remote 核实 origin/main 与当时本地 HEAD 精确一致，再核对对应 SHA 的 CI completed/success；前一模块远程验收通过后才进入下一模块。
- **本地质量门槛**：Windows、Node.js 24.15.0 / npm 11.12.1；typecheck、npm test（含 pretest 构建）、format:check、git diff --check 均通过。最终 22 文件 392 项，保留原 314 项；领域/命令新增 31、应用会话新增 45、源码/编译入口新增 2。帮助既有断言同步新增 set，没有删除旧回归。
- **行为验收**：覆盖六种类型严格白名单、id/跨类型/别名/原型属性拒绝、有限非空数值和非负尺寸/半径/描边宽度、空文本与空样式、中文/引号/反斜杠/控制字符输出、容器样式不写后代、缺省/空/none/零的恢复、原实例/树/索引保持、失败保留双栈、成功原值编辑清空 redo、查询保留 redo、IO 锁定/新成功编辑解锁。set/move/scale/delete 混合历史五轮完整撤销重做后状态一致；数值扩展不改应用分派。
- **真实入口与手工证据**：源码 tsx 和构建入口均回放文本修改/恢复、词法/数值/未知属性失败后 redo、组样式与缺省恢复、转义/空文本、move/scale 混合历史、init 重锁及 EOF。另在 Windows PTY 运行 node dist/main.js，验证中文文本、set x 空字符串错误后 redo、组 fill 不改文本节点属性、撤销组 fill 重新缺失、零 stroke-width 恢复与重做、init 锁定；Ctrl+D 退出码 0。
- **文档与实际问题**：根 README 补齐 set 白名单、运行示例与恢复语义；架构同步属性准备契约和已实现命令。现有 readonly 样式/文本缺少受控入口、不能据 attributes 是否存在决定白名单的问题及修正写入过程记录；收尾发现模式正文/图中实现状态落后于源码，也已核对并更新。常规进度仅记在本节。
- **模式与范围**：Command 继续作为单次编辑历史单元，Composite 保持统一 Shape 接口与文档唯一拓扑，Factory/Registry 和 EditorSession Facade 延用现有职责；未新增模式或依赖反转。无阻塞。下一阶段 5A 实现 GroupCommand/AddToCommand，验证跨父归属/顺序、环拒绝、整条命令原子性和精确 undo/redo；继续按模块推送。本次未开始 5A、未实现 SVG IO 或 box，未创建 final tag。

### 阶段 5A 验收记录（2026-10-28）

- **5A.1 group 本地验收**：24 文件 420 项通过；typecheck、pretest 构建、format:check、git diff --check 通过。新增 TreeChange 与 SvgDocument.prepareGroup、GroupCommand 和应用层注册；按变更前文档顺序收编，同父插入最早位置，跨父放根末尾。命令保存受影响拓扑，校验完成后统一写入，支持精确恢复、冲突后重试及原实例保持。
- **专项证据**：同父根级/嵌套、非连续选择、逆序参数、跨父混合深度、单节点、重复/缺失/祖先选择、占用 id/实例、准备不写入、冻结查询、撤销/重做前结构变化、2000 层树；会话验证错误/查询保留 redo、新编辑清空 redo、init 锁定和 group/move/scale/set/delete 混合历史；源码与编译入口各回放一次。Windows PTY 验证中文、跨父组合、需求冲突错误、一次 undo 恢复原父及 redo，Ctrl+D 正常退出。
- **5A.1 远程核实**：`f81defa1d99982bc4d7045362358e0384536f2b4` 已独立推送，ls-remote 与本地 HEAD 一致；[CI 40633888614](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40633888614) Windows/Linux completed/success 后开始 addto。
- **5A.2 addto 本地验收**：26 文件 456 项通过，typecheck、pretest 构建、format:check、diff 检查通过。AddToCommand 复用 TreeChange，支持叶子/整棵子树跨父收编、移入祖先、同父移至末尾、已在末尾仍计入历史；错误保留树、索引、属性与历史。新增 36 项回归覆盖错误边界、混合历史、重试、深树和源码/编译入口。
- **5A.2 手工证据**：Windows PTY 运行编译入口，中文 text 随 branch 整棵收编；一次 undo 恢复 scene，成环错误后 redo 仍成功；同父 addto 把 text 移至 circle 之后，undo 恢复 text/circle 原序。Ctrl+D 退出码 0。间接环回归的失败复现与修正已记入最终文档过程记录。
- **5A.2 远程核实**：`405ffae0c4b931ab6cddeab9cf6f5d989320a29e` 已独立推送，ls-remote 与本地 HEAD 精确一致；[CI 40634425208](https://github.com/Mengyzh-2003/SVG-cli/actions/runs/40634425208) 对应该 SHA，Windows/Linux completed/success。
- **阶段结论与模式**：完成，无阻塞。保留原 392 项，group 新增 28、addto 新增 36，共 456 项。Command 保存同一 TreeChange 作为一次历史单元；Composite 沿用文档唯一关系来源，Factory/Registry 创建候选 g，Facade 编排参数、反馈与历史。未添加新的名字分派或多余模式。架构与使用说明同步已实现范围，过程记录仅记实际发现、确认及纠正。
- **记录提交与下一步**：本验收记录独立作文档提交，其自身 SHA、push/CI 在阶段报告核实，避免自引用。下一阶段 5B 实现 UngroupCommand：拒绝顶层容器解散；嵌套组的子节点按原顺序提升到原父中组所在的位置；一次 undo 恢复原组实例、父子归属和同级顺序，redo 重用保存结果；覆盖失败不改状态/历史、空组与混合历史。本次不开始 5B、5C 或 SVG IO，不实现 box，不创建 final tag。

### 阶段 5B 模块进度（2026-10-28）

- **5B.1 本地验收**：27 文件 477 项通过，保留原 456 项、新增领域/命令测试 21 项；typecheck、pretest 构建、format:check、git diff --check 通过。ContainerShape 默认 canUngroup=false，GroupShape 显式开放；SvgDocument.prepareUngroup 复用 TreeChange，将直接孩子按原顺序替换组所在位置，不展平更深子树、不复制样式。UngroupCommand 保存同一变更，整条操作作为一次可撤销单元。
- **5B.1 专项证据**：覆盖首/中/尾位置、空组、原实例与属性/缺省样式保持、冻结查询、顶层/叶子/缺失/受保护容器拒绝、准备不变更、失败后重试、id 复用及跨文档实例占用、陈旧拓扑拒绝与 2000 层结构。CLI 尚未注册 ungroup，远程 SHA/CI 推送后核实；下一模块为 5B.2 会话与真实入口。
