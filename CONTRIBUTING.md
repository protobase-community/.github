# Contributing

Everyone is welcome in the [protobase-community](https://github.com/protobase-community) repositories: bug reports,
questions, fixes and new features alike. The apps exist for anyone who builds with
[Protobase](https://github.com/PrototeamHQ/protobase). Everyone taking part follows the
[code of conduct](CODE_OF_CONDUCT.md).

## Reporting a problem

Open an issue in the app's repository with what you did, what you expected and what happened instead. A problem in
Protobase itself, rather than in one of the apps, belongs in [Protobase's issues](https://github.com/PrototeamHQ/protobase/issues).

## Making a change

1. Fork the repository and create a branch.
2. Set it up as its README says: `bun install`, `bun run db:up`, `bun run db:migrate`, and `bun run db:seed --scale small`
   where the app has a seed.
3. Make your change. A change to the database is a new migration in `db/migrations/`, numbered after the last one;
   never edit one that exists. The app's `AGENTS.md` has the rules it follows.
4. Check it with `bun run typecheck`, `bun run test` and `bun run build`, as CI does.
5. Open a pull request that says what changed and why.

Keep each pull request to one change. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org),
such as `feat: filter the orders by status` or `fix: the seed's invoice totals`.

A repository's own CONTRIBUTING.md, where it has one, adds to this file.

## Licence

The apps are licensed under the Apache License 2.0. By contributing you agree that your contribution is licensed under
the licence of the repository you contribute to.
