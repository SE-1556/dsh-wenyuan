/**
 * 文渊 · Host 半
 *
 * 职责：
 *   1. 注册 /api/wenyuan/* 只读接口（node:sqlite 直连库，不依赖 Python 服务）
 *   2. 监听 turn/end，自动采集（调 wy ingest，幂等增量）
 *
 * 设计原则：
 *   - 只读：不提供写接口，避免和采集器抢写锁
 *   - 失败隔离：采集失败只记日志，绝不影响会话
 *   - 库路径可配：默认读 /root/.wenyuan/config.json 的 root
 */
import { DatabaseSync } from 'node:sqlite'
import { execFile } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'dsh-wenyuan'

// Cordis 要求先声明才能访问 ctx.webServer（否则属性访问本身抛错）
export const inject = ['webServer', 'tools']

const DEFAULTS = {
  configPath: '/root/.wenyuan/config.json',
  fallbackRoot: '/root/wenyuan',
  wyPath: '/usr/local/bin/wy',
  autoIngest: true,
  debounceMs: 1500,
  ingestTimeoutMs: 120000,
}

/* ─────────── 配置 / 库路径 ─────────── */
function resolveRoot(cfg) {
  try {
    if (existsSync(cfg.configPath)) {
      const j = JSON.parse(readFileSync(cfg.configPath, 'utf8'))
      if (j && typeof j.root === 'string') return j.root
    }
  } catch {}
  return cfg.fallbackRoot
}

/* ─────────── 工具 ─────────── */
function bigrams(s) {
  if (!s) return ''
  const c = String(s).replace(/\s+/g, '')
  const out = []
  for (let i = 0; i < c.length - 1; i++) out.push(c.slice(i, i + 2))
  return out.join(' ')
}

function sendJson(res, obj, code = 200) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

const fmtErr = (e) => String((e && e.message) || e)

/* ─────────── 查询层 ─────────── */
class Store {
  constructor(root) {
    this.root = root
    this.con = null
    this.conPath = null
  }
  db() {
    const p = join(this.root, 'wenyuan.db')
    if (this.con && this.conPath === p) return this.con
    try { this.con?.close?.() } catch {}
    this.con = new DatabaseSync(p)
    this.conPath = p
    return this.con
  }
  status() {
    const db = this.db()
    const one = (sql) => db.prepare(sql).get()?.v ?? null
    return {
      sessions: one('SELECT count(*) v FROM sessions'),
      events: one('SELECT count(*) v FROM events'),
      attachments: one('SELECT count(*) v FROM attachments'),
      first_ts: one('SELECT min(ts) v FROM events'),
      last_ts: one('SELECT max(ts) v FROM events'),
      root: this.root,
    }
  }
  sessions({ limit = 50, offset = 0, depth = null, q = null } = {}) {
    const db = this.db()
    const where = []
    const args = []
    if (depth !== null && depth !== undefined && depth !== '') {
      where.push('s.depth = ?'); args.push(Number(depth))
    }
    if (q) {
      where.push("(COALESCE(s.title,'') LIKE ? OR s.id LIKE ?)")
      args.push(`%${q}%`, `%${q}%`)
    }
    let sql = `SELECT s.id, s.created_at, s.depth, s.origin, s.parent_id,
                      COALESCE(s.title,'(无标题)') title, s.last_ts,
                      (SELECT count(*) FROM events e WHERE e.session_id=s.id) events
               FROM sessions s`
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?'
    args.push(limit, offset)
    const items = db.prepare(sql).all(...args)
    const total = db.prepare('SELECT count(*) v FROM sessions').get()?.v ?? 0
    return { items, total }
  }
  session(sid, limit = 200, offset = 0) {
    const db = this.db()
    const meta = db.prepare(`SELECT s.*, (SELECT count(*) FROM events e
                              WHERE e.session_id=s.id) events
                              FROM sessions s WHERE s.id=?`).get(sid)
    if (!meta) return null
    const events = db.prepare(`SELECT seq, ts, type, turn, step, role, text,
                               reasoning, tool_name, args_json, is_error, exit_code
                               FROM events WHERE session_id=? ORDER BY seq
                               LIMIT ? OFFSET ?`).all(sid, limit, offset)
    const images = db.prepare(`SELECT a.sha256, a.name, a.media_type, a.bytes,
                               a.width, a.height, a.local_path
                               FROM event_attachments ea
                               JOIN attachments a ON a.sha256=ea.sha256
                               WHERE ea.event_id LIKE ?`).all(sid + ':%')
    return { meta, events, images }
  }
  sessionDialog(sid, limit = 40, offset = 0) {
    const db = this.db()
    const TYPES = "('user/message','assistant/message','tool/call','tool/result')"
    const meta = db.prepare(`SELECT s.*, (SELECT count(*) FROM events e
                              WHERE e.session_id=s.id AND e.type IN ${TYPES}) events
                              FROM sessions s WHERE s.id=?`).get(sid)
    if (!meta) return null
    const events = db.prepare(`SELECT seq, ts, type, role, text, reasoning,
                               tool_name, args_json, is_error, exit_code
                               FROM events
                               WHERE session_id=? AND type IN ${TYPES}
                               ORDER BY seq LIMIT ? OFFSET ?`).all(sid, limit, offset)
    return { meta, events }
  }
  search(q, limit = 30) {
    const db = this.db()
    const query = (q || '').trim()
    if (!query) return { items: [], total: 0 }
    let rows = []
    if (query.replace(/\s+/g, '').length < 2) {
      rows = db.prepare(`SELECT e.session_id, e.seq, e.ts, e.type, e.role,
                                substr(COALESCE(e.text,''),1,200) snip_text,
                                substr(COALESCE(e.reasoning,''),1,200) snip_rsn
                         FROM events e
                         WHERE e.text LIKE ? OR e.reasoning LIKE ?
                         ORDER BY (CASE WHEN e.role='user' THEN 0 ELSE 1 END),
                                  e.ts DESC LIMIT ?`)
        .all(`%${query}%`, `%${query}%`, limit)
    } else {
      const match = bigrams(query).split(' ').map((t) => `"${t}"`).join(' AND ')
      try {
        rows = db.prepare(`SELECT e.session_id, e.seq, e.ts, e.type, e.role,
                                  snippet(events_fts, 1, '[[', ']]', '…', 16) snip_text,
                                  snippet(events_fts, 2, '[[', ']]', '…', 16) snip_rsn
                           FROM events_fts JOIN events e ON e.rowid = events_fts.rowid
                           WHERE events_fts MATCH ?
                           ORDER BY (CASE WHEN e.role='user' THEN 0 ELSE 1 END),
                                    rank, e.ts DESC LIMIT ?`)
          .all(match, limit)
      } catch { rows = [] }
    }
    const tstmt = db.prepare("SELECT COALESCE(title,'') v FROM sessions WHERE id=?")
    for (const r of rows) r.session_title = tstmt.get(r.session_id)?.v || ''
    return { items: rows, total: rows.length }
  }
  stats() {
    const db = this.db()
    const daily = {}
    for (const r of db.prepare('SELECT ts, role FROM events WHERE ts IS NOT NULL ORDER BY ts').all()) {
      const d = new Date(r.ts)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const o = daily[key] || (daily[key] = { events: 0, user: 0, assistant: 0 })
      o.events++
      if (r.role === 'user') o.user++
      else if (r.role === 'assistant') o.assistant++
    }
    const hourly = new Array(24).fill(0)
    for (const r of db.prepare('SELECT ts FROM events WHERE ts IS NOT NULL').all()) {
      hourly[new Date(r.ts).getHours()]++
    }
    const bytype = db.prepare('SELECT type, count(*) c FROM events GROUP BY type ORDER BY c DESC LIMIT 15').all()
    const depths = db.prepare('SELECT depth, count(*) c FROM sessions GROUP BY depth ORDER BY depth').all()
    return { daily, hourly, bytype, depths }
  }
  findSession(prefix) {
    const db = this.db()
    const rows = db.prepare("SELECT id, title FROM sessions WHERE id LIKE ? LIMIT 2").all(prefix + '%')
    if (rows.length === 1) return rows[0]
    if (rows.length > 1) return { ambiguous: rows.map(r => r.id) }
    return null
  }
  attachmentPath(sha) {
    if (!/^[0-9a-f]{64}$/.test(sha)) return null
    return join(this.root, 'attachments', sha.slice(0, 2), sha)
  }
}

/* ─────────── 插件 ─────────── */
export function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config || {}) }
  const root = resolveRoot(cfg)
  const store = new Store(root)
  const log = (m) => { try { ctx.logger?.info?.(`[wenyuan] ${m}`) } catch {} }

  /* ── 1. HTTP 接口 ── */
  ctx.effect(() => {
    const off = ctx.webServer.register({
      kind: 'prefix',
      path: '/wenyuan-api',
      async handler(req, res) {
        const u = new URL(req.url, 'http://127.0.0.1')
        const p = u.pathname.replace(/^\/wenyuan-api/, '') || '/'
        const p0 = (k, d) => u.searchParams.get(k) ?? d
        try {
          if (p === '/status') return sendJson(res, store.status())
          if (p === '/sessions') return sendJson(res, store.sessions({
            limit: Number(p0('limit', 50)), offset: Number(p0('offset', 0)),
            depth: p0('depth', null), q: p0('q', null),
          }))
          if (p === '/session') {
            const d = store.session(p0('id'), Number(p0('limit', 200)), Number(p0('offset', 0)))
            return d ? sendJson(res, d) : sendJson(res, { error: 'not found' }, 404)
          }
          if (p === '/search') return sendJson(res, store.search(p0('q', ''), Number(p0('limit', 30))))
          if (p === '/stats') return sendJson(res, store.stats())
          if (p === '/attachment') {
            const file = store.attachmentPath(p0('sha', ''))
            if (!file || !existsSync(file)) return sendJson(res, { error: 'not found' }, 404)
            const data = readFileSync(file)
            res.writeHead(200, {
              'Content-Type': 'image/*',
              'Content-Length': String(data.length),
              'Cache-Control': 'public, max-age=86400',
            })
            return res.end(data)
          }
          return sendJson(res, { error: 'unknown endpoint' }, 404)
        } catch (e) {
          sendJson(res, { error: fmtErr(e) }, 500)
        }
      },
    })
    return () => { try { off?.() } catch {} }
  })

  /* ── 2. Agent 工具（让我能主动查历史） ── */
  ctx.effect(() => {
    if (!ctx.tools) { log('tools 服务不可用，跳过工具注册'); return () => {} }

    const fmtTime = (ts) => {
      if (!ts) return '—'
      const d = new Date(ts + 8 * 3600 * 1000)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
    }

    // ── 检索 ──
    const offSearch = ctx.tools.register({
      name: 'wenyuan_search',
      description:
        '检索历史会话归档（文渊库），包含用户的输入、AI 的正文与思考过程、执行过的命令。'
        + '当需要回忆"上次是怎么解决的""之前定过什么方案""用户以前提过什么"时优先调用它，'
        + '比凭记忆猜更可靠。中文/英文/单字均可检索。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索词。中文两字以上最准（如"数据库""亿纬"），英文按词匹配，单字也支持。' },
          limit: { type: 'number', description: '返回条数，默认 10，最大 50。' },
        },
        required: ['query'],
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  session_title: { type: 'string' },
                  ts: { type: 'string' },
                  role: { type: 'string' },
                  text: { type: 'string' },
                  reasoning: { type: 'string' },
                },
              },
            },
          },
        },
        render(args, value) {
          let items = (value && value.items) || []
          if (!items.length) return [{ type: 'text', text: `没有命中「${args.query}」。可以换个词，或去掉修饰语只留核心名词。` }]
          const NOISE = ['<system-reminder>', 'Current runtime context', 'Updated instructions from:']
          items = items.filter((it) => !NOISE.some((k) => String(it.text || '').startsWith(k)))
          const lines = [`找到 ${items.length} 条（${args.query}）：`]
          items.forEach((it, i) => {
            lines.push('')
            lines.push(`${i + 1}. [${it.ts}]《${(it.session_title || '').slice(0, 24)}》${it.role === 'user' ? '【用户】' : '【AI】'}`)
            if (it.text) lines.push(`   ${String(it.text).replace(/\s+/g, ' ').slice(0, 260)}`)
            if (it.reasoning) lines.push(`   ⟨思考⟩ ${String(it.reasoning).replace(/\s+/g, ' ').slice(0, 200)}`)
          })
          lines.push('')
          lines.push('需要看完整上下文时，用 wenyuan_read 传会话标题或 id 前缀。')
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      async execute(args) {
        const q = String((args && args.query) || '').trim()
        if (!q) throw new Error('query 不能为空')
        const limit = Math.min(Math.max(Number((args && args.limit)) || 10, 1), 50)
        const r = store.search(q, limit)
        for (const it of r.items) {
          it.ts = fmtTime(it.ts)
          it.text = it.snip_text || ''      // render 读 text，库返回 snip_text
          it.reasoning = it.snip_rsn || ''
          delete it.snip_text
          delete it.snip_rsn
        }
        return r
      },
    })

    // ── 读会话 ──
    const offRead = ctx.tools.register({
      name: 'wenyuan_read',
      description:
        '读取文渊库里某个会话的内容（含思考过程与命令轨迹）。'
        + '先用 wenyuan_search 找到会话，再用本工具看上下文。也支持传用户给出的会话标题关键词。',
      parameters: {
        type: 'object',
        properties: {
          session: { type: 'string', description: '会话 id 前缀，或标题关键词。' },
          limit: { type: 'number', description: '最多返回多少条事件，默认 40，最大 300。' },
          offset: { type: 'number', description: '从第几条开始（默认 0），用于分段看长会话。' },
        },
        required: ['session'],
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            total: { type: 'number' },
            lines: { type: 'array', items: { type: 'string' } },
          },
        },
        render(args, value) {
          if (!value) return [{ type: 'text', text: '没找到匹配的会话。' }]
          const shown = (value.lines || []).length
          const head = `《${value.title}》 对话事件共 ${value.total} 条，本次显示 ${shown} 条`
          const tail = (value.total > shown && shown > 0)
            ? [`（还有更多，用 offset=${shown} 继续）`]
            : []
          return [{ type: 'text', text: [head, ...(value.lines || []), ...tail].join('\n') }]
        },
      },
      async execute(args) {
        const key = String((args && args.session) || '').trim()
        if (!key) throw new Error('session 不能为空')
        const limit = Math.min(Math.max(Number((args && args.limit)) || 40, 1), 300)
        const offset = Math.max(Number((args && args.offset)) || 0, 0)
        let meta = store.findSession(key)
        if (!meta) {
          // 退化为标题匹配
          const all = store.sessions({ limit: 300 }).items
          meta = all.find((s) => (s.title || '').includes(key))
        }
        if (!meta) return null
        if (meta.ambiguous) return { title: '匹配到多个会话，请给更长的 id 前缀', total: 0, lines: meta.ambiguous, lines_only: true }
        const d = store.sessionDialog(meta.id, limit, offset)
        if (!d) return null
        const lines = []
        const NOISE = ['<system-reminder>', 'Current runtime context', 'Updated instructions from:']
        for (const e of d.events) {
          const txt = String(e.text || '')
          if (NOISE.some((k) => txt.startsWith(k))) continue   // 系统注入，跳过
          const who = e.role === 'user' ? '用户' : e.role === 'assistant' ? 'AI' : (e.tool_name || '工具')
          lines.push(`【${who}】${e.type}${e.exit_code != null ? ' exit=' + e.exit_code : ''}`)
          if (e.reasoning) lines.push(`  ⟨思考⟩ ${String(e.reasoning).replace(/\s+/g, ' ').slice(0, 400)}`)
          if (e.args_json) lines.push(`  ⟨命令⟩ ${String(e.args_json).replace(/\s+/g, ' ').slice(0, 300)}`)
          if (e.text) lines.push(`  ${String(e.text).replace(/\s+/g, ' ').slice(0, 600)}`)
        }
        return { title: (d.meta && d.meta.title) || meta.title || '', total: (d.meta && d.meta.events) || 0, lines }
      },
    })

    log('已注册工具 wenyuan_search / wenyuan_read')
    return () => { try { offSearch?.() } catch {} try { offRead?.() } catch {} }
  })

  /* ── 3. 自动采集 ── */
  if (cfg.autoIngest) {
    let timer = null, running = false, pending = false
    const run = () => {
      if (running) { pending = true; return }
      running = true
      execFile(cfg.wyPath, ['ingest'], { timeout: cfg.ingestTimeoutMs }, (err) => {
        running = false
        if (err) log(`采集失败: ${fmtErr(err)}`)
        if (pending) { pending = false; schedule() }
      }).unref?.()
    }
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; run() }, cfg.debounceMs)
      if (timer.unref) timer.unref()
    }
    ctx.effect(() => {
      const off = ctx.on('session/event', (_session, event) => {
        if (event && event.type === 'turn/end') schedule()
      })
      return () => { off?.(); if (timer) clearTimeout(timer) }
    })
    run() // 启动补漏
  }

  log(`已就绪 · 库 ${root}`)
}
