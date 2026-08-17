/**
 * dsh-mcp-panel host plugin: enumerates the deployment's
 * `@deepseek-ai/dsh-mcp-client` rows through the loader service and exposes
 * two HTTP endpoints for the Web settings tab:
 *   GET  /mcp-panel/list  — one row per installed MCP server (state, tool count)
 *   POST /mcp-panel/set   — { id, enabled } enables or disables one row
 *
 * Enable/disable rides the loader tree: disabling disposes the row's fiber
 * (the MCP child process disconnects and its tools unregister); enabling
 * re-imports and restarts it.
 */

export const name = 'mcp-panel'
export const inject = ['webServer', 'loader', 'tools']

const MCP_CLIENT_NAME = '@deepseek-ai/dsh-mcp-client'

/** Runtime mirror: FiberState is a cordis const enum with no runtime object to import. */
const FIBER_STATE = {
  PENDING: 0,
  LOADING: 1,
  ACTIVE: 2,
  FAILED: 3,
  DISPOSED: 4,
  UNLOADING: 5,
}

/**
 * Complete projection of cordis Fiber states onto the panel's labels.
 *
 * DISPOSED maps to null because `Entry._dispose` clears `entry.fiber` before
 * awaiting `fiber.dispose()`: a row observed through the loader never carries a
 * fiber that reached DISPOSED. A null phase therefore takes the fiberless
 * branch, which reports enablement instead of inventing a fourth outcome.
 */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
}

function text(value) {
  return typeof value === 'string' ? value : ''
}

/**
 * Label one row's lifecycle for the panel.
 *
 * A row without a live phase reports enablement rather than a fiber phase: that
 * covers a not-yet-started entry, a failed import (which leaves the entry
 * fiberless), and a disposed one. An unmirrored state number degrades to
 * 'unknown' instead of rendering a label the client cannot style.
 * @param fiber - the entry's root fiber, absent until the plugin import starts.
 * @param disabled - the entry's effective enablement, ancestors included.
 * @returns one of the states client.js can render.
 */
function resolveState(fiber, disabled) {
  const phase = fiber ? FIBER_PHASE[fiber.state] : null
  if (phase) return phase
  if (fiber && phase === undefined) return 'unknown'
  return disabled ? 'stopped' : 'loading'
}

/** Build the plain-JSON view of one MCP loader row. */
function describeEntry(entry, tools) {
  const options = entry.options || {}
  const config = options.config || {}
  const serverName = text(config.serverName)
  let disabled = false
  try {
    disabled = entry.disabled === true
  } catch {
    // a !!js disabled expression that fails to evaluate counts as enabled
  }
  const state = resolveState(entry.fiber, disabled)
  let toolCount = 0
  if (serverName && tools) {
    try {
      const prefix = 'mcp__' + serverName + '__'
      for (const schema of tools.schemas()) {
        if (typeof schema.name === 'string' && schema.name.startsWith(prefix)) toolCount += 1
      }
    } catch {
      // tool counting is best-effort; state itself remains readable
    }
  }
  return {
    id: text(entry.id) || text(options.id),
    serverName,
    transport: text(config.transport) || 'stdio',
    command: text(config.command),
    url: text(config.url),
    args: Array.isArray(config.args) ? config.args.filter((v) => typeof v === 'string') : [],
    enabled: !disabled,
    state,
    toolCount,
  }
}

function listMcp(loader, tools) {
  const rows = []
  for (const entry of loader.entries()) {
    const options = entry && entry.options
    if (!options || options.name !== MCP_CLIENT_NAME) continue
    rows.push(describeEntry(entry, tools))
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return rows
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mcp-panel/list',
    handler: async (_req, res) => {
      try {
        sendJson(res, 200, { ok: true, mcp: listMcp(ctx.loader, ctx.tools) })
      } catch (error) {
        sendJson(res, 200, { ok: false, error: String(error?.message || error) })
      }
    },
  }), 'mcp-panel: list route')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/mcp-panel/set',
    handler: async (req, res) => {
      const body = await readJsonBody(req)
      const id = typeof body.id === 'string' ? body.id : ''
      const enabled = body.enabled === true
      if (!id) {
        sendJson(res, 200, { ok: false, error: '缺少 MCP 行 id' })
        return
      }
      try {
        await ctx.loader.update(id, { disabled: !enabled })
      } catch (error) {
        sendJson(res, 200, { ok: false, error: String(error?.message || error) })
        return
      }
      try {
        const updated = listMcp(ctx.loader, ctx.tools).find((row) => row.id === id)
        sendJson(res, 200, { ok: true, mcp: updated || null })
      } catch (error) {
        sendJson(res, 200, { ok: true, mcp: null, warning: String(error?.message || error) })
      }
    },
  }), 'mcp-panel: set route')
}
