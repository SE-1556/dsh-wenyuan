# 文渊 · dsh-wenyuan

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的全部会话**一字不差**归档成本地可检索库，并在 Web 界面提供三视图面板。

> 名字取自**文渊阁**（明清皇家藏书楼）—— 藏书楼的意义是"独立于朝代更替"，对应这个项目"DSH 删了，数据还在"。

---

## 它解决什么问题

AI 的上下文是有限的，但硬盘不是。这个插件把"你和它说过的话、它跑过的命令、它想过的事"全部落成可检索的库，让 agent 能按需回查历史，而不是每次从零开始。

三个能力叠在一起：

| 层 | 提供者 | 干什么 |
|---|---|---|
| **归档** | `wy` 命令（独立） | 把 JSONL 会话日志解析成 SQLite，含思考过程、命令轨迹、附件 |
| **面板** | 本插件 | 在 DSH 侧边栏看时间轴、全文检索、统计洞察 |
| **导出** | `wy export --html`（独立） | 生成约 15 MB 单文件 HTML，双击即看，不依赖任何东西 |

---

## 工作原理

```
DSH 会话日志（.jsonl.zstd，多帧 zstd，真相源，只读）
        │
        │  wy ingest（增量、幂等、按 message.id 去重）
        ▼
   SQLite 归档库  wenyuan.db
   ├── sessions        会话树（含 parentSession / delegationDepth）
   ├── events          事件（正文 + 思考过程 + 命令参数 + 退出码）
   ├── attachments     附件（sha256 内容寻址，复制一份防 GC）
   └── events_fts      FTS5 全文索引（中文走 bigram 预切分）
        │
        ├──→ 本插件 Host 半：/wenyuan-api/* 只读接口（node:sqlite 直连）
        │         │
        │         └──→ Client 半：sidebar.panellist 图标 + main 面板
        │
        ├──→ 独立 CLI：wy search / wy show
        └──→ 单文件 HTML 导出
```

### 两个关键设计

**1. 中文检索必须 bigram 预切分**

FTS5 的 `unicode61` 把整句中文当一个词元，`trigram` 又要求至少 3 个字。实测两种都搜不到「会话」这类两字词。
所以入库时把文本切成相邻二字组合（`数据库` → `数据 据库`），查询时同样切分做 AND，单字查询走 `LIKE` 兜底。

**2. 面板的 API 不能放在 `/api` 下**

DSH 的 `connection` 服务用 `prefix: '/api'` 占了整个命名空间，未注册的端点一律返回 404。
所以本插件使用独立前缀 `/wenyuan-api`。

---

## 功能

| 视图 | 内容 |
|---|---|
| **阁** | 会话时间轴：主会话 / 子 agent 分层列表，点开看全文（思考、命令、图片），列表每 8 秒自动刷新 |
| **检** | 全文检索：中文 / 英文 / 单字，命中词高亮，点结果跳原文 |
| **鉴** | 洞察：会话数、事件数、库大小、每日曲线、24 小时活跃度、层级分布、事件类型 Top10 |

面板样式全部走 `--dsw-alias-*` 主题令牌，跟随 DSH 明暗切换。

---

## 前置条件

本插件是**归档库的读视图**，需要先有库和采集器：

| 依赖 | 说明 |
|---|---|
| **`wy` 命令** | 归档工具，提供 `ingest` / `search` / `export --html` |
| **文渊库** | 默认 `/root/wenyuan/wenyuan.db`，路径从 `/root/.wenyuan/config.json` 的 `root` 读取 |

没有这两样，面板会显示空列表（不会报错）。

---

## 安装

```yaml
# profile 的 cordis.patch.yml
- insert:
    - id: wenyuan
      name: 'dsh-wenyuan'
```

或通过 DSH 插件管理器安装。

> **发布者提示**：包名**不要带 scope**。实测 `@scope/name` 形式在本地导入流程中
> 会因需要建二级目录而写坏 `node_modules` 链接（产生自引用循环，DSH 启动时死循环）。
> 普通名（`dsh-wenyuan`）一次通过。

---

## 目录结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host：`/wenyuan-api/*` 只读接口 + `turn/end` 自动采集 |
| `client.js` | Client：`sidebar.panellist` 图标 + `main` 面板（阁/检/鉴） |
| `cordis.patch.yml` | 插入 `wenyuan` 条目 |

### Host 接口

| 路径 | 返回 |
|---|---|
| `GET /wenyuan-api/status` | 会话数、事件数、附件数、时间跨度 |
| `GET /wenyuan-api/sessions?limit=&offset=&depth=&q=` | 会话列表（`depth=0` 只看主会话） |
| `GET /wenyuan-api/session?id=&limit=&offset=` | 单会话详情（含图片引用） |
| `GET /wenyuan-api/search?q=&limit=` | 全文检索 |
| `GET /wenyuan-api/stats` | 每日 / 时段 / 类型 / 层级统计 |
| `GET /wenyuan-api/attachment?sha=` | 图片字节 |

---

## 配置

目前按本机约定硬编码，在 `index.js` 顶部 `DEFAULTS` 里：

| 键 | 默认值 | 说明 |
|---|---|---|
| `configPath` | `/root/.wenyuan/config.json` | 读库路径的配置文件 |
| `fallbackRoot` | `/root/wenyuan` | 配置不存在时的库目录 |
| `wyPath` | `/usr/local/bin/wy` | 采集命令 |
| `autoIngest` | `true` | 是否在 `turn/end` 时自动采集 |
| `debounceMs` | `1500` | 采集防抖窗口（毫秒） |
| `ingestTimeoutMs` | `120000` | 单次采集超时（毫秒） |

---

## 常见问题

**Q: 面板看不到最新的对话？**
A: 采集由 `turn/end` 触发，要等这一轮结束才入库；面板列表每 8 秒轮询。合计延迟约 10 秒。

**Q: 长会话只显示一部分？**
A: 详情页默认加载 3000 条事件（早期版本是 400，长会话会明显缺内容）。更长的会话需要分页，尚未实现。

**Q: 中文搜不到？**
A: 检查库是不是由 `wy ingest` 建立的（它负责 bigram 切分）。手写 SQL 建表不会带 `seg` 列，中文检索会失效。

**Q: 装了插件 DSH 起不来？**
A: 先看 `node_modules/<scope>/<name>` 是不是符号链接循环——`ls -la` 会显示 `name -> name`。
   是的话删掉它和 `.disabled` 标记，并从 `package.json` 的 `dependencies` 与 `dsh.profile.bundles`
   同时移除，再用 `dsh --profile <name> --dump-config` 验证退出码为 0。

---

## 开发

```bash
# 语法检查（没有构建步骤，client 是浏览器模块格式）
node --check index.js
node --check client.js

# 本地验证 Host 半能读到库
node --input-type=module -e "
  import { DatabaseSync } from 'node:sqlite'
  const db = new DatabaseSync('/root/wenyuan/wenyuan.db')
  console.log(db.prepare('select count(*) v from events').get())
"
```

Client 端没有打包步骤：`window.__ModuleLoader__.load({ id: '<包名>', factory })`，
其中 `id` 必须与 `package.json` 的 `name` 完全一致，否则模块加载不到。

---

## License

MIT
