# demo-sp

A minimal SAML service provider — about 150 lines — so you can see localsaml
work without wiring it into a real application.

```console
$ npm install
$ npm start                      # listens on :4000

# in another shell
$ localsaml add demo --acs http://localhost:4000/saml/acs \
    --entity-id http://localhost:4000/saml/metadata --preset okta
$ localsaml open demo yamada suzuki
```

Two browser windows open, signed in as two different people, showing exactly
which attributes arrived on the wire.

It verifies the assertion signature the way a real SP does, so it is also a
quick way to check whether a `sign:` or `NameFormat` change actually works.

The README animation demonstrates the shortest setup flow: `localsaml add demo
-i`, followed by `localsaml open demo` and a successful sign-in to this SP.
