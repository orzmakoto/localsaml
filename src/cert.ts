import forge from 'node-forge'
import { DEFAULT_IDP_ENTITY_ID, DUMMY_SSO_URL } from './config.js'

export interface KeyPair { key: string; cert: string }

/**
 * One self-signed key pair per config root, shared by every SP. This IdP is
 * only ever trusted by your own local SPs, so a single cert is enough — and it
 * means the second project you register needs no new SP-side certificate.
 */
export function generateKeyPair(): KeyPair {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10)

  const attrs = [
    { name: 'commonName', value: 'localsaml' },
    { name: 'organizationName', value: 'localsaml (local development only)' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    key: forge.pki.privateKeyToPem(keys.privateKey),
    cert: forge.pki.certificateToPem(cert),
  }
}

/** Strip PEM armour — SAML metadata carries the bare base64 body. */
export function certBody(pem: string): string {
  return pem
    .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
    .replace(/\s+/g, '')
}

export function buildMetadata(
  certPem: string,
  entityId = DEFAULT_IDP_ENTITY_ID,
  ssoUrl = DUMMY_SSO_URL,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  localsaml - IdP metadata for local development.

  The SingleSignOnService location below is a placeholder: localsaml is
  IdP-initiated only, so nothing listens there. Start a session with
  \`localsaml open\` instead of navigating to your app's login route.
-->
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${entityId}">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>${certBody(certPem)}</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress</NameIDFormat>
    <NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:unspecified</NameIDFormat>
    <SingleSignOnService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
        Location="${ssoUrl}"/>
  </IDPSSODescriptor>
</EntityDescriptor>
`
}
