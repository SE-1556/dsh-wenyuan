/**
 * 文渊 · Client 半
 *
 * 两个挂载点：
 *   sidebar.panellist  → 侧边栏「文渊」图标（id 自动对应主面板 key）
 *   main               → 中央面板（阁/检/鉴 三视图）
 *
 * 数据来自同源 /api/wenyuan/*（Host 半提供）
 * 样式全部走 --dsw-alias-* 主题令牌，跟随明暗切换
 */
window.__ModuleLoader__.load({
  id: 'dsh-wenyuan',
  factory(require) {
    const React = require('react')
    const { useState, useEffect, useRef, useCallback, useMemo } = React
    const h = React.createElement

    const CSS = `
.wy{height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.wy-head{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.wy-title{font-size:16px;font-weight:600;letter-spacing:.12em;color:var(--dsw-alias-brand-primary);display:flex;align-items:center;gap:8px}
.wy-title:before{content:"";width:3px;height:15px;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.wy-state{font-size:11px;color:var(--dsw-alias-label-secondary)}
.wy-tabs{display:flex;gap:2px;margin-left:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:3px}
.wy-tabs button{background:none;border:0;color:var(--dsw-alias-label-secondary);font-size:13px;padding:5px 13px;border-radius:6px;cursor:pointer;font-family:inherit}
.wy-tabs button.on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);font-weight:600}
.wy-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 24px}
.wy-search{display:flex;gap:8px;margin-bottom:12px}
.wy-search input{flex:1;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:9px;padding:9px 12px;font-size:14px;font-family:inherit;outline:none}
.wy-search input:focus{border-color:var(--dsw-alias-brand-primary)}
.wy-search button{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-brand-primary);border-radius:9px;padding:0 16px;font-size:14px;cursor:pointer;font-family:inherit}
.wy-row{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer;transition:border-color .15s}
.wy-row:hover{border-color:var(--dsw-alias-border-l2)}
.wy-row .t{font-size:14px;font-weight:500;margin-bottom:5px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.wy-row .m{display:flex;gap:10px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}
.wy-badge{display:inline-block;padding:1px 7px;border-radius:20px;font-size:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.wy-back{background:none;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;margin-bottom:10px;font-family:inherit}
.wy-back:hover{border-color:var(--dsw-alias-border-l2)}
.wy-dtitle{font-size:15px;font-weight:600;margin-bottom:6px;word-break:break-word}
.wy-dmeta{font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.wy-ev{border-left:2px solid var(--dsw-alias-border-l1);padding:8px 0 8px 12px;margin-left:3px;position:relative}
.wy-ev:before{content:"";position:absolute;left:-5px;top:15px;width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-border-l2)}
.wy-ev.user:before{background:var(--dsw-alias-brand-primary)}
.wy-ev.asst:before{background:var(--dsw-alias-state-success-primary)}
.wy-ev.tool:before{background:var(--dsw-alias-label-secondary)}
.wy-ev .hh{display:flex;gap:8px;align-items:center;margin-bottom:4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.wy-ev .txt{white-space:pre-wrap;word-break:break-word;font-size:13.5px;line-height:1.7}
.wy-rsn{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;margin-top:5px;font-size:12.5px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word;line-height:1.6;max-height:200px;overflow:hidden;cursor:pointer}
.wy-rsn.open{max-height:none}
.wy-rsn .lb{font-size:10px;letter-spacing:.1em;color:var(--dsw-alias-brand-primary);margin-bottom:4px;display:flex;justify-content:space-between}
.wy-cmd{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 10px;margin-top:5px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-all;max-height:130px;overflow:hidden;cursor:pointer}
.wy-cmd.open{max-height:none}
.wy-imgs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.wy-imgs img{width:70px;height:70px;object-fit:cover;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);cursor:zoom-in}
.wy-hit{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:pointer}
.wy-hit:hover{border-color:var(--dsw-alias-border-l2)}
.wy-hit .st{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:5px;display:flex;gap:8px;align-items:center}
.wy-hit .sn{font-size:13px;line-height:1.6;word-break:break-word;color:var(--dsw-alias-label-primary)}
.wy-hit .sn.rsn{color:var(--dsw-alias-label-secondary);font-size:12px;margin-top:4px}
.wy-hit .hl{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base);border-radius:2px;padding:0 2px}
.wy-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:16px}
.wy-kpi{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px}
.wy-kpi .k{font-size:10.5px;color:var(--dsw-alias-label-secondary);letter-spacing:.06em;margin-bottom:3px}
.wy-kpi .v{font-size:19px;font-weight:600;color:var(--dsw-alias-brand-primary);font-family:ui-monospace,Menlo,monospace}
.wy-sec{font-size:11px;color:var(--dsw-alias-label-secondary);letter-spacing:.1em;margin:16px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.wy-bars{display:flex;align-items:flex-end;gap:2px;height:80px;padding:6px 0}
.wy-bars .b{flex:1;background:var(--dsw-alias-brand-primary);border-radius:2px 2px 0 0;min-height:2px;opacity:.7}
.wy-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--dsw-alias-label-secondary);margin-top:2px}
.wy-tl .r{display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.wy-tl .r b{color:var(--dsw-alias-label-primary);font-weight:500;font-family:ui-monospace,Menlo,monospace}
.wy-empty{text-align:center;color:var(--dsw-alias-label-secondary);padding:48px 20px;font-size:13px}
.wy-load{text-align:center;color:var(--dsw-alias-label-secondary);padding:30px;font-size:12.5px}
`

    /* ── 工具 ── */
    const esc = (s) => String(s == null ? '' : s)
    const pad = (n) => String(n).padStart(2, '0')
    const fmtTime = (ts) => {
      if (!ts) return '—'
      const d = new Date(ts)
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    const fmtSize = (b) => b > 1073741824 ? (b / 1073741824).toFixed(1) + ' GB'
      : b > 1048576 ? (b / 1048576).toFixed(1) + ' MiB' : (b / 1024).toFixed(0) + ' KiB'

    async function api(p) {
      const r = await fetch('/wenyuan-api' + p)
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.json()
    }

    /* ── 侧边栏图标 ── */
    function Icon({ size = 18, active }) {
      // 书卷 + 印：竖线 + 圆弧，纯路径，跟随主题色
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true,
        style: { display: 'block', opacity: active ? 1 : 0.72 },
      },
        h('path', {
          d: 'M5 4.5h9.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5z',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round',
        }),
        h('path', { d: 'M8 8.5h5M8 12h5M8 15.5h3',
          stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })
      )
    }

    /* ── 阁：会话列表 / 详情 ── */
    function Ge({ initial }) {
      const [rows, setRows] = useState(null)
      const [q, setQ] = useState('')
      const [detail, setDetail] = useState(null)
      const [err, setErr] = useState('')

      const load = useCallback(async () => {
        try { setRows((await api('/sessions?limit=300')).items) }
        catch (e) { setErr(String(e.message || e)) }
      }, [])
      useEffect(() => { load() }, [load])
      useEffect(() => { if (initial) open(initial) }, [initial])

      // 列表自动刷新：8 秒一次，数据没变就不动（避免闪烁）
      useEffect(() => {
        if (detail) return
        const t = setInterval(async () => {
          try {
            const d = await api('/sessions?limit=300')
            setRows((prev) => {
              const sig = (arr) => (arr || []).map((x) => x.id + ':' + x.events).join('|')
              return sig(prev) === sig(d.items) ? prev : d.items
            })
          } catch {}
        }, 8000)
        return () => clearInterval(t)
      }, [detail])

      const open = async (sid) => {
        setDetail({ loading: true })
        try { setDetail(await api('/session?id=' + encodeURIComponent(sid) + '&limit=3000')) }
        catch (e) { setDetail({ error: String(e.message || e) }) }
      }

      if (detail) {
        if (detail.loading) return h('div', { className: 'wy-body' }, h('div', { className: 'wy-load' }, '加载会话…'))
        if (detail.error) return h('div', { className: 'wy-body' },
          h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } },
            h('button', { className: 'wy-back', style: { marginBottom: 0 }, onClick: () => setDetail(null) }, '← 返回'),
            h('button', { className: 'wy-back', style: { marginBottom: 0 }, onClick: () => open(m.id) }, '↻ 刷新')),
          h('div', { className: 'wy-empty' }, '加载失败：' + detail.error))
        const m = detail.meta || {}
        return h('div', { className: 'wy-body' },
          h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } },
            h('button', { className: 'wy-back', style: { marginBottom: 0 }, onClick: () => setDetail(null) }, '← 返回'),
            h('button', { className: 'wy-back', style: { marginBottom: 0 }, onClick: () => open(m.id) }, '↻ 刷新')),
          h('div', { className: 'wy-dtitle' }, esc(m.title || '(无标题)')),
          h('div', { className: 'wy-dmeta' },
            h('span', null, fmtTime(m.created_at)),
            h('span', null, m.depth ? '子 agent L' + m.depth : '主会话'),
            h('span', null, (m.events || 0) + ' 条事件')),
          (detail.images || []).length > 0 && h('div', { className: 'wy-imgs' },
            detail.images.map((im, i) => h('img', {
              key: i, src: '/wenyuan-api/attachment?sha=' + im.sha256,
              title: im.name || '', loading: 'lazy',
              onClick: () => window.open('/wenyuan-api/attachment?sha=' + im.sha256, '_blank'),
            }))),
          (detail.events || []).map((e, i) => {
            const kind = e.role === 'user' ? 'user' : e.role === 'assistant' ? 'asst' : 'tool'
            return h('div', { key: i, className: 'wy-ev ' + kind },
              h('div', { className: 'hh' },
                h('span', { className: 'wy-badge' }, kind === 'user' ? '你' : kind === 'asst' ? '我' : '工具'),
                h('span', null, e.type),
                e.tool_name ? h('span', { style: { fontFamily: 'monospace' } }, e.tool_name) : null,
                e.exit_code != null ? h('span', null, 'exit ' + e.exit_code) : null),
              e.reasoning ? h('div', {
                className: 'wy-rsn', onClick: (ev) => ev.currentTarget.classList.toggle('open'),
              },
                h('div', { className: 'lb' }, h('span', null, '思考'), h('span', null, e.reasoning.length + ' 字')),
                esc(e.reasoning)) : null,
              e.args_json ? h('div', {
                className: 'wy-cmd', onClick: (ev) => ev.currentTarget.classList.toggle('open'),
              }, esc(String(e.args_json).slice(0, 800))) : null,
              e.text ? h('div', { className: 'txt' }, esc(e.text.length > 6000 ? e.text.slice(0, 6000) + '\n…（已截断）' : e.text)) : null,
            )
          }))
      }

      const items = (rows || []).filter((s) => {
        if (!q) return true
        const k = q.toLowerCase()
        return (s.title || '').toLowerCase().includes(k) || s.id.toLowerCase().includes(k)
      })

      return h('div', { className: 'wy-body' },
        h('div', { className: 'wy-search' },
          h('input', {
            placeholder: '筛选会话标题…', value: q,
            onChange: (e) => setQ(e.target.value),
          }),
          h('button', { onClick: () => load() }, '↻')),
        err ? h('div', { className: 'wy-empty' }, '加载失败：' + err) : null,
        rows === null ? h('div', { className: 'wy-load' }, '加载中…') :
          items.length === 0 ? h('div', { className: 'wy-empty' }, '没有匹配的会话') :
            items.map((s) => h('div', { key: s.id, className: 'wy-row', onClick: () => open(s.id) },
              h('div', { className: 't' }, esc(s.title)),
              h('div', { className: 'm' },
                h('span', { className: 'wy-badge' }, s.depth ? '子 · L' + s.depth : '主会话'),
                h('span', null, fmtTime(s.created_at)),
                h('span', null, s.events + ' 条')))))
    }

    /* ── 检 ── */
    function Jian({ onJump }) {
      const [q, setQ] = useState('')
      const [res, setRes] = useState(null)
      const [busy, setBusy] = useState(false)
      const inputRef = useRef(null)

      const go = async (value) => {
        const term = (value ?? q).trim()
        if (!term) { setRes(null); return }
        setBusy(true)
        try { setRes(await api('/search?q=' + encodeURIComponent(term) + '&limit=50')) }
        catch (e) { setRes({ error: String(e.message || e) }) }
        setBusy(false)
      }
      useEffect(() => { if (inputRef.current) inputRef.current.focus() }, [])

      const mark = (s) => {
        // 后端用 [[ ]] 包住命中片段；先转义再替换
        const safe = String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return safe.replace(/\[\[/g, '<span class="hl">').replace(/\]\]/g, '</span>')
      }

      return h('div', { className: 'wy-body' },
        h('div', { className: 'wy-search' },
          h('input', {
            ref: inputRef, placeholder: '搜索全部会话（中文/英文/单字）…', value: q,
            onChange: (e) => setQ(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') go() },
          }),
          h('button', { onClick: () => go() }, busy ? '…' : '搜')),
        res && res.error ? h('div', { className: 'wy-empty' }, '检索失败：' + res.error) : null,
        busy ? h('div', { className: 'wy-load' }, '检索中…') : null,
        res && !res.error && !res.items.length ? h('div', { className: 'wy-empty' }, '没有命中') : null,
        res && res.items.length ? h('div', { className: 'wy-sec' }, res.items.length + ' 条命中') : null,
        (res && res.items || []).map((r, i) => h('div', { key: i, className: 'wy-hit', onClick: () => onJump(r.session_id) },
          h('div', { className: 'st' },
            h('span', { className: 'wy-badge' }, r.role || r.type),
            h('span', null, fmtTime(r.ts)),
            h('span', null, (r.session_title || '').slice(0, 20))),
          r.snip_text ? h('div', { className: 'sn', dangerouslySetInnerHTML: { __html: mark(r.snip_text) } }) : null,
          r.snip_rsn ? h('div', { className: 'sn rsn', dangerouslySetInnerHTML: { __html: mark(r.snip_rsn) } }) : null,
        )))
    }

    /* ── 鉴 ── */
    function Jing() {
      const [st, setSt] = useState(null)
      const [sg, setSg] = useState(null)
      const [err, setErr] = useState('')
      useEffect(() => {
        (async () => {
          try {
            const [a, b] = await Promise.all([api('/status'), api('/stats')])
            setSt(a); setSg(b)
          } catch (e) { setErr(String(e.message || e)) }
        })()
      }, [])
      if (err) return h('div', { className: 'wy-body' }, h('div', { className: 'wy-empty' }, '统计失败：' + err))
      if (!st || !sg) return h('div', { className: 'wy-body' }, h('div', { className: 'wy-load' }, '统计中…'))

      const days = Object.keys(sg.daily).sort()
      const last30 = days.slice(-30)
      const maxE = Math.max(1, ...last30.map((d) => sg.daily[d].events))
      const maxH = Math.max(1, ...sg.hourly)
      const totalSessions = sg.depths.reduce((a, b) => a + b.c, 0)

      return h('div', { className: 'wy-body' },
        h('div', { className: 'wy-kpis' },
          [['会话', totalSessions], ['事件', st.events], ['附件', st.attachments], ['库大小', fmtSize(st.bytes)]]
            .map(([k, v], i) => h('div', { key: i, className: 'wy-kpi' },
              h('div', { className: 'k' }, k), h('div', { className: 'v' }, v)))),

        h('div', { className: 'wy-sec' }, '时间跨度'),
        h('div', { className: 'wy-tl' },
          h('div', { className: 'r' }, h('span', null, '最早'), h('b', null, fmtTime(st.first_ts))),
          h('div', { className: 'r' }, h('span', null, '最新'), h('b', null, fmtTime(st.last_ts)))),

        h('div', { className: 'wy-sec' }, '每日事件量（近 30 天）'),
        h('div', { className: 'wy-bars' },
          last30.map((d, i) => h('div', {
            key: i, className: 'b', title: d + ' · ' + sg.daily[d].events + ' 条',
            style: { height: Math.max(2, sg.daily[d].events / maxE * 74) + 'px' },
          }))),
        h('div', { className: 'wy-axis' }, h('span', null, last30[0] || ''), h('span', null, last30[last30.length - 1] || '')),

        h('div', { className: 'wy-sec' }, '活跃时段（0–23 时）'),
        h('div', { className: 'wy-bars' },
          sg.hourly.map((v, i) => h('div', {
            key: i, className: 'b', title: i + ' 时 · ' + v + ' 条',
            style: { height: Math.max(2, v / maxH * 74) + 'px' },
          }))),
        h('div', { className: 'wy-axis' }, h('span', null, '0'), h('span', null, '6'), h('span', null, '12'), h('span', null, '18'), h('span', null, '23')),

        h('div', { className: 'wy-sec' }, '层级分布'),
        h('div', { className: 'wy-tl' },
          sg.depths.map((d, i) => h('div', { key: i, className: 'r' },
            h('span', null, d.depth ? '子 agent L' + d.depth : '主会话'),
            h('b', null, d.c)))),

        h('div', { className: 'wy-sec' }, '事件类型 Top 10'),
        h('div', { className: 'wy-tl' },
          sg.bytype.slice(0, 10).map((t, i) => h('div', { key: i, className: 'r' },
            h('span', { style: { fontFamily: 'monospace', fontSize: '11.5px' } }, t.type),
            h('b', null, t.c))))
      )
    }

    /* ── 主面板 ── */
    function Panel() {
      const [view, setView] = useState('ge')
      const [status, setStatus] = useState(null)
      const [jumpTo, setJumpTo] = useState(null)

      useEffect(() => {
        let alive = true
        const tick = async () => {
          try { const s = await api('/status'); if (alive) setStatus(s) } catch {}
        }
        tick()
        const t = setInterval(tick, 15000)
        return () => { alive = false; clearInterval(t) }
      }, [])

      const onJump = (sid) => { setJumpTo(sid); setView('ge') }

      return h('div', { className: 'wy' },
        h('style', null, CSS),
        h('div', { className: 'wy-head' },
          h('div', { className: 'wy-title' }, '文渊'),
          status ? h('div', { className: 'wy-state' }, `${status.sessions} 会话 · ${status.events} 事件`) : null,
          h('div', { className: 'wy-tabs' },
            [['ge', '阁'], ['jian', '检'], ['jing', '鉴']].map(([k, label]) =>
              h('button', {
                key: k, className: view === k ? 'on' : '',
                onClick: () => { setJumpTo(null); setView(k) },
              }, label)))),
        view === 'ge' ? h(Ge, { key: jumpTo || 'list', initial: jumpTo }) :
        view === 'jian' ? h(Jian, { onJump }) :
        h(Jing))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: 'wenyuan', order: 20, label: '文渊' },
          Icon))
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: 'wenyuan' },
          Panel))
      },
    }
  },
})
