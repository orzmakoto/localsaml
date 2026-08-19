/**
 * A minimal SAML service provider for trying localsaml out.
 *
 * It does what a real SP does with an assertion — verify the signature, pull
 * out the NameID and attributes, start a session — and nothing else.
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { SignedXml } from 'xml-crypto'
import { DOMParser } from '@xmldom/xmldom'
import * as xpath from 'xpath'

const PORT = Number(process.env.PORT ?? 4000)

function certPath() {
  if (process.env.LOCALSAML_CERT) return process.env.LOCALSAML_CERT
  const root = process.env.LOCALSAML_CONFIG_PATH
    ? resolve(process.env.LOCALSAML_CONFIG_PATH)
    : join(homedir(), '.config', 'localsaml')
  return join(root, 'config', 'idp-cert.pem')
}

const CERT = certPath()
if (!existsSync(CERT)) {
  console.error(`IdP certificate not found: ${CERT}\nRun 'localsaml add demo' first.`)
  process.exit(1)
}
const cert = readFileSync(CERT, 'utf8')

const select = xpath.useNamespaces({
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  saml: 'urn:oasis:names:tc:SAML:2.0:assertion',
})

/** Sessions live in memory: this is a demo, not a product. */
const sessions = new Map()

function consumeAssertion(body) {
  const params = new URLSearchParams(body)
  const xml = Buffer.from(params.get('SAMLResponse') ?? '', 'base64').toString('utf8')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')

  const sigNode = select('//ds:Signature', doc)[0]
  if (!sigNode) throw new Error('no signature on the assertion')
  const sig = new SignedXml({ publicCert: cert })
  sig.loadSignature(sigNode)
  if (!sig.checkSignature(xml)) {
    throw new Error(`signature check failed: ${sig.validationErrors.join('; ')}`)
  }

  const attributes = select('//saml:Attribute', doc).map((a) => ({
    name: a.getAttribute('Name'),
    friendlyName: a.getAttribute('FriendlyName') || undefined,
    format: (a.getAttribute('NameFormat') || '').split(':').pop(),
    values: select('saml:AttributeValue/text()', a).map((t) => t.nodeValue),
  }))

  return {
    nameId: select('string(//saml:NameID)', doc),
    attributes,
    relayState: params.get('RelayState') || '/',
  }
}

/** Attribute names differ per preset, so look a value up by any of its aliases. */
const pick = (attrs, ...needles) => {
  for (const n of needles) {
    const hit = attrs.find((a) => a.name === n || a.friendlyName === n || a.name?.endsWith(`/${n}`))
    if (hit) return hit.values.join(', ')
  }
  return ''
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function page(session) {
  if (!session) {
    return layout(`
      <div class="empty">
        <h1>Acme Console</h1>
        <p>Not signed in.</p>
        <pre>localsaml open demo yamada</pre>
      </div>`)
  }

  const a = session.attributes
  const name = pick(a, 'displayName') || session.nameId
  const dept = pick(a, 'department', 'ou')
  const groups = pick(a, 'groups', 'isMemberOf', 'memberOf')
  const tenant = pick(a, 'tenantId')
  const isAdmin = /admin/i.test(groups)

  const rows = a
    .map(
      (x) => `<tr>
        <td class="k">${esc(x.name)}${x.friendlyName ? `<span class="fn">${esc(x.friendlyName)}</span>` : ''}</td>
        <td class="f">${esc(x.format)}</td>
        <td class="v">${x.values.length ? x.values.map((v) => `<code>${esc(v)}</code>`).join(' ') : '<em>empty</em>'}</td>
      </tr>`,
    )
    .join('')

  return layout(`
    <header>
      <div class="brand">Acme Console</div>
      <div class="who">
        <span class="badge ${isAdmin ? 'admin' : 'member'}">${esc(groups || 'no role')}</span>
        <span class="name">${esc(name)}</span>
      </div>
    </header>
    <main>
      <section class="card">
        <div class="avatar ${isAdmin ? 'admin' : 'member'}">${esc(name.slice(0, 1))}</div>
        <div>
          <h1>${esc(name)}</h1>
          <p>${esc(session.nameId)}</p>
          <p class="meta">${esc(dept || '—')}${tenant ? ` · tenant ${esc(tenant)}` : ''}</p>
        </div>
      </section>

      ${
        isAdmin
          ? `<section class="panel admin"><h2>Admin</h2><p>Billing, members, and audit log are visible to you.</p></section>`
          : `<section class="panel"><h2>Workspace</h2><p>Admin settings are hidden for this role.</p></section>`
      }

      <section>
        <h2>Attributes received</h2>
        <table>
          <thead><tr><th>Name</th><th>NameFormat</th><th>Value</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
    </main>`)
}

function layout(inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Acme Console</title><style>
*{box-sizing:border-box}
body{margin:0;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;color:#1a1d23;background:#f4f5f7}
header{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;background:#fff;border-bottom:1px solid #e3e5e9}
.brand{font-weight:650;letter-spacing:-.01em}
.who{display:flex;align-items:center;gap:10px}
.name{font-weight:550}
.badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em}
.badge.admin{background:#fde8e8;color:#a01b1b}
.badge.member{background:#e6effb;color:#1e4f9c}
main{max-width:820px;margin:24px auto;padding:0 24px;display:flex;flex-direction:column;gap:20px}
.card{display:flex;gap:16px;align-items:center;background:#fff;border:1px solid #e3e5e9;border-radius:10px;padding:20px}
.card h1{margin:0;font-size:19px}
.card p{margin:2px 0 0;color:#61666e;font-size:13px}
.card .meta{color:#8a8f97}
.avatar{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:600;color:#fff;flex:none}
.avatar.admin{background:#c0392b}.avatar.member{background:#2d6cdf}
.panel{background:#fff;border:1px solid #e3e5e9;border-radius:10px;padding:16px 20px}
.panel.admin{border-color:#f0c4c4;background:#fffafa}
.panel h2{margin:0 0 4px;font-size:14px}
.panel p{margin:0;color:#61666e;font-size:13px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#8a8f97;margin:0 0 8px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e5e9;border-radius:10px;overflow:hidden}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8a8f97;padding:9px 14px;background:#fafbfc;border-bottom:1px solid #e3e5e9}
td{padding:9px 14px;border-bottom:1px solid #eef0f2;vertical-align:top}
tr:last-child td{border-bottom:0}
.k{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all;max-width:340px}
.fn{display:block;color:#8a8f97;font-size:10.5px}
.f{color:#8a8f97;font-size:11.5px;white-space:nowrap}
code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f0f2f5;padding:1px 5px;border-radius:4px}
em{color:#b0b4ba}
.empty{max-width:520px;margin:80px auto;text-align:center}
.empty pre{display:inline-block;background:#1a1d23;color:#e6e8eb;padding:10px 16px;border-radius:8px;font-size:13px}
</style></head><body>${inner}</body></html>`
}

createServer((req, res) => {
  const cookies = Object.fromEntries(
    (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]),
  )

  if (req.method === 'POST' && req.url === '/saml/acs') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const session = consumeAssertion(body)
        const sid = randomUUID()
        sessions.set(sid, session)
        console.log(`signed in: ${session.nameId} (${session.attributes.length} attributes)`)
        res.writeHead(303, {
          'Set-Cookie': `demo_session=${sid}; Path=/; HttpOnly; SameSite=Lax`,
          Location: session.relayState,
        })
        res.end()
      } catch (err) {
        console.error(`rejected: ${err.message}`)
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`assertion rejected: ${err.message}`)
      }
    })
    return
  }

  if (req.url === '/logout') {
    sessions.delete(cookies.demo_session)
    res.writeHead(303, { 'Set-Cookie': 'demo_session=; Path=/; Max-Age=0', Location: '/' })
    res.end()
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(page(sessions.get(cookies.demo_session)))
}).listen(PORT, () => {
  console.log(`demo-sp listening on http://localhost:${PORT}`)
  console.log(`trusting IdP certificate: ${CERT}`)
})
