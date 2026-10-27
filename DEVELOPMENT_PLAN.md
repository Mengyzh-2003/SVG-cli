# SVG CLI 开发执行方案

版本：v1.1（2026-10-27）

## 1. 目标、依据与当前状态

本方案是后续逐阶段执行的基线，需求依据为 [phase_cli_1.md](phase_cli_1.md)，架构依据为 [doc/README.md](doc/README.md)。需求中的明确规定优先；本方案补充实现顺序、验收条件和未明确行为的默认决策。若发现冲突，先记录证据并修订文档，再调整实现。

目标是实现 TypeScript 面向对象 SVG CLI，覆盖 REPL、六种内置图形、层级编辑、Command 撤销重做、SVG 读写及规定错误。截至 2026-10-27，阶段 1、阶段 2 和阶段 3A 已完成，下一步为阶段 3B。持续进度及验收证据以第 8 节为准，不把本段当作永久状态。

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

当前实际接线为 `main.ts → Repl → CommandParser → CommandExecutor → CommandResult → TerminalOutput`。结构化 CommandRequest/CommandToken 与 CommandExecutor 位于 application；阶段 1 的 CLI LineExecutor 原始行接口已删除。空行/整行注释全部交由 Parser，REPL 不再过滤；词法错误不调用执行器。当前入口仍返回明确的阶段占位错误，阶段 3 再由 EditorSession 实现此契约；尚未实现命令分派器或完整 Facade。

### 3.2 主流程与分派限制

Repl → CommandParser → EditorSession → CommandDispatcher 的注册项 → 参数验证与处理器 → 领域模型或 IO → CommandResult → CLI 输出。

Parser 返回命令名与保留 quoted 信息的词元；结构化请求不要求 Parser 理解所有命令的语义。命令名到处理器只在 CommandDispatcher 注册表查找一次；create 的类型名及 SVG 标签只由同一个 ShapeFactory 注册表解析。每个注册项自行校验参数、提供帮助语法或创建对象。

词法状态判断、参数数量校验、属性白名单查找和多态方法调用不属于额外的类型分派；禁止在 Parser、SvgReader、tree/show 或业务命令中另写命令名/图形标签 switch。两处集中分派在架构中显式标注为待重构点，后续评估注册发现机制即可，不增加第三处分派。

### 3.3 设计模式

- **Command**：从首个 CreateCommand 开始使用；一条编辑一个 undo 单元。execute/undo/redo 使用同一命令对象，redo 重用已保存的执行结果，不重新解析输入。
- **Composite**：Shape 抽象统一叶子与 GroupShape 的 move/scale/set 契约；容器递归执行几何操作，删除和重组由 SvgDocument 维护子树及 id 索引。g 的公共属性设置保留 SVG 继承语义。
- **Factory/Registry**：ShapeFactory 集中注册六种具体图形，CLI 创建与 SVG 读入复用注册项；未来可新增提供者，本阶段不实现 box。
- **Facade**：EditorSession 提供稳定执行入口，编排处理器、历史和 IO；不承担具体图形运算或 XML 解析。

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

3C：接入 tree、show、help，完成 init → create → tree/show 的真实 CLI 回放。帮助语法来自命令注册信息；节点显示由多态描述或统一属性视图产生，不按 tag 分支。

验收：六种类型、默认 800×600、浮点参数、大小写不同 id、重复 id、缺少 id、create ... in g、目标缺失/非容器、unknown type（含 box）均覆盖；tree 内联几何属性，show 显示 parent。init 前依赖文档的命令按规定报错；help 可在未初始化时使用。

提交粒度：3A 领域和工厂；3B 创建闭环；3C 查询与帮助。此时完整 undo/redo 尚未验收，不伪报已完成。

### 阶段 4：History 与基础编辑

4A：HistoryManager 接入 CreateCommand，验证 undo/redo、IO 锁定状态与失败不改历史。init 成功清空历史并锁定；新成功编辑建立新的历史。

4B：实现 DeleteCommand、MoveCommand、ScaleCommand；删除保留整棵子树、原父节点和原同级位置；移动缩放保存旧几何状态，避免仅用逆运算导致浮点误差积累。

4C：实现 SetAttributeCommand 和严格的类型属性白名单，恢复时区分“属性不存在”与“显式值”。

验收：每条编辑均覆盖执行 → undo → redo；容器与叶子走统一接口；撤销后新成功编辑清空 redo，查询和失败编辑保留 redo。scale 非正数、非有限数和结果溢出不改状态；g 的 fill/stroke/stroke-width 保持容器自身属性；scale 只乘几何属性，不改 stroke-width。

提交粒度：4A、4B、4C 各自反馈、提交和推送；规模仍大时再按命令拆分。

### 阶段 5：组合与层级命令

5A：GroupCommand、AddToCommand。5B：UngroupCommand。5C：front/back 的 ReorderCommand。

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
| 重复选择和 addto 同父 | group 重复 id 拒绝；addto 到当前父容器仍按需求移到末尾，恢复时保留原位置 |
| 没有可用历史 | 未初始化先报 no document；IO 锁定优先报指定错误；其余空栈分别报 error: nothing to undo / error: nothing to redo |
| 默认保存路径 | read 成功记录读入路径；save 显式路径成功后也作为后续默认路径；init 清空路径；init 后首次无参 save 报 error: no file path. use 'save <file.svg>' first |
| 数值域 | 接受有限浮点与负坐标；尺寸、半径、stroke-width 不得为负，画布宽高及 scale factor 必须为正；参数过多、缺失和非数值一律拒绝 |
| init 可选尺寸 | init 默认 800×600；只给 w 时 h 取 600；canvas 修改必须同时给 w/h，无参只查询 |
| 成功但没有变化的编辑 | 若参数合法，按一次成功编辑记录，包括 move 0 0、scale 1、已在最前的 front；因此会清空 redo 并解除 IO 锁定 |
| 外部 SVG 的 transform、附加属性和未知元素 | CLI set 白名单不等于读入丢弃属性。保留六种支持节点上的附加普通属性（含 transform、字体属性）及根 viewBox；不展开 transform，move/scale 作用于节点本地几何。未知图形标签明确拒绝，XML 声明/注释跳过；不静默删掉未知图形。阶段 6 为此添加 fixture，暂不承诺完整 SVG/CSS/引用系统 |
| 重组带样式或 transform 的 g | 按规定重建树关系，不额外计算世界坐标或补偿继承样式；外部变换下重组可能改变渲染，不能宣称保持视觉不变。必要时在阶段 6 记录更严格的支持边界 |
| canvas 与 viewBox | init 默认 viewBox 为 0 0 w h；read 保留原 viewBox；canvas 修改尺寸时同步设为 0 0 w h，查询不改动 |

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
| 3A 领域与工厂 | 完成 | 3A.1 `34de27b`、3A.2 `1db5e7f`、3A.3 `45aa8c8` 已分别推送并核实 SHA；三个实现提交的 Windows/Linux CI 均通过（链接见下文）；91 项测试及全部本地质量检查通过 | 无 | 等待阶段 3B 任务 |
| 3B init/create Command | 未开始 | — | 无，依赖 3A | 按阶段 3B 验收 |
| 3C tree/show/help | 未开始 | — | 无，依赖 3B | 按阶段 3C 验收 |
| 4A History | 未开始 | — | 无，依赖 3C | 按阶段 4A 验收 |
| 4B delete/move/scale | 未开始 | — | 无，依赖 4A | 按阶段 4B 验收 |
| 4C set | 未开始 | — | 无，依赖 4B | 按阶段 4C 验收 |
| 5A group/addto | 未开始 | — | 无，依赖 4C | 按阶段 5A 验收 |
| 5B ungroup | 未开始 | — | 无，依赖 5A | 按阶段 5B 验收 |
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
