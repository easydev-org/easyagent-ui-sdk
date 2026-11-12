# Extension UI 框架设计

**状态**：草案，待评审
**范围**：`easyagent-ui-sdk`、`easyagent-webui`、`easyagent-ext-ui-host`、各 `-ext-ui`
**核心约束**（评审时确认）：**扩展只能用 iframe 渲染一个独立界面，不得注入脚本、改宿主 DOM、或替换宿主既有渲染。**

---

## 0. 一句话

把"扩展能提供什么"从宿主的硬编码分支，变成扩展自己的**声明**；宿主退化为一个**通用 iframe 槽位渲染器**，只负责「在正确的位置、用正确的上下文、把 iframe 挂上去」。

---

## 1. 现状：已经有的，和缺的

### 1.1 已有能力（不要重造）

| 能力                        | 位置                                                                       | 说明                                                                |
| --------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 扩展发现                    | `webui/src/lib/ext-catalog.svelte.ts`                                      | `GET /ext/<id>/api/v1/ui` → `{id, base, title, descriptions, icon}` |
| 整页面板                    | `webui/src/lib/pages/ExtensionsList.svelte` + `components/ExtPanel.svelte` | shelf 列表 → 点开是一个 `ext_view` 页                               |
| 工具卡片                    | `webui/src/lib/ext-card.ts`                                                | 工具结果里 `data.card = {ext, template}` → iframe                   |
| 主题下发                    | `ext-ui/src/protocol.ts`                                                   | `?theme=` + `easyagent:theme`                                       |
| 高度上报                    | `ext-ui/src/card.ts`                                                       | `easyagent:card-height`                                             |
| 请求打开视图                | `ext-ui/src/card.ts`                                                       | `easyagent:open-view`                                               |
| 数据桥（token 不进 iframe） | `webui/src/lib/ext-bridge.ts`                                              | iframe 发 `easyagent:ext-fetch`，宿主代发                           |
| 路由栈                      | `webui/src/lib/nav.ts`                                                     | `ext_view` 页，单例 key                                             |

**这已经是一个"一体化框架"的骨架**。真正缺的不是能力，而是**声明**和**上下文**。

### 1.2 三个结构性缺陷

**缺陷 A：发现协议太薄，宿主不知道扩展能提供什么。**
`/api/v1/ui` 只回答"我是谁、我什么颜色、我的图标在哪"。宿主于是只能猜一个入口：`/`。一个扩展有五个页面，shelf 里也只有一个图标，进去之后靠扩展自己画导航栏——每个扩展重复实现一遍。

**缺陷 B：新增扩展点必须改宿主代码。**
`ext-ui-host/internal/host/app.go` 里硬编码了：

```go
if tail == "api/v1/ui" { panels.Serve(...) }
if !strings.HasPrefix(tail, "api/") && tail != "desktop" && !strings.HasPrefix(tail, "desktop/") {
    panels.Serve(...)
}
```

`desktop/` 是 sandbox 扩展的私有代理前缀，**靠人记得住这个例外**。再有一个扩展需要 WebSocket 代理，就得再改一次这个文件，并且要重新理解一次这段注释。这不是扩展机制，是特例清单。

**缺陷 C：没有"上下文"这个概念。**
`ext_view` 页只带 `session: string`。宿主不知道"这个会话当前关联哪台沙箱"、"这个会话在看哪个 PR"。所以 sandbox 侧页现在做不出来——不是 UI 不会画，是**宿主没有语义可传**。

---

## 2. 扩展点模型

## 2.1 唯一允许的渲染形态

**每一个扩展点都是一个 iframe。** 不允许：

- ❌ 扩展返回 HTML 让宿主插入（Tailwind 类名在宿主构建时生成，外来 HTML 必然无样式，且是 XSS 面）
- ❌ 扩展注册脚本在宿主的 JS 上下文执行
- ❌ 扩展替换宿主对某类消息/工具的渲染器
- ❌ 扩展直接读写宿主 DOM 或 storage

**允许**：宿主在预定位置挂一个 `<iframe src="/ext/<id>/#<route>?…">`，通过 postMessage 传数据，通过数据桥代理 API 调用。

这条约束决定了下面所有扩展点的形状：**扩展点 = (宿主位置, iframe 的 route, 传给它的上下文)**。

### 2.1.1 这个约束真正买到了什么

值得说清楚，因为它不是"保守"，而是这个系统里唯一自洽的选择。

**iframe 是进程级隔离，不是礼貌约定。** 扩展 UI 由**另一个仓库、另一个 CI、另一个人**构建，宿主无法审计它的代码。同一个 origin 的 `<script>` 能读宿主内存里的 bearer token；`ext-bridge.ts` 花了整段注释论证为什么 token 不能进 iframe——如果扩展能在宿主上下文里跑代码，那段论证全部作废。

**已知的代价**（要在评审时接受）：

| 代价                          | 说明                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| 无法共享 Tailwind 类          | 扩展自带样式（现状如此，四个扩展都自带 `app.css`/`theme.css`） |
| 主题必须显式传递              | 已有的 `easyagent:theme` + `?theme=` 就是为此存在的            |
| 高度必须上报                  | 已有的 `easyagent:card-height`                                 |
| 每次交互多一层 postMessage    | 可接受，payload 是几百字节                                     |
| 焦点/键盘/无障碍跨 frame 有缝 | 侧页要处理 Esc、焦点回收（见 §6.1）                            |

**注意 iframe 的 `sandbox` 属性当前没有设置。** 由于面板和宿主同源（`/ext/<id>/` 与 `/` 同 origin，这是 `ExtPanel` 注释里明确的设计——面板要读 `localStorage` 里的 bearer），加 `sandbox` 会破坏同源访问。**这是一个真实的张力**：同源让面板能用宿主的 token（经 bridge），但也意味着面板的 JS 与宿主同源。

缓解手段（不在本次范围，但应记录）：将面板迁到独立子域 + `sandbox="allow-scripts"`（不给 `allow-same-origin`），那时 bridge 就是唯一通道。**这是本次设计不解决的问题，但不能假装它不存在。**

### 2.2 扩展点清单

按"宿主在何处挂 iframe"分类，这是唯一不会无限膨胀的划分。

#### A. 会话上下文内（`session.*`）

| ID             | 位置                               | 上下文                 | 生命周期                     | 例子                   |
| -------------- | ---------------------------------- | ---------------------- | ---------------------------- | ---------------------- |
| `session.side` | 会话页右栏（宽屏）/ 全屏页（窄屏） | `{session, selection}` | 用户从 ⋯ 菜单打开，可关闭    | **sandbox 侧页**       |
| `session.menu` | 会话 ⋯ 菜单里的一项                | `{session}`            | 点击即在 `session.side` 打开 | "本会话的沙箱"         |
| `session.card` | 消息流中一个工具结果位             | `CardPayload`          | 随消息存在                   | gitdev PR 卡片（已有） |

> **注**：`session.menu` 不是"注入菜单项"的通用机制，而是**打开一个 `session.side` 的入口**。菜单项本身就是声明的，宿主渲染，扩展拿不到菜单。这符合"只能 iframe"的约束。

#### B. 应用级页面（`page.*`）

| ID              | 位置                    | 上下文 | 例子                              |
| --------------- | ----------------------- | ------ | --------------------------------- |
| `page.main`     | shelf 里一个入口 → 整页 | `{}`   | gitdev 全屏、sandbox 全屏（已有） |
| `page.settings` | 设置页的一个分区        | `{}`   | 扩展自己的配置表单                |

#### C. 一次性浮层（`overlay.*`）

| ID              | 位置              | 上下文       | 例子     |
| --------------- | ----------------- | ------------ | -------- |
| `overlay.modal` | 模态框里的 iframe | 由调用方传入 | 迷你审批 |

> 这个我不建议先做。它和 `page.main` 的区别只是尺寸，而模态 iframe 的焦点陷阱、Esc 处理都要宿主重做一遍。留作观察项。

### 2.3 明确**不做**的扩展点

| 扩展点                                              | 为什么不做                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `decorator.*`（装饰消息文本、替换工具渲染）         | 需要扩展的代码进入宿主渲染路径，违反核心约束                                                 |
| `command` / `shortcut` / `context-menu`（任意注入） | 同上。`session.menu` 是**受限例外**：只允许"打开一个 side 页"                                |
| `session.header` / `session.footer`                 | 宿主既有布局，插入 iframe 会破坏密度；且它本质上就是 `session.side` 的退化，用同一个机制即可 |
| `notification`                                      | 需要扩展能主动推送。当前扩展只能被动响应 tool call，没有推送通道，先不做                     |

---

## 3. 声明：扩展怎么告诉宿主它能提供什么

### 3.0 先澄清一件事：`/api/v1/ui` 有两个来源，实际只有一个可达

这决定了 `contributes` 该写在哪，所以必须先说清楚。

| 来源                                                         | 谁回答                    | 部署中是否可达                 |
| ------------------------------------------------------------ | ------------------------- | ------------------------------ |
| 扩展后端 `extension.UISpec`（`easybus-sdk/extension/ui.go`） | 扩展进程自己              | **不可达**（被下面的路由抢走） |
| 面板的 `ui.json`（`ext-ui-host/internal/host/panels.go`）    | `ext-ui-host` 的 `Panels` | ✅ 唯一实际来源                |

`ext-ui-host` 的路由表里，`/ext/<id>/api/v1/ui` **显式**转发给 `panels.Serve`：

```go
if tail == "api/v1/ui" {
    panels.Serve(w, r)     // ← 不是转发给扩展
    return
}
```

所以浏览器请求的那个地址，答案来自**已安装面板的 `ui.json`**；扩展后端里 `UISpec.Descriptions` / `UISpec.Icon` 声明的那一份，只在直连扩展进程时可见，线上永远走不到。

**实测印证**（面板尚未安装时）：

```
直连 gitdev-ext  → {"id":"gitdev","base":"/ext/gitdev","title":"Git",...}   ← 扩展的答案
经 webui         → 404 Not Found                                          ← panels 的答案（未安装）
```

**结论**：`contributes` 唯一应该写的地方是 **`ui.json`**。

### 3.1 顺带指出一个已经存在的漂移

`title` / `descriptions` / `icon` 目前在**两个地方**各声明一次：

- 扩展后端 `UISpec.Title` / `.Descriptions` / `.Icon`
- 面板 `ui.json` 的同名字段

线上生效的是后者，前者是死代码——但没有人会从代码里看出这一点。这不是本次要修的，但**新增 `contributes` 时不要把同样的错误复制一遍**：只在 `ui.json` 声明，后端不再保留一份。

> 如果要根治，应该在 `extension.UISpec` 上标注这些字段"仅直连模式使用"，或者干脆删掉。这留给 `easybus-sdk` 单独决定。

### 3.2 静态声明（`ui.json`）

`ui.json` 现在只有 `title` / `descriptions` / `icon`。扩展为：

```json
{
  "title": "Sandbox",
  "descriptions": { "en": "Machines and jobs", "zh": "机器与任务" },
  "icon": "/icon.svg",
  "contributes": {
    "pages": [{ "route": "/", "title": "Machines", "description": "…" }],
    "sessionSide": [
      {
        "id": "sandbox",
        "route": "/side",
        "title": "Sandbox",
        "menuLabel": "本会话的沙箱",
        "selectionNamespace": "sandbox"
      }
    ]
  },
  "proxies": ["desktop"]
}
```

**为什么只能静态**：`page.main` 和 `session.menu` 的入口必须在**用户打开扩展之前**就出现在 shelf 和 ⋯ 菜单里。宿主读的是 `ui.json`，那是安装时就落盘的。没有任何"运行时动态声明"能在这个时刻提供信息。

**`selectionNamespace` 是关键字段**，见 §4。
**`proxies` 见 §6.2。**

### 3.3 不再需要"动态声明"

上一版草案设计了一个 `/api/v1/ui` 的动态贡献通道，用来处理"只有配了 token 才显示 PR 页"。**这个设计取消**，原因：

1. `Panels.serveInfo` 会拦截该路径，扩展的动态答案根本到不了浏览器；
2. 要让动态答案生效，就得改 `panels.Serve` 让它向扩展后端再发一次请求——为了一点可见性增加一次跨进程调用和一个失败点；
3. "此刻是否可用"本来就是前端能判断的：面板打开后自己调 API，不可用就在界面里说明。**入口一直存在、内容说明原因**，比"入口时有时无"更可预测。

**规则收敛为一条**：`contributes` 只写 `ui.json`，只描述"有哪些入口"，不描述"此刻是否可用"。

### 3.4 兼容

`contributes` 缺失 = 只有 `page.main` 指向 `/`。**现有四个扩展不改一行仍然工作**，这是硬要求。

---

## 4. 上下文模型：Session Scope

这是 sandbox 侧页的前提，也是整个设计里唯一需要新概念的地方。

### 4.1 问题

宿主不知道"sandbox"是什么，也不该知道。但 `session.side` 需要知道"显示哪台机器"。

如果宿主给扩展传 `sessionId`，扩展自己去查——扩展可以做到（它有 API），但它查完的结果宿主看不见。当用户切换机器时，宿主不知道该重渲染；当选中的机器被删除时，宿主不知道要提示。

### 4.2 方案：命名空间化的 selection

```ts
interface SessionContext {
  sessionId: string
  /** namespace -> id。宿主不解释 id，只负责存储和广播。 */
  selections: Record<string, string>
}
```

- 扩展在 `ui.json` 里声明 `selectionNamespace: "sandbox"`。
- 扩展通过 `easyagent:selection` 消息把 `{namespace: "sandbox", id: "dev-1"}` 写回宿主。
- 宿主存在内存（**不持久化**，session 换了就清空），并广播 `easyagent:session` 给该 session 下所有已挂载的 `session.side` iframe。
- 宿主对 `id` **完全不解释**。它只是个字符串。

这样：

- sandbox 侧页知道显示哪台机器 ✅
- 宿主不需要懂沙箱 ✅
- 另一个扩展只要声明同一个 namespace，就能读到同一个 selection（未来可以做"gitdev 读到当前 sandbox"）✅

### 4.3 边界

- selection **不跨会话**。切 session 就清空，避免 A 会话的沙箱 id 泄漏到 B。
- selection **不持久化**。刷新页面就丢。理由：它描述的是"此刻在看哪台"，不是配置。
- 同名 namespace 多个扩展**共享**。这是特性不是 bug——但要在文档里写清楚，避免两个扩展争抢同一 namespace。

---

## 5. 协议扩展（`@easydev-org/ext-ui`）

### 5.1 新增消息

| 消息                   | 方向       | 载荷              | 用途                                                |
| ---------------------- | ---------- | ----------------- | --------------------------------------------------- |
| `easyagent:session`    | Host→Frame | `SessionContext`  | 下发 session + selections（挂载时一次，变化时再发） |
| `easyagent:selection`  | Frame→Host | `{namespace, id}` | 扩展声明"我选中了 X"                                |
| `easyagent:view-close` | Frame→Host | `{}`              | 扩展请求关闭自己（侧页的"×"）                       |
| `easyagent:view-title` | Frame→Host | `{title}`         | 扩展更新侧页标题（如"沙箱 dev-1"）                  |

### 5.2 为什么只加这四个

- `session` / `selection` 是上下文闭环的最小集。
- `view-close` / `view-title` 是侧页的生命周期刚需：没有 close，扩展只能等用户点宿主按钮；没有 title，标题永远是静态的。
- **不加** `navigate`（`open-view` 已覆盖）、**不加** `notify`（没有推送通道，见 §2.3）。

### 5.3 框架侧 API

```ts
// frame 侧
export function sessionContext(): SessionContext | null // 最近一次收到的
export function onSessionChange(fn: (c: SessionContext) => void): () => void
export function setSelection(namespace: string, id: string): void
export function closeView(): void
export function setViewTitle(title: string): void
```

```ts
// host 侧
export function sessionContextMessage(c: SessionContext): … & {type: typeof MSG_SESSION}
export function selectionFrom(data: unknown): {namespace: string; id: string} | null
export function isViewClose(data: unknown): boolean
export function viewTitleFrom(data: unknown): string | null
```

沿用现有约定：**host 校验收到的，信任自己发的；frame 反之。**

---

## 6. 宿主实现改动

### 6.1 `webui`

**先纠正一个曾经写错的地方**：本设计早期草稿说要新增 `ExtSidePane.svelte` 和 `ext_side` 页面类型。**这是多余的。** `Shell.svelte` 早就是这个形状：

```svelte
const panes = $derived.by(() => {
  const stack = store.currentStack
  const n = isCompact ? 1 : 2            // 宽屏 2 栏，窄屏 1 栏
  const start = Math.max(0, Math.min(stack.length - n, stack.length - 1))
  return stack.slice(start).map(...)
})
```

宽屏时 Shell 渲染页面栈**最后 2 个**页面并排。所以「对话 + 侧页」= 从会话页 push 一个 `ext_view`，不需要任何新容器。

| 改动                                                             | 文件                             |
| ---------------------------------------------------------------- | -------------------------------- |
| 会话 ⋯ 菜单读扩展声明，渲染 `sessionMenu` 项                     | `pages/Chat.svelte`              |
| Session scope 的存储与广播                                       | 新模块 `session-scope.svelte.ts` |
| `ext-bridge` 增加 session / selection 通道                       | `ext-bridge.ts`                  |
| **不改** `nav.ts`、**不改** `Shell.svelte`、**不新增** side 容器 | —                                |

**窄屏行为**：`isCompact`（宽 < 640）时只渲染 1 栏，扩展面板占满屏并带返回按钮。这是 Shell 既有规则，与 `ExtPanel` 现在的表现一致。

**一个约束**：`ext_view` 的 key 是单例，**同时只能开一个扩展视图**。开沙箱侧页后再打开 gitdev 视图，后者替换前者。侧栏只有一个位置，这是合理的，但要写进用户文档。

### 6.2 `ext-ui-host`

| 改动                                         | 文件                                                |
| -------------------------------------------- | --------------------------------------------------- |
| `ui.json` 增加 `contributes` 解析与透传      | `internal/store/store.go`、`proto/ui/v1/host.proto` |
| `PanelInfo` 增加 `contributes` 字段          | 同上                                                |
| 代理前缀改为声明式（消除 `desktop/` 硬编码） | `internal/host/app.go`                              |

**关于代理前缀**：`ui.json` 增加

```json
{ "proxies": ["desktop"] }
```

宿主按声明路由 `/ext/<id>/desktop/*` → `<id>-ext`。这样 sandbox 的 `desktop/` 不再是宿主代码里的特例，新增扩展只改自己的 `ui.json`。

> 这是本设计里**唯一**需要扩展"声明额外代理前缀"的地方。它保留了"只有 iframe"的约束——代理的目标仍然是扩展自己的后端，宿主不做任何解释。

### 6.3 `ext-ui-host` 的路由 split 规则（保持不变）

```
/ext/<id>/api/*      → <id>-ext
/ext/<id>/<declared>/* → <id>-ext
/ext/<id>/           → 面板
```

---

## 7. sandbox 侧页的完整时序

作为验证设计是否够用的具体用例。

```
1. 扩展安装时，ui.json 声明：
   contributes.sessionSide = [{id:"sandbox", route:"/side", menuLabel:"本会话的沙箱", selectionNamespace:"sandbox"}]

2. 用户打开会话 → 宿主挂 Chat 页。

3. 用户点 ⋯ 菜单 → 宿主看到 sandbox 有 sessionSide 贡献 → 渲染一项"本会话的沙箱"。
   （入口始终存在。面板打开后若某台机器不可用，由面板自己在界面里说明原因，
     而不是让入口时有时无——见 §3.3。）

4. 点击 → 宿主：
   a. push 一个 side 页，带 {ext:"sandbox", route:"/side", session:sid}
   b. 挂 iframe: /ext/sandbox/?theme=dark&session=<sid>#/side
   c. 立刻发 easyagent:session {sessionId: sid, selections: {}}

5. 扩展收到 session → 调自己的 API 列出该会话的机器
   （走数据桥，token 不出 iframe）。

6. 扩展渲染列表，用户点了一台 → 扩展 setSelection("sandbox","dev-1")
   → 宿主存进 session-scope 并广播 → 扩展收到自己的 selection，开始轮询该机器的屏幕。

7. 用户切到另一个会话 → 宿主清空 session-scope，侧页随之消失（页面栈按 session 归属）。
   切回来 → 重新打开时 selections 为空，扩展按"默认第一台"处理。

8. 用户点 ⋯ 菜单里的同一项 → 若已打开则聚焦而非重复打开（key 单例）。
```

**这套时序暴露了一个必须解决的问题**：侧页打开后，用户切换会话怎么办？

选项：

- (a) 侧页跟随会话自动关闭（简单、可预测）→ **推荐**
- (b) 侧页保留，但内容随会话更新（复杂，且用户会困惑"我看的是哪个会话的机器"）

推荐 (a)，并在 `nav.ts` 里让 side 页的 key 带上 session id，切会话即出栈。

---

## 8. 开放问题（需要评审决定）

1. **`session.menu` 允许多少个？** 4 个扩展各有一项，菜单就长了。是否需要分组/折叠？
2. **同一扩展能否有多个 `sessionSide`？** 技术上可以（id 区分），但侧栏只有一个位置。是"同时只显示一个"还是"标签页"？
3. **`selection` 的默认值谁定？** 宿主不知道语义，只能传空，由扩展自己选默认。但如果两个扩展共享 namespace，谁先写谁赢——需要规则。
4. **侧页宽度**：固定 / 可拖拽 / 按扩展声明？建议先固定，宿主记住用户拖过的宽度。
5. **`page.settings` 是否必要？** 扩展现在通过 tool 或 API 管自己的配置，独立的设置分区可能是多余的。

---

## 9. 落地顺序

| 阶段  | 内容                                               | 价值               | 风险                    |
| ----- | -------------------------------------------------- | ------------------ | ----------------------- |
| **1** | `ui.json` 增加 `contributes.pages`，shelf 列出多页 | 立刻可见，不改协议 | 低                      |
| **2** | 声明式 `proxies`，消除 `desktop/` 硬编码           | 为后续扩展点清路   | 低                      |
| **3** | `SessionContext` + `session.side` + ⋯ 菜单         | **sandbox 侧页**   | 中（改协议 + 宿主布局） |
| **4** | `page.settings`、多 side 页                        | 锦上添花           | 低                      |

阶段 1、2 可以合并成一个 PR。阶段 3 需要先定 §8 的第 1、2、3 条。

---

## 附录 A：与备选方案的对比

**备选 1：扩展返回 HTML，宿主插入。** 否决——Tailwind 构建期生成类名，外来 HTML 必然无样式；且是 XSS 面。

**备选 2：扩展作为 Web Component 注册到宿主。** 否决——同一个 JS 上下文，扩展代码能读宿主内存里的 token，违反 `ext-bridge.ts` 已确立的"token 不出宿主"原则。

**备选 3：每个扩展点都是宿主里的 switch 分支。** 这就是现状，已证明会退化成特例清单（`desktop/`）。

**本方案**：扩展点 = 声明的 (位置, route, 上下文)。宿主是通用渲染器。唯一的新概念是命名空间化的 selection，且宿主不解释它。
