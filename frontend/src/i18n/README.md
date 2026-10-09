# Interface languages

The selector publishes English and only languages with a complete bundled catalog.
Currently Hindi, Kannada, Tamil and Telugu each cover the all source entries.
The broader language registry is not the published support list.

`localize-plugin.cjs` wraps local HTML JSX with a React-owned `LocalizedElement`.
The component translates rendered text and accessible labels without changing
input values, event handlers, IDs, URLs, stock calculations or approval payloads.
Three.js scene nodes are excluded. Chart-library labels use `useTranslations`.
The selected language persists locally and is passed to the other demo port in
links. Pip uses the same translation path as other rendered content.

Static catalogs work without network translation. New dynamic messages use
`/ui/translate` with the existing server-side OpenAI credentials. A bounded
memory cache stores translations. The endpoint exposes no agent tools and does
not read or mutate hospital state. It masks numeric facts and operational IDs,
checks all placeholders, and rejects mixed scripts for the published languages.
When unavailable, the app explicitly identifies untranslated English source;
it does not claim that fallback content has been translated.

To add a language, supply every source key in `catalogs/<code>.json`, check native
script and meaning, and add it to the script-validation tests. An incomplete
catalog does not appear in the selector. Dynamic translation remains machine
translation; this has not been independently reviewed by native-language editors.

Verification: `pytest backend/tests/test_translation.py` and
`npm run test:e2e -- tests/languages.spec.ts`.
