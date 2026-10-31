## Framework code stays generic (check this first)

Protobase is a framework, so library code (everything under packages/) must serve any app, not one app. The example apps under tests/apps/ (erp, real-estate, scratch) are test fixtures: app-specific code belongs there, never in a package. For every changed library file, check:

1. App- or demo-specific code in library source: names, fields, labels, screens, components, columns or files about one domain (invoices, invoice lines, products, quantities, prices, customers, properties) inside packages/. A file named after a demo domain in a package, or a library component that only makes sense for one app, is a finding. Test fakes and stories are fine only when they stay in testing or story files and production code does not import them.
2. Schema guessing: behaviour that infers an app's schema from field or resource names (for example "the child resource with a field named sort_order holds the rows", "a field called email is the login", or "a field called total is the sum") instead of reading declared config, relations or field types. Such a heuristic breaks silently for any app that names its fields differently. The fix is an explicit declaration (a relation option, a config key, a field type).
3. Hard-coded field names, magic values and special cases that only one app needs (for example a literal 'status' or 'amount' used as a field name in library code, or a branch for one resource).
4. Prefer extension points (declared config, relations, field types, hooks, slots) over app branches. When library code needs to know something about an app's schema, the app must declare it.

Quote the exact file and line for each such finding.
