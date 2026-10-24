# Apps built with Protobase

The Protobase project maintains these apps: three examples with their own seed data, and an empty project to start your own app from.

Each one is built with [Protobase](https://github.com/PrototeamHQ/protobase), an open-source framework that turns a Postgres database into an admin app. Short TypeScript files in the repository describe the tables and who may see what. Protobase maintains everything beneath them: the admin app, the REST API, sign-in and the server that checks access on every request. [Read the docs](https://docs.protobase.net)

## The apps

- **[ERP for an industrial supplier](https://github.com/protobase-community/erp):** companies, orders and stock, with roles from sales to the warehouse and cost fields that only some roles can read.
- **[Property portal](https://github.com/protobase-community/property-portal) for homes in the Netherlands and Spain:** visitors browse listings on a map and in photo carousels without an account, and members save favourites and searches with email alerts. [See it live](https://property-portal.protobase.net), reset daily.
- **[Rental and property management](https://github.com/protobase-community/property-management):** owners, properties, leases, rent, arrears and maintenance, with each IBAN masked until someone reveals it and every reveal audited.
- **[Empty project](https://github.com/protobase-community/starter) to start your own app:** no tables yet, and an `AGENTS.md` with rules for coding agents.

Each repository is a GitHub template, pinned to a Protobase release and tested against it in CI. Start your own with **Use this template**.

To start from a database you already have, run `protobase scaffold <connection string> --ui`. It reads the database in a read-only session and writes `data.ts` and `ui.ts` for each table.

Good to know: Protobase supports Postgres only and is before 1.0. A minor release may change the config format, while releases only add to the plugin API.

## Contribute

Anyone can open an issue or a pull request in any of these repositories. Read [CONTRIBUTING](https://github.com/protobase-community/.github/blob/main/CONTRIBUTING.md) and the [code of conduct](https://github.com/protobase-community/.github/blob/main/CODE_OF_CONDUCT.md) first.

More about Protobase: [protobase.net](https://protobase.net)
