Project snapshot (so you can start a new chat and resume immediately)

App

* Name: Cards (Pocket Projects)
* URL: [https://cards.pocketprojects.in](https://cards.pocketprojects.in)
* Hosting: Vercel (connected to GitHub repo)
* Dev: GitHub Codespaces only
* Backend: Supabase (project ref: kmbwpaoofwnoiudqzwyt)
* Auth: Supabase Auth with Google sign-in working on prod
* Theme: Dark, minimal, mobile-first, max width container, bottom nav
* Goal: Track spends per card billing cycle, compute upcoming dues, handle EMI schedules, log payments and income, dashboards + notifications later

Environment variables (Vercel + Codespaces)

* VITE_SUPABASE_URL=[https://kmbwpaoofwnoiudqzwyt.supabase.co](https://kmbwpaoofwnoiudqzwyt.supabase.co)
* VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

Current frontend stack

* Vite + React + TypeScript
* Tailwind CSS (pinned to 3.4.17 due to earlier npx/CLI issues)
* react-router-dom
* @supabase/supabase-js
* recharts
* vite-plugin-pwa (PWA installability; service worker registration + manifest)

Routing + pages implemented

* /login (Google login)
* / (Dashboard)
* /cards (Cards list)
* /cards/new (Add card)
* /add (Add hub)
* /add/spend (Add spend)
* /add/payment (Add payment)
* /add/income (Add income)
* /add/emi (Add EMI plan + schedule generation)

UI structure

* AppShell with bottom nav: Home, Cards, Add
* Mobile-first layout: centered container max-w-md, dark background, rounded cards

Key code files (current structure)

* src/lib/supabase.ts
* src/hooks/useSession.ts
* src/components/AppShell.tsx
* src/pages/Login.tsx
* src/pages/Dashboard.tsx
* src/pages/Cards.tsx
* src/pages/NewCard.tsx
* src/pages/AddHub.tsx
* src/pages/AddSpend.tsx
* src/pages/AddPayment.tsx
* src/pages/AddIncome.tsx
* src/pages/NewEmi.tsx
* src/lib/format.ts (formatINR, date helpers)
* src/lib/emi.ts (buildEmiSchedule)
* public/pwa.svg
* vite.config.ts (VitePWA plugin)
* src/vite-env.d.ts (PWA types)
* Optional fallback type file: src/types/pwa-register.d.ts

Supabase database (current intent)
Core tables already created earlier

* cards: card metadata incl close_day and due_day
* transactions: spends; now also has is_emi boolean default false and emi_plan_id nullable (added later)

Additional tables intended/added in big migration

* payments: card payments
* income_events: salary/income entries
* emi_plans: EMI plan metadata (principal, rate, tenure, first_due_date, computed totals)
* emi_installments: generated installment schedule (due_date, principal/interest split, amount)

RLS

* Enabled and policies per table: user_id = auth.uid() for select/insert/update/delete

Views intended (used by Dashboard)

* card_cycle_summary: per-card current cycle window + due_date + cycle_spend + emi_due + paid_to_date + remaining_due + per_day_to_due
* monthly_spend: last months spend totals (excluding is_emi = true)

Note: You hit SQL errors while creating views because:

* First error: view used `SELECT x.*` without `FROM x` (fixed)
* Second error: transactions.is_emi didn’t exist because migration didn’t complete (fixed by adding column first, then recreating views)
  You later got it working by running a combined SQL script that:

1. Adds transactions.is_emi and transactions.emi_plan_id
2. Creates payments/income_events/emi_plans/emi_installments
3. Adds FK constraint transactions.emi_plan_id -> emi_plans.id
4. Enables RLS + policies
5. Recreates the views with `FROM x`

PWA status + fix

* You attempted `registerSW` and got TS error “Cannot find module 'virtual:pwa-register'”
  Fix applied:
* Ensure vite-plugin-pwa installed
* Add src/vite-env.d.ts:

  * /// <reference types="vite/client" />
  * /// <reference types="vite-plugin-pwa/client" />
* If still needed: add src/types/pwa-register.d.ts:

  * declare module "virtual:pwa-register" { export function registerSW(options?: any): any; }
* Also corrected import ordering and moved registerSW call after all imports in src/main.tsx

Important code elements (copy/paste references)

Supabase client (src/lib/supabase.ts)

* createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) with auth session persistence enabled

Session hook (src/hooks/useSession.ts)

* supabase.auth.getSession()
* supabase.auth.onAuthStateChange subscription

PWA registration (src/main.tsx)

* import { registerSW } from "virtual:pwa-register";
* registerSW({ immediate: true });

vite-env types (src/vite-env.d.ts)

* vite-plugin-pwa/client reference included

EMI schedule generator (src/lib/emi.ts)

* buildEmiSchedule({ principal, annualRate, months, firstDueDate })
* Returns monthlyEmi, totalPayable, totalInterest, installments[]
* Installments have principal + interest split, due_date per month

EMI creation flow (src/pages/NewEmi.tsx)

* Loads cards
* Prefills firstDueDate from card_cycle_summary due_date for selected card
* Creates emi_plans row
* Inserts emi_installments in bulk
* Inserts a transaction row with is_emi=true and emi_plan_id set (purchase record)
* Purchase record is excluded from normal cycle due totals (the due totals use only is_emi=false + installments due)

Dashboard (src/pages/Dashboard.tsx) big enhancement

* Queries card_cycle_summary ordered by due_date
* Queries monthly_spend for last 6 months chart
* Queries income_events for next 30 days for coverage metric
* Shows:

  * Total remaining due (sum of remaining_due)
  * Income next 30 days
  * Gap
  * Per-card due tiles (due date, days_to_due, remaining_due, per_day_to_due)
  * Spend trend chart

Cards + Spend

* Cards CRUD: /cards and /cards/new
* Add spend: /add/spend inserts into transactions (is_emi=false)

Payments + Income

* /add/payment inserts into payments
* /add/income inserts into income_events

Deployment status

* Vercel deployment works
* Domain connected: cards.pocketprojects.in
* Google auth works on production

Known bump points to avoid next chat

* Tailwind CLI init issue: stick to tailwindcss@3.4.17
* PWA virtual module TS issue: keep vite-env references + fallback module declaration
* Views depend on transactions.is_emi existing: add columns before creating views

Next tasks to pick up immediately (suggested)

1. Confirm DB migration is fully applied (tables + views exist) and Dashboard is reading from views successfully
2. Add EMI list page + installment “mark paid” toggles
3. Add “Pay plan” engine:

   * order cards by due date
   * recommend daily set-aside and salary allocation
4. Notifications:

   * start with in-app reminders table
   * then web push (later)

Continue from here: verify DB + views, then ship EMI list + mark installment paid, then pay plan.
