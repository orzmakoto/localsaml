import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FormPage {
  acsUrl: string
  samlResponse: string
  relayState?: string
  label: string
}

/**
 * Serves exactly one auto-submitting form, then shuts down.
 *
 * The POST has to originate inside the browser so the session cookie lands in
 * that browser's profile. A `file://` page would work too, but it posts with
 * `Origin: null`, which some SPs reject — fifteen lines of http server buys a
 * real origin, and one that is cross-site to the app just like production.
 */
export function serveOnce(page: FormPage): Promise<{ url: string; done: Promise<void> }> {
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>localsaml - ${escapeHtml(page.label)}</title></head>
<body style="font:14px system-ui;padding:2rem;color:#444">
<p>Signing in as <strong>${escapeHtml(page.label)}</strong>&hellip;</p>
<form id="f" method="POST" action="${escapeHtml(page.acsUrl)}">
  <input type="hidden" name="SAMLResponse" value="${escapeHtml(page.samlResponse)}">
  ${page.relayState ? `<input type="hidden" name="RelayState" value="${escapeHtml(page.relayState)}">` : ''}
  <noscript><button type="submit">Continue</button></noscript>
</form>
<script>document.getElementById('f').submit()</script>
</body>
</html>`

  return new Promise((resolve) => {
    let settle: () => void
    const done = new Promise<void>((r) => (settle = r))
    let finished = false
    let timer: NodeJS.Timeout

    const server = createServer((req, res) => {
      if (req.url === '/favicon.ico') {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(html, () => {
        // Give the browser a moment to finish reading before the socket dies.
        setTimeout(finish, 500)
      })
    })

    const finish = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      server.close()
      // Browsers may keep the one-shot connection alive. `server.close()`
      // stops new requests but does not guarantee those sockets disappear.
      server.closeAllConnections()
      settle()
    }

    // If the browser never arrives, don't hang the CLI forever.
    timer = setTimeout(finish, 5_000)
    timer.unref()

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({ url: `http://127.0.0.1:${port}/`, done })
    })
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
