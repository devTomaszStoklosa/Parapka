# Parapka

Aplikacja mobilna dla par, która pomaga obojgu partnerom lepiej się rozumieć i odciążać. Nazwa robocza. MVP w budowie.

## Dokumenty

- [intent.md](intent.md): intencja, czyli problem, wartość, zasady produktu i pytania otwarte.
- [spec.md](spec.md): specyfikacja MVP, czyli wymagania, model domenowy, architektura i miary sukcesu.
- [plan.md](plan.md): plan techniczny MVP, czyli decyzje, etapy, backlog issue dla pipeline'u i śledzenie wymagań.

## Jak powstaje kod

Zmiany powstają przez [wieloagentowy pipeline SDLC](https://github.com/devTomaszStoklosa/sdlc-multi-agent-pipeline), podłączony według [instrukcji](https://github.com/devTomaszStoklosa/sdlc-multi-agent-pipeline/blob/main/docs/onboarding.md):

1. Człowiek pisze issue z kryteriami akceptacji i dodaje etykietę `agent:ready`.
2. Planner publikuje plan w issue. Plan zmiany high-impact czeka na etykietę `plan:approved` od człowieka.
3. Developer implementuje zmianę na branchu `<typ>/<numer-issue>-<opis>` i otwiera draft PR.
4. Bramki ([.sdlc-agents.yml](.sdlc-agents.yml)) i Reviewer sprawdzają cały diff, najwyżej przez 3 rundy.
5. Człowiek robi finalne review i merge. Etykieta `agent:stop` zatrzymuje przebieg w każdej chwili.

Zmiany kryptografii, relaya, migracji i biblioteki treści są zawsze high-impact.

## Rozwój

Wymagania:

- Node.js 22 (wersja w [.nvmrc](.nvmrc));
- [gitleaks](https://github.com/gitleaks/gitleaks) 8.30.1 w `PATH`. Bez niego hook `pre-commit` odrzuca każdy commit.

`npm ci` instaluje zależności i hooki gita ([lefthook.yml](lefthook.yml)): Prettier, ESLint i gitleaks przed commitem oraz commitlint, czyli Conventional Commits z odwołaniem do issue, np. `feat: add the hybrid logical clock (#3)`.

Skrypty:

- `npm run typecheck`: TypeScript bez emisji plików;
- `npm run lint`: ESLint z progami złożoności i rozmiaru;
- `npm run format` i `npm run format:check`: Prettier (bez plików Markdown);
- `npm test`: Vitest;
- `npm run coverage`: Vitest z raportem `coverage/coverage-summary.json`.

Kod domenowy w czystym TypeScript leży w `packages/domain` (spec 7.2).
