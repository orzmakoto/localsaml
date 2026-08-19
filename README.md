# localsaml

A throwaway SAML IdP for local development. Define an SP and its users in one
YAML, then open a browser that is **already logged in** — one command, no daemon,
no login screen.

[日本語](./README.ja.md)

```console
$ localsaml open myapp admin member
✔ myapp × admin   default browser
✔ myapp × member  default browser
```

Both sign-ins open in the default browser. Add `--isolated` to keep their
sessions separate at the same time.

![localsaml add -i followed by a signed-in default browser](./docs/demo.gif)

## Why

If you sell SAML SSO to enterprise customers, it is probably gated behind your
top plan — which means nobody uses it in local development. Everyone falls back
to password login, and the SAML path is first exercised in staging.

That path is where tenant assignment, role mapping, and JIT provisioning live.
It is the most fragile code you have, and the least exercised.

localsaml makes signing in through SAML the *easy* option locally, so that code
runs every day instead of once per release.

## What it is, and is not

**Is:** a signed assertion generator plus a browser launcher, for local
development.

**Is not:** an identity provider. It never asks for a password, it does not
implement SP-initiated SSO, and it must never be reachable from anything but
your own machine.

Deliberately out of scope, so that it stays small:

- **OIDC** — that is a different tool. This one does SAML.
- **Connecting to a real IdP** — also a different tool.
- **SCIM** — maybe one day; not in v1.

## Install

```console
npm install -g localsaml     # or: npx localsaml <command>
```

## Quick start

```console
$ localsaml add myapp
✔ Generated a key pair (once only — shared by every SP)
✔ Registered myapp

ℹ Configure your SP with these IdP values:

idp.entityId
urn:localsaml:idp

idp.ssoUrl
http://sso-not-used.localsaml.invalid/run-localsaml-open-instead

idp.metadataFile
~/.config/localsaml/config/idp-metadata.xml

certificate (PEM)
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
```

Configure your SP with those IdP values, then replace `CHANGE_ME_SP_ENTITY_ID`
and `CHANGE_ME_ACS_URL` in `myapp.yaml`:

```console
$ localsaml edit myapp
$ localsaml show myapp       # print the IdP values again
```

Once configured:

```console
$ cd ~/repos/myapp
$ localsaml open myapp
```

To answer prompts instead, run `localsaml add myapp --interactive`.

## Trying it out

This repository ships **`examples/demo-sp`**, a working SP in about 150 lines
of Node, so you can see a session appear before wiring localsaml into your own
application.

## How it works

`localsaml open` builds a signed SAML Response for the persona you asked for,
serves a one-shot auto-submitting form on `127.0.0.1`, and opens it in the OS
default browser. The form POSTs to your ACS URL, your SP creates a session,
and the CLI exits. If the browser never fetches the form, localsaml gives up
after five seconds.

Three consequences worth knowing:

- **The POST happens inside the browser**, so the session cookie lands in that
  browser's profile. No cookie injection, no Playwright, no headless step.
- **The form is served over HTTP from a real origin**, not `file://`. Some SPs
  reject a form posted with `Origin: null`, and this also keeps the POST
  cross-site to your app, exactly as it is in production.
- Add `--isolated` to use a dedicated Chromium profile per SP × user when you
  need separate simultaneous sessions.

## Users

Users live alongside the SP settings in each SP's YAML. One file shows the
connection and every user who can log in to it. Attributes are described by
*meaning*; the preset decides their wire names and `NameFormat`.

```yaml
# ~/.config/localsaml/myapp.yaml
users:
  yamada:
    email: yamada@example.com
    familyName: 山田
    givenName: 太郎
    displayName: 山田 太郎
    department: 開発部
    employeeId: "10024"

  suzuki:
    extends: yamada          # inherit, then override
    email: suzuki@example.com
    familyName: 鈴木
    givenName: 花子
```

Keys: `email`, `familyName`, `givenName`, `displayName`, `department`,
`employeeId`, `groups`, plus `nameId`, `nameIdFormat`, and `to`.

### Personas for the broken cases

Attribute bugs show up when a value is missing, empty, or repeated — not when
it is present and well-formed. Those cases deserve to be first-class:

```yaml
  no-department:
    extends: yamada
    department: null          # attribute omitted entirely
  empty-department:
    extends: yamada
    department: ""            # present, but empty
  multi-department:
    extends: yamada
    department: [開発部, 基盤チーム]
```

`null` and `""` are different on the wire, and your SP probably treats them
differently too.

### Anything else

Whatever a preset does not cover goes through `raw`, untouched:

```yaml
  yamada:
    raw:
      - name: lastNameKana
        value: ヤマダ
      - name: costCenter
        value: "CC-4410"
        nameFormat: basic
```

## Service providers

```yaml
# ~/.config/localsaml/myapp.yaml
preset: okta

idp:                           # IdP identity and local signing files
  entityId: urn:localsaml:idp
  metadataFile: /Users/you/.config/localsaml/config/idp-metadata.xml
  privateKeyFile: /Users/you/.config/localsaml/config/idp-key.pem
  certificateFile: /Users/you/.config/localsaml/config/idp-cert.pem
  ssoUrl: http://sso-not-used.localsaml.invalid/run-localsaml-open-instead

sp:
  entityId: http://localhost:3000/saml/metadata
  acsUrl:   http://localhost:3000/saml/acs

defaultUser: yamada

attributes:                   # layered onto every user for this SP
  raw:
    - { name: tenantId, value: t-001 }

users:                        # every user who can log in to this SP
  yamada:
    email: yamada@example.com
    familyName: 山田
    givenName: 太郎
    displayName: 山田 太郎
    department: 開発部
    groups: [admin]
  suzuki:
    extends: yamada
    email: suzuki@example.com
    familyName: 鈴木
    givenName: 花子
    displayName: 鈴木 花子
    groups: [member]
    to: /dashboard            # RelayState
```

Configure your SP with `idp.entityId`, `idp.ssoUrl`, and the certificate (or
import `idp.metadataFile`). `idp.privateKeyFile` is used locally by localsaml
for signing and must not be given to the SP.

Attributes compose in two layers; the individual user wins on conflicts:

```
attributes  →  users[name]
```

Use `attributes` for values such as a tenant id that every user of the SP
should receive.

## Presets

The same user, rendered for four different IdPs:

| Preset | `department` becomes | NameFormat |
|---|---|---|
| `generic` | `department` | basic |
| `okta` | `department` | unspecified |
| `entra` | `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department` | uri |
| `shibboleth` | `urn:oid:2.5.4.11` (FriendlyName `ou`) | uri |

On first startup the built-in presets are written to
`~/.config/localsaml/config/presets.yaml`. That YAML is loaded from then on and is
never overwritten, so you can change attribute mappings or add custom presets.

The default is `entra` when `preset` is omitted. Entra ID is also selected in
the generated `sample.yaml`, non-interactive `add`, and the interactive prompt.

Attribute names are only half of it — SPs match on `NameFormat` too, and a
mismatch is silently ignored rather than reported. Presets set both.

Because presets are per-SP, switching one answers a question a real IdP cannot:
**does our app still work if a customer moves from Okta to Entra ID?**

```console
$ localsaml open myapp yamada --print | grep AttributeStatement -A20
```

## Where configuration lives

By default everything is in `~/.config/localsaml`. Set
`LOCALSAML_CONFIG_PATH` to use another directory.

SP and user settings live in an SP-named YAML at the root. IdP internals, keys,
certificates, and metadata are grouped under `config/`:

```text
~/.config/localsaml/
├── sample.yaml
└── config/
    ├── config.yaml
    ├── presets.yaml
    ├── idp-key.pem
    ├── idp-cert.pem
    └── idp-metadata.xml
```

On first run, `localsaml init` also creates `sample.yaml`. Its required
`sp.entityId` and `sp.acsUrl` values start with `CHANGE_ME_...`; replace them
with values from your application. An existing `sample.yaml` is never overwritten.

```console
$ LOCALSAML_CONFIG_PATH=~/repos/localsaml-config localsaml init
```

When `LOCALSAML_CONFIG_PATH` is unset, localsaml uses `~/.config/localsaml`.

Browser profiles created by `--isolated` always live in
`~/.config/localsaml/profiles/`.

### Sharing with a team

localsaml is a personal tool. If a team wants to share definitions, make the
config root a repository — the same way you would with dotfiles:

```console
$ export LOCALSAML_CONFIG_PATH=~/repos/localsaml-config
$ localsaml init
$ cd ~/repos/localsaml-config && git init
```

Commit the private key along with everything else. Matching certificates are
what let you share SP-side settings too, and this IdP is only ever trusted by
your own local SPs, so there is nothing to leak.

## Commands

| | |
|---|---|
| `localsaml add <name>` | register an SP (generates the key pair on first run) |
| `localsaml open [sp] [user...]` | start sign-in for one or more users |
| `localsaml list` | list profile names and SP entity IDs |
| `localsaml show <profile>` | show profile name/path, IdP settings, and certificate |
| `localsaml edit <profile>` | open an SP profile in `$VISUAL` or `$EDITOR` |
| `localsaml remove <profile>` | remove an SP profile YAML (alias: `rm`) |
| `localsaml init` | initialise the config directory and IdP files |

Useful flags: `--to <path>` (RelayState), `--print` (dump the signed Response
instead of opening a browser), `--isolated` (dedicated Chromium profile), and
`--browser <path>` (implies `--isolated`).

`add` is non-interactive by default. Use `add --interactive` (`-i`) to answer
prompts for the missing SP settings.

`list` is intentionally compact:

```text
PROFILE    SP ENTITY ID
─────────  ────────────
localtest  http://localhost:4000/saml/metadata
sample     CHANGE_ME_SP_ENTITY_ID
```

Use `show <profile>` for details and `edit <profile>` to make changes. When
only one profile exists, its name may be omitted from `open`; with multiple
profiles, use `open <profile> [user...]` explicitly.

## Limitations

Honest ones, all downstream of staying small:

- **IdP-initiated only.** Nothing listens at the SSO URL in the generated
  metadata; it is a placeholder that names itself as one. If your session
  expires, run `localsaml open` again rather than following the redirect.
  A daemon that speaks SP-initiated SSO is the obvious future direction.
- **Isolated mode requires a Chromium-family browser** (Chrome, Edge, Brave,
  Chromium). Normal mode uses the OS default browser.
- **Your SP must be reconfigurable** to point at this IdP — usually an
  environment variable away, occasionally not.
- **SAML only.** See "What it is, and is not".

## Troubleshooting

**The SP rejects the signature.** Most SPs want the *assertion* signed, which
is the default. If yours wants the message signed as well, use `sign: both` —
`sign: response` on its own fails any SP that requires a signed assertion,
which most SPs do by default.

**Attributes arrive empty.** Almost always a `NameFormat` mismatch. Compare
`localsaml open <sp> <user> --print` against what your SP expects.

**Certificate warnings on an https SP.** Normally, accept it in your default
browser. In isolated mode, set both `browser.isolated: true` and
`browser.ignoreCertErrors: true` in the SP config.

## License

MIT
