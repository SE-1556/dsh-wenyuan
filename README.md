# 文渊 · dsh-wenyuan

把 DeepSeek Harness 上的全部会话**一字不差**归档成本地可检索库，并在 Web 界面提供一个三视图面板。

> 名字取自**文渊阁**（明清皇家藏书楼）—— 藏书楼的意义就是"独立于朝代更替"，对应这个项目"DSH 删了，数据还在"。

## 功能

| 视图 | 内容 |
|---|---|
| **阁** | 会话时间轴：主会话 / 子 agent 分层列表，点开看全文（思考过程、命令轨迹、图片） |
| **检** | 全文检索：中文（bigram 分词）/ 英文 / 单字，命中词高亮，点结果跳原文 |
| **鉴** | 洞察：会话数、事件数、库大小、每日曲线、24 小时活跃度、层级分布、事件类型 Top10 |

另外：

- **自动采集**：监听每轮对话结束（`session/event` 的 `turn/end`），增量入库（约 0.3 秒）
- **跟随主题**：面板样式全部走 `--dsw-alias-*` 令牌，明暗自动切换

## 前置条件

本插件是**归档库的读视图**，需要先有库和采集器：

| 依赖 | 说明 |
|---|---|
| **`wy` 命令** | 归档工具，提供 `ingest` / `search` / `export --html` |
| **文渊库** | 默认 `/root/wenyuan/wenyuan.db`，路径从 `/root/.wenyuan/config.json` 读 |

没有这两样，面板会显示空列表。

## 安装

```yaml
# profile 的 cordis.patch.yml
- insert:
    - id: wenyuan
      name: 'dsh-wenyuan'
```

或通过 DSH 插件管理器安装。

## 结构

| 文件 | 作用 |
|---|---|
| `index.js` | Host：注册 `/wenyuan-api/*` 只读接口（`node:sqlite` 直连库）+ `turn/end` 自动采集 |
| `client.js` | Client：注册 `sidebar.panellist` 图标与 `main` 面板 |
| `cordis.patch.yml` | 插入 `wenyuan` 条目 |

### Host 接口

| 路径 | 返回 |
|---|---|
| `GET /wenyuan-api/status` | 会话数、事件数、附件数、时间跨度 |
| `GET /wenyuan-api/sessions?limit=&offset=&depth=&q=` | 会话列表 |
| `GET /wenyuan-api/session?id=&limit=&offset=` | 单会话详情（含图片） |
| `GET /wenyuan-api/search?q=&limit=` | 全文检索 |
| `GET /wenyuan-api/stats` | 每日 / 时段 / 类型 / 层级统计 |
| `GET /wenyuan-api/attachment?sha=` | 图片字节 |

> 注意：接口前缀是 `/wenyuan-api` 而不是 `/api/wenyuan` —— `/api` 已被 DSH 的 connection 服务整体占用（prefix 路由），未知端点一律 404。

## 已知限制

- 库路径与 `wy` 路径目前按本机约定（`/root/wenyuan`、`/usr/local/bin/wy`），换环境需改 `index.js` 顶部 `DEFAULTS`
- 采集触发依赖 `wy ingest` 子进程，无 `wy` 时采集静默失败（面板仍可读库）

## License

MIT
