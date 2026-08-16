/**
 * dsh-mcp-panel client bundle: registers the MCP tab in Settings → Plugins.
 * Loaded by the client module system as /plugins/dsh-mcp-panel/client.js;
 * hands its plugin factory to window.__ModuleLoader__ at script execution.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mcp-panel',
  factory: (require) => {
    const React = require('react')

    const CSS = `
.mcp-panel { display: flex; flex-direction: column; gap: 10px; }
.mcp-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.mcp-summary { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.mcp-refresh { flex: none; cursor: pointer; background: transparent; border: 1px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 4px 10px; font-size: 12px; }
.mcp-refresh:hover { background: var(--dsw-alias-bg-layer-2); }
.mcp-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; padding: 8px 12px; border: 1px solid var(--dsw-alias-state-error-primary); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.mcp-empty { color: var(--dsw-alias-label-secondary); font-size: 13px; padding: 16px 12px; text-align: center; }
.mcp-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
.mcp-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.mcp-title { display: flex; align-items: center; gap: 8px; }
.mcp-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-label-secondary); }
.mcp-dot-active { background: var(--dsw-alias-state-success-primary); }
.mcp-dot-loading, .mcp-dot-pending, .mcp-dot-unloading { background: var(--dsw-alias-state-warn-primary); }
.mcp-dot-failed { background: var(--dsw-alias-state-error-primary); }
.mcp-name { font-weight: 600; font-size: 14px; color: var(--dsw-alias-label-primary); }
.mcp-state { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.mcp-badge { font-size: 11px; color: var(--dsw-alias-label-secondary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; padding: 1px 6px; }
.mcp-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mcp-toggle { flex: none; cursor: pointer; background: transparent; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 5px 14px; font-size: 12px; }
.mcp-toggle:disabled { opacity: 0.5; cursor: default; }
.mcp-toggle-on { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-label-primary); }
`

    const STATE_TEXT = {
      active: '运行中',
      loading: '启动中',
      pending: '启动中',
      unloading: '停止中',
      failed: '加载失败',
      stopped: '已停止',
      unknown: '未知',
    }

    function apiList() {
      return fetch('/mcp-panel/list').then((res) => res.json())
    }

    function apiSet(id, enabled) {
      return fetch('/mcp-panel/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      }).then((res) => res.json())
    }

    function createMcpPanel(ctx) {
      function McpPanel() {
        const [rows, setRows] = React.useState(null)
        const [error, setError] = React.useState(null)
        const [busy, setBusy] = React.useState({})

        const applyResult = (result) => {
          if (result && result.ok) {
            setRows(result.mcp || [])
            setError(null)
          } else {
            setError((result && result.error) || '读取 MCP 状态失败')
          }
        }

        const load = () => {
          apiList().then(applyResult, (reason) => setError(String(reason?.message || reason)))
        }

        React.useEffect(() => {
          let alive = true
          const poll = () => {
            apiList().then(
              (result) => { if (alive) applyResult(result) },
              (reason) => { if (alive) setError(String(reason?.message || reason)) },
            )
          }
          poll()
          const stop = ctx.interval(poll, 3000)
          return () => { alive = false; stop() }
        }, [])

        const toggle = (row) => {
          if (busy[row.id]) return
          const next = {}
          for (const key of Object.keys(busy)) next[key] = busy[key]
          next[row.id] = true
          setBusy(next)
          apiSet(row.id, !row.enabled).then((result) => {
            const cleared = {}
            for (const key of Object.keys(next)) if (key !== row.id) cleared[key] = next[key]
            setBusy(cleared)
            if (!result || !result.ok) {
              setError((result && result.error) || '启用/停用失败')
              return
            }
            if (result.mcp) {
              setRows((prev) => (prev || []).map((item) => (item.id === row.id ? result.mcp : item)))
            }
          })
        }

        const bar = React.createElement('div', { className: 'mcp-bar' },
          React.createElement('span', { className: 'mcp-summary' }, 'MCP 服务器状态（每 3 秒自动刷新）'),
          React.createElement('button', { className: 'mcp-refresh', onClick: load }, '刷新'),
        )

        if (error) {
          return React.createElement('div', { className: 'mcp-panel' }, bar,
            React.createElement('div', { className: 'mcp-error' }, error))
        }
        if (rows === null) {
          return React.createElement('div', { className: 'mcp-panel' }, bar,
            React.createElement('div', { className: 'mcp-empty' }, '正在读取 MCP 状态…'))
        }
        if (!rows.length) {
          return React.createElement('div', { className: 'mcp-panel' }, bar,
            React.createElement('div', { className: 'mcp-empty' }, '未检测到已安装的 MCP 服务器（在 cordis 配置中加载 @deepseek-ai/dsh-mcp-client 行）'))
        }

        const cards = rows.map((row) => {
          const enabled = row.enabled === true
          const target = row.command || row.url || ''
          const detail = []
          if (target) detail.push(target)
          if (row.toolCount > 0) detail.push(row.toolCount + ' 个工具')
          return React.createElement('div', { className: 'mcp-card', key: row.id },
            React.createElement('div', { className: 'mcp-main' },
              React.createElement('div', { className: 'mcp-title' },
                React.createElement('span', { className: 'mcp-dot mcp-dot-' + row.state }),
                React.createElement('span', { className: 'mcp-name' }, row.serverName || row.id),
                React.createElement('span', { className: 'mcp-badge' }, row.transport === 'streamable-http' ? 'HTTP' : 'stdio'),
                React.createElement('span', { className: 'mcp-state' }, STATE_TEXT[row.state] || row.state),
              ),
              React.createElement('div', { className: 'mcp-meta' }, detail.join(' · ') || row.id),
            ),
            React.createElement('button', {
              className: 'mcp-toggle' + (enabled ? ' mcp-toggle-on' : ''),
              disabled: busy[row.id] === true,
              onClick: () => toggle(row),
            }, busy[row.id] ? '处理中…' : (enabled ? '停用' : '启用')),
          )
        })

        return React.createElement('div', { className: 'mcp-panel' }, bar, cards)
      }
      return McpPanel
    }

    return {
      inject: ['slots', 'timer'],
      apply(ctx) {
        const style = document.createElement('style')
        style.dataset.plugin = 'dsh-mcp-panel'
        style.textContent = CSS
        document.head.append(style)
        ctx.effect(() => () => style.remove(), 'mcp-panel: styles')

        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(
          { name: 'settings.plugins.tab', id: 'mcp', order: 20, label: 'MCP' },
          createMcpPanel(ctx),
        ))
      },
    }
  },
})
