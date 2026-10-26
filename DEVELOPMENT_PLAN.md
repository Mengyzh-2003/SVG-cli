# SVG CLI 开发执行方案

版本：v1.0（2026-10-26）

## 1. 目标、依据与当前状态

本方案是后续逐阶段执行的基线，需求依据为 [phase_cli_1.md](phase_cli_1.md)，架构依据为 [doc/README.md](doc/README.md)。需求中的明确规定优先；本方案补充实现顺序、验收条件和未明确行为的默认决策。若发现冲突，先记录证据并修订文档，再调整实现。

目标是实现 TypeScript 面向对象 SVG CLI，覆盖 REPL、六种内置图形、层级编辑、Command 撤销重做、SVG 读写及规定错误。当前只有需求和设计文档，没有生产代码；下列阶段均为待执行。

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

工作：建立 package.json、锁文件、严格 TypeScript 配置、.gitignore、运行和测试入口；实现可注入输入输出的 Repl、统一结果呈现和 EOF 正常退出。约定 npm run cli、npm run typecheck、npm run build、npm test；使用一个测试框架即可。

验收：npm run cli 能启动并显示欢迎语和 svg>；EOF 能结束；空输入不出错；利用假的应用入口验证成功和单行 error: 输出，不冒充已有领域命令。自动化测试必须覆盖真实输入循环，并安排一次真实交互终端检查提示符。

提交粒度：工程配置与运行入口；REPL 和输入输出测试。不得将 node_modules、dist、coverage 或临时输出纳入 Git。

### 阶段 2：Parser 与请求边界

工作：实现通用词法解析；保留词元值与 quoted 标记；命令参数校验框架随注册项提供，不建立第二套命令分发表。此阶段只测试注册项契约，不提前实现所有业务命令。

验收：双引号中的空格、中文、空字符串、# 和 in 能保留；未闭合引号产生一行错误；以 # 开头的整行跳过，参数中的 #ffffff 不视作注释。约定支持双引号内的 `\"` 和 `\\` 转义，未识别的反斜杠序列保留，避免破坏 Windows 路径。词法错误不会调用应用执行入口。

提交粒度：词法解析与边界测试。create 参数数量、数值和 in 的语义测试随阶段 3 的注册项落地。

### 阶段 3：领域、工厂与首个 CLI 闭环

3A：实现 Shape/ContainerShape 抽象、SvgDocument、六种具体图形和 ShapeFactory。字段封装；通过受控领域操作维护父子关系、根顺序和唯一 id 索引，不公开可修改的 children 数组。

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

6A：内存 SVG 编解码，选用成熟 XML 库；验证命名空间、层级、属性、text 子文本、实体转义和默认外观。读取完整临时文档后才替换当前文档；先收集显式 id，再补缺失 id。

6B：read/save 文件适配、路径上下文、文件错误转换；save 在同目录生成临时文件后替换目标，失败清理临时文件。保存成功后才更新默认保存路径和历史状态，失败保留原状态。

6C：补齐 canvas 查询与修改以及所有文档命令的历史规则；接入 read/save 完整 CLI 回放。

验收：显式 id 重复拒绝、自动 id 不与后续显式 id 冲突、每个补全产生规定 warning；读入失败保留当前文档/路径/历史。文本含中文、引号、&、<、> 可保存读回；fill/stroke 省略时保持属性缺省，不写入人为默认值。保存后能在浏览器显示，并读回相同尺寸、顺序、结构、属性和文本。

成功 init/read/save/canvas 修改后，undo 和 redo 均输出 error: undo not allowed after io command；下一次成功编辑开始新历史。canvas 无参、tree/show/help 不改历史；失败的文档命令也不锁定或清空已有历史。

提交粒度：6A、6B、6C。XML 往返测试先于文件路径测试，防止 IO 与模型问题混在一起。

### 阶段 7：端到端验收与提交收尾

工作：回放需求第 6 节及 6.1 版本 A；覆盖全部命令、规定错误、状态不变和 round-trip。版本 B 的 box 不执行成功验收，单独验证 unknown shape type。把示例会话的关键输出作为稳定断言，不用无关的空格对齐快照替代语义测试。

验收：在干净检出后按锁文件 npm ci，运行 typecheck/build/test；检查 CLI、浏览器预览和 Git 历史；检查一类一文件、字段封装、两处分派和全部 import 方向。doc/README.md 的一致性自查必须记录实际抽样文件和结果，质量保证写实际命令和证据，不把计划写成已通过。

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

## 7. 提交、反馈与文档规则

继续在 main 顺序开发，不按模块创建分支；大范围实验才使用临时分支。每次提交聚焦一个已验证的小模块，禁止最后把全部模块汇总成一次大提交，也不伪造或重写历史制造开发过程。

每次小模块完成按顺序执行：

1. 对照当前阶段验收项运行必要测试、类型检查；检查 diff 和依赖方向。
2. 向用户反馈实现内容、验证结果、首次使用的模式及落地点、发现的问题和实际架构偏差。
3. 必要时更新架构及过程记录；stage 精确文件，形成一个可说明目的的 commit。
4. push 并核验远程提交与本地 HEAD；失败如实报告并保留本地提交，不宣称同步成功。
5. 完成当前阶段报告后等待下一次阶段任务，不自动跨阶段扩展。

doc/README.md 的过程记录只记自己从生成文档或代码发现的问题、确认依据与纠正方式。常规开发进度保存在提交和阶段报告中；根目录本方案跟踪执行顺序，架构文档跟踪最终职责和实际一致性，避免两处维护重复的大段设计。

## 8. 执行检查表

- [ ] 阶段 1：工程与 REPL
- [ ] 阶段 2：词法 Parser
- [ ] 阶段 3A：领域与工厂
- [ ] 阶段 3B：init/create Command 闭环
- [ ] 阶段 3C：tree/show/help
- [ ] 阶段 4A：History
- [ ] 阶段 4B：delete/move/scale
- [ ] 阶段 4C：set
- [ ] 阶段 5A：group/addto
- [ ] 阶段 5B：ungroup
- [ ] 阶段 5C：front/back
- [ ] 阶段 6A：SVG 编解码
- [ ] 阶段 6B：文件与路径
- [ ] 阶段 6C：canvas 与文档历史
- [ ] 阶段 7：全量验收、最终文档和 final tag
