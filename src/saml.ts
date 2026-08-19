import { randomUUID } from 'node:crypto'
import { SignedXml } from 'xml-crypto'
import type { WireAttr } from './config.js'

const SIG_ALG = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
const DIGEST_ALG = 'http://www.w3.org/2001/04/xmlenc#sha256'
const C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#'
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'

export interface ResponseInput {
  idpEntityId: string
  spEntityId: string
  acsUrl: string
  nameId: string
  nameIdFormat: string
  attributes: WireAttr[]
  sign: 'assertion' | 'response' | 'both'
  key: string
  cert: string
  /** Assertion lifetime; generous by default so clock skew never bites. */
  validMinutes?: number
}

const id = () => `_${randomUUID().replace(/-/g, '')}`
const instant = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function attributeXml(a: WireAttr): string {
  const friendly = a.friendlyName ? ` FriendlyName="${esc(a.friendlyName)}"` : ''
  const values = a.values
    .map(
      (v) =>
        `        <saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema"` +
        ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
        ` xsi:type="xs:string">${esc(v)}</saml:AttributeValue>`,
    )
    .join('\n')
  return (
    `      <saml:Attribute Name="${esc(a.name)}" NameFormat="${a.nameFormat}"${friendly}>\n` +
    `${values}\n` +
    `      </saml:Attribute>`
  )
}

/** Build an unsigned IdP-initiated Response, then sign it in place. */
export function buildSignedResponse(input: ResponseInput): string {
  const now = new Date()
  const notBefore = new Date(now.getTime() - 5 * 60_000)
  const notOnOrAfter = new Date(now.getTime() + (input.validMinutes ?? 60) * 60_000)

  const responseId = id()
  const assertionId = id()
  const sessionIndex = id()

  const attrStatement = input.attributes.length
    ? `    <saml:AttributeStatement>\n${input.attributes.map(attributeXml).join('\n')}\n    </saml:AttributeStatement>\n`
    : ''

  const xml =
`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${responseId}" Version="2.0" IssueInstant="${instant(now)}" Destination="${esc(input.acsUrl)}">
  <saml:Issuer>${esc(input.idpEntityId)}</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion ID="${assertionId}" Version="2.0" IssueInstant="${instant(now)}">
    <saml:Issuer>${esc(input.idpEntityId)}</saml:Issuer>
    <saml:Subject>
      <saml:NameID Format="${esc(input.nameIdFormat)}">${esc(input.nameId)}</saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData NotOnOrAfter="${instant(notOnOrAfter)}" Recipient="${esc(input.acsUrl)}"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="${instant(notBefore)}" NotOnOrAfter="${instant(notOnOrAfter)}">
      <saml:AudienceRestriction>
        <saml:Audience>${esc(input.spEntityId)}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="${instant(now)}" SessionIndex="${sessionIndex}">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
${attrStatement}  </saml:Assertion>
</samlp:Response>`

  let signed = xml
  // Assertion first: a Response signature has to cover the signed assertion.
  if (input.sign === 'assertion' || input.sign === 'both') {
    signed = signElement(signed, 'Assertion', input.key, input.cert)
  }
  if (input.sign === 'response' || input.sign === 'both') {
    signed = signElement(signed, 'Response', input.key, input.cert)
  }
  return signed
}

/** Enveloped XML-DSig, placed right after the element's own <Issuer>. */
function signElement(xml: string, local: string, key: string, cert: string): string {
  const target = `//*[local-name(.)='${local}']`
  const sig = new SignedXml({
    privateKey: key,
    publicCert: cert,
    signatureAlgorithm: SIG_ALG,
    canonicalizationAlgorithm: C14N,
  })
  sig.addReference({
    xpath: target,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: DIGEST_ALG,
  })
  sig.computeSignature(xml, {
    location: { reference: `${target}/*[local-name(.)='Issuer']`, action: 'after' },
  })
  return sig.getSignedXml()
}

export const encodeResponse = (xml: string) => Buffer.from(xml, 'utf8').toString('base64')
