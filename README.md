# Cards (Pocket Projects) – Project README Snapshot

## App
- Name: Cards (Pocket Projects)
- URL: https://cards.pocketprojects.in
- Hosting: Vercel (connected to GitHub repo)
- Dev environment: GitHub Codespaces
- Backend: Supabase (project ref: kmbwpaoofwnoiudqzwyt)
- Auth: Supabase Auth with Google Sign-In (working in prod)
- Theme/UI: dark, minimal, mobile-first, max width container (max-w-md), bottom nav, premium glassy cards

## Goal
Track credit card spends per billing cycle, compute statement due/remaining, record payments, handle EMI conversions + installment billing, maintain a “Plan Fund” set-aside balance, and provide a statement-first daily workflow. Dashboards + reminders now; notifications later.

## Key product model (how the app works)
1) Each card has:
- close_day (statement close)
- due_day (payment due)
- credit_limit (used for spend guardrails)

2) Statement month view (central hub)
- A statement is represented by a selected month (YYYY-MM)
- Cycle window:
  - cycleStart = day after previous close date
  - cycleEnd = close date in selected month
- Due date:
  - computed based on due_day relative to close_day (can land in same month or next month)
- Payments counted for the statement:
  - payStart = cycleStart
  - payments count if payment_date is between payStart and dueDate inclusive
- Remaining statement due:
  - totalDue = (sum of non-EMI spends in cycle) + (sum of EMI installments billed on dueDate)
  - remaining = max(0, totalDue - paidTotal)

3) Spends
- Non-EMI spends stored in transactions with is_emi = false
- Spend inserts always populate the DB-required date field (txn_date) and also populate best-effort compatible fields (spent_on, spent_at, etc.)
- Spend is blocked if it exceeds available limit:
  - available = credit_limit - (current used)
  - used is approximated via card_cycle_summary.remaining_due for that card (simple and effective)

4) Payments
- Payment inserts support query params from Statement: ?card=...&m=YYYY-MM&amount=...&max=...
- Guardrails:
  - amount cannot exceed max remaining for that statement (max param passed from Statement)
  - payment date must be inside that statement’s window when launched from Statement month
- Optional “Withdraw from Fund” toggle to also record a fund withdrawal

5) EMI conversions
- EMI is treated as a card transaction conceptually
- When an EMI is created:
  - create emi_plans row (with card_id, statement_month, purchase_date)
  - generate emi_installments schedule rows
  - insert a transactions row with is_emi = true and emi_plan_id set to link it
- Installments billed for a statement are those with due_date = the statement’s computed dueDate
- Important: emi_installments requires installment_no (NOT NULL) in your DB schema; always provide it during insert

6) Plan Fund
- Stored in plan_fund_events (set_aside, withdraw, adjust)
- Balance computed from events:
  - set_aside/adjust add
  - withdraw subtract
- Used to drive plan and “daily set aside” UX

7) Reminders (in-app notifications)
- Table in_app_reminders stores user reminders (due reminders, custom)
- Dashboard shows due-soon banner and a reminders list for next 14 days
- Reminders can be marked done

## Environment variables (Vercel + Codespaces)
- VITE_SUPABASE_URL=https://kmbwpaoofwnoiudqzwyt.supabase.co
- VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

## Tech stack
- Vite + React + TypeScript
- Tailwind CSS (pinned to 3.4.17 previously due to CLI issues)
- react-router-dom
- @supabase/supabase-js
- recharts removed from dashboard (no trend chart)
- vite-plugin-pwa (PWA installability, SW + manifest)
- Premium UI system: Card/Button/Input/Select/ProgressBar/Badge/Skeleton + ToastHost

## Routing (current)
Public:
- /login
- /privacy
- /terms

Authenticated (inside AppShell layout route):
- / (Dashboard)
- /cards (Cards list)
- /cards/new (Add card)
- /cards/:cardId/statement (Statement hub)
- /cards/:cardId/edit (Edit + delete card)
- /add (Add hub)
- /add/spend
- /add/payment
- /add/income
- /add/emi
- /emis (if still present)
- /plan

## UI/UX pillars (current “journey”)
- Dashboard is command center:
  - Due soon banner (<= 3 days / <= 7 days)
  - Continue card (next due)
  - Daily set-aside card + fund coverage progress
  - Reminders list (next 14 days)
  - Upcoming dues list

- Statement is the product:
  - Month selector
  - Summary: remaining/total/paid + progress
  - Action row: Add spend / Pay remaining / Convert EMI
  - Timeline view consolidating:
    - spends
    - payments (within statement window)
    - EMI billed (installments on due date)
    - EMI conversions tagged to this statement month

- Cards list:
  - Limit used/left + progress bar
  - Edit entry per card

- Edit card:
  - Edit metadata + limit/days
  - Delete (purge) with strong confirmation (type DELETE), warns if outstanding due

## Supabase tables (current intent / in use)
Core:
- cards (includes close_day, due_day, credit_limit)
- transactions (spends + emi conversion marker)
  - is_emi boolean
  - emi_plan_id nullable
  - IMPORTANT: your schema uses txn_date as required date field; app writes multiple date fields for compatibility

Payments:
- payments
  - paid_on date and/or paid_at timestamptz (app attempts both + compatibility fields)

Income:
- income_events

EMI:
- emi_plans
  - includes statement_month, purchase_date
  - interest field in your schema may be annual_interest_rate (NOT NULL) rather than annual_rate
- emi_installments
  - includes installment_no (NOT NULL), due_date, amount, paid_at, principal/interest components

Plan Fund:
- plan_fund_events
  - event_date, event_type (set_aside/withdraw/adjust), amount, note

Reminders:
- in_app_reminders
  - user_id, card_id (optional), kind, title, body, remind_on, is_done

Views (used by Dashboard/Cards):
- card_cycle_summary
- monthly_spend (no longer needed if chart removed, but can remain)

RLS
- Enabled on all app tables
- Policies: user_id = auth.uid() for select/insert/update/delete

## Important “gotchas” we already solved
- PostgREST schema cache issues: when adding columns/tables, run:
  - NOTIFY pgrst, 'reload schema';
- TypeScript errors from dynamic select strings in Supabase:
  - prefer static select strings; use dynamic column names only in filters
- Build failures:
  - accidental leading backslash in file: `\import` (remove it)
  - native bindings/optional deps (rolldown) mismatch: regenerate node_modules + package-lock on Linux; commit lockfile
- Schema mismatches:
  - required columns:
    - transactions.txn_date (NOT NULL)
    - emi_plans.annual_interest_rate (NOT NULL)
    - emi_installments.installment_no (NOT NULL)
  - app code now writes these fields and also tries compatibility fallbacks for mixed schema
- Payments not reducing due: fixed by counting payments from cycleStart to dueDate (not cycleEnd)