# RBAC Platform — Implementation Plan Index

Source spec: `docs/superpowers/specs/2026-06-06-dynamic-multitenant-rbac-design.md`

The build is split into one plan per phase (spec §12). Each phase produces working,
testable software and is executed in order. Later-phase plans are written after the
prior phase is implemented and verified, so they reflect the real code.

| Phase | Plan file | Produces |
|------|-----------|----------|
| 1. Foundation | `2026-06-06-phase-1-foundation.md` | Docker Postgres, Sequelize models + Umzug migration, tenant-scoping hooks, auth (login/JWT), tenant-context middleware, restructured routes→controllers→services skeleton, login e2e test |
| 2. Engine | `2026-06-06-phase-2-engine.md` | Pure `can()` evaluator + operator library + unit tests |
| 3. Core RBAC services & admin APIs | `phase-3-admin.md` (TBW) | roles, grants, pages, user grants, `/admin/explain` |
| 4. Hospital domain | `phase-4-hospital.md` (TBW) | assets, work-orders, workflows + e2e |
| 5. PM domain | `phase-5-pm.md` (TBW) | projects, tasks (proves genericity) |
| 6. React app | `phase-6-web.md` (TBW) | login, dynamic nav, domain screens, admin console, explainer |
| 7. Seed + scenario tests | `phase-7-scenarios.md` (TBW) | demonstrate every scenario in spec §10 |

TBW = to be written when its phase begins.
