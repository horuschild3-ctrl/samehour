# samehour

A single page that shows when a few people's working hours overlap.

Pick a date, give each person a timezone and a start/end, and the page draws that day plus the block you all share. Times stay in 24-hour form. The team is saved in this browser only.

## Run

```bash
npm install
npm run dev
```

`npm test` covers the clock math. `npm run typecheck` and `npm run build` are the other checks CI runs.

## Layout

`src/overlap.ts` is the timezone math. `src/App.tsx` is the page. That split is deliberate: one file I would be annoyed to get wrong, and one file that is allowed to be ordinary.

## Choices

- TypeScript, Vite, and React. I already work in that stack, so the hour did not go into picking a framework.
- Vitest on the overlap code, not on the component tree. The page is a form. The bugs hide in timezones, DST, and overnight shifts.
- GitHub Actions on push and pull request: install, typecheck, test, build. No deploy step. It is a static page, and I did not want a hosting account in the setup.
- No server, accounts, or share links. Three people's hours do not need one.
- `localStorage`, so a refresh does not wipe the team. The date opens on today in the zone you are reading.
- Strict TypeScript. No ESLint. At this size the compiler is the check I actually wanted.

## Left out on purpose

- Holidays, PTO, and one-off days off.
- A shareable URL. With more time I would encode the team in the query string and still skip a backend.
- Asking which hour you mean when the clocks go back. The conversion is stable, but a shift that lands on the repeated hour is ambiguous. A normal 09:00–17:00 day does not hit that.
- A native app. The layout holds up on a phone width. I did not build a store build.

## With another day

Query-string sharing, a holiday toggle, and a clearer note when most of the shared block is "tomorrow morning" for you.
