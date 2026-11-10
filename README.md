# Macrolytics

Most calorie apps give you a target and never change it. Macrolytics starts with a formula, then learns your real
energy needs from what you eat and how your weight moves, and updates your targets every week.

Log food, recipes, weight and workouts. Sign in with Supabase, and your data follows you across devices.

## The math

All of it is in `artifacts/nutrition-tracker/src/lib/nutrition.ts`.

**Week one: a formula.**

```
BMR      = 10 × weight(kg) + 6.25 × height(cm) − 5 × age + (5 for men, −161 for women)    Mifflin-St Jeor
TDEE     = BMR × activity factor (1.2 to 1.9)
calories = TDEE − 400 on a cut, + 250 on a bulk
protein  = 2.1 g/kg on a cut, 1.8 g/kg otherwise;  fat = 24–27% of calories;  carbs = the rest
```

**Every week after: your data.** With at least 3 logged days and 2 weigh-ins in the last 7 days:

```
real TDEE = average intake on logged days − (weekly weight change × 7,700 kcal/kg) ÷ 7
```

If you ate 2,400 kcal a day and lost 0.7 kg in a week, your real TDEE is about 3,170 kcal, and the check-in raises a
cut that is too fast. Days with no food log are left out of the average, not counted as 0 kcal. New targets stay
between 1,200 and 5,200 kcal.

## Run

```sh
pnpm install
cp .env.example .env          # Supabase URL and publishable key
pnpm --filter @workspace/macrolytics-web dev
```

The Supabase values are visible in the browser, so never put a service-role key there. The repository does not yet
include the database schema: the app expects a `profiles` table and a `user_data` table, each with row-level security
so that users read only their own rows.

React, TypeScript, Vite, Tailwind CSS, shadcn/ui and Recharts. `vercel.json` handles routing on Vercel.
