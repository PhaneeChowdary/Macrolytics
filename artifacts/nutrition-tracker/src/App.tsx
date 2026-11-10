import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Check,
  ClipboardCheck,
  Copy,
  Database,
  Dumbbell,
  Flame,
  LayoutDashboard,
  LogOut,
  Plus,
  Salad,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  TrendingUp,
  User,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Route, Router as WouterRouter, Switch, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  seedFoods,
  starterRecipes,
  starterTrainingTemplates,
} from "@/lib/demo-data";
import { supabase } from "@/lib/supabase";
import {
  adherenceScore,
  averageCalories,
  buildCheckIn,
  calculateTargets,
  chartSeries,
  foodFromRecipe,
  formatHeight,
  formatWeight,
  totalsForDate,
  toDisplayWeight,
  toKg,
  type CheckIn,
  type Food,
  type FoodLogEntry,
  type MacroTargets,
  type MealType,
  type Recipe,
  type Session,
  type TrainingExercise,
  type TrainingLogEntry,
  type TrainingSessionTemplate,
  type TrainingSplit,
  type UserProfile,
  type WeightEntry,
} from "@/lib/nutrition";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();
const STORAGE_KEY = "macrolytics-state-v2";
const SHARED_FOOD_LIBRARY_KEY = "macrolytics-shared-foods-v1";
const mealOrder: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const BUILT_IN_TRAINING_SPLITS = new Set<TrainingSplit>(["push", "pull", "legs"]);

interface MacrolyticsState {
  session: Session | null;
  profile: UserProfile;
  targets: MacroTargets;
  entries: FoodLogEntry[];
  weights: WeightEntry[];
  customFoods: Food[];
  recipes: Recipe[];
  checkIns: CheckIn[];
  trainingTemplates: TrainingSessionTemplate[];
  trainingLogs: TrainingLogEntry[];
  hiddenTrainingSplits: TrainingSplit[];
}

interface ProfileRow {
  id: string;
  email: string | null;
  name: string;
  age: number;
  sex: UserProfile["sex"];
  height_cm: number;
  current_weight_kg: number;
  goal_weight_kg: number;
  goal_type: UserProfile["goalType"];
  activity_level: UserProfile["activityLevel"];
  training_frequency: number;
  units: UserProfile["units"];
  display_units: UserProfile["displayUnits"];
  diet_preference: string;
  onboarding_complete: boolean;
}

interface UserDataRow {
  user_id: string;
  targets: MacroTargets;
  entries: FoodLogEntry[];
  weights: WeightEntry[];
  custom_foods: Food[];
  recipes: Recipe[];
  check_ins: CheckIn[];
  training_templates: TrainingSessionTemplate[];
  training_logs: TrainingLogEntry[];
  hidden_training_splits: TrainingSplit[];
}

interface ProfileDraft extends UserProfile {
  heightDisplay: number;
  currentWeightDisplay: number;
  goalWeightDisplay: number;
}

function createDraftProfile(): UserProfile {
  return {
    name: "",
    age: 30,
    sex: "male",
    heightCm: 178,
    currentWeightKg: 79.4,
    goalWeightKg: 79.4,
    goalType: "maintain",
    activityLevel: "moderate",
    trainingFrequency: 3,
    units: "imperial",
    displayUnits: "imperial",
    dietPreference: "",
    onboardingComplete: false,
  };
}

function buildProfileDraft(initialProfile: UserProfile): ProfileDraft {
  return {
    ...initialProfile,
    heightDisplay:
      initialProfile.units === "imperial"
        ? Number((initialProfile.heightCm / 2.54).toFixed(1))
        : initialProfile.heightCm,
    currentWeightDisplay: Number(
      toDisplayWeight(initialProfile.currentWeightKg, initialProfile.units).toFixed(1),
    ),
    goalWeightDisplay: Number(
      toDisplayWeight(initialProfile.goalWeightKg, initialProfile.units).toFixed(1),
    ),
  };
}

function sessionFromEmail(email: string): Session {
  return {
    email,
    mode: "email",
  };
}

function normalizeLegacyProfileState(profile: UserProfile, weights: WeightEntry[]) {
  const likelyImperialValuesSavedAsMetric =
    profile.heightCm < 100 &&
    profile.currentWeightKg > 120 &&
    profile.goalWeightKg > 120;

  if (!likelyImperialValuesSavedAsMetric) {
    return { profile, weights };
  }

  return {
    profile: {
      ...profile,
      heightCm: Number((profile.heightCm * 2.54).toFixed(1)),
      currentWeightKg: Number(toKg(profile.currentWeightKg, "imperial").toFixed(2)),
      goalWeightKg: Number(toKg(profile.goalWeightKg, "imperial").toFixed(2)),
    },
    weights: weights.map((entry) => ({
      ...entry,
      weightKg: Number(toKg(entry.weightKg, "imperial").toFixed(2)),
    })),
  };
}

function normalizeTrainingTemplates(
  templates: TrainingSessionTemplate[] | undefined,
  hiddenSplits: TrainingSplit[] | undefined,
): TrainingSessionTemplate[] {
  const hidden = new Set(hiddenSplits ?? []);
  const builtInTemplates = starterTrainingTemplates.filter((template) => !hidden.has(template.split));
  const customTemplates = (templates ?? [])
    .filter((template) => !BUILT_IN_TRAINING_SPLITS.has(template.split))
    .map((template) => ({
      ...template,
      exercises: template.exercises.map((exercise) => ({
        ...exercise,
        group: exercise.group || "Custom",
      })),
    }))
    .filter((template) => template.title.trim().length > 0);

  return [...builtInTemplates, ...customTemplates];
}

function profileToRow(userId: string, email: string, profile: UserProfile): ProfileRow {
  return {
    id: userId,
    email,
    name: profile.name,
    age: profile.age,
    sex: profile.sex,
    height_cm: profile.heightCm,
    current_weight_kg: profile.currentWeightKg,
    goal_weight_kg: profile.goalWeightKg,
    goal_type: profile.goalType,
    activity_level: profile.activityLevel,
    training_frequency: profile.trainingFrequency,
    units: profile.units,
    display_units: profile.displayUnits,
    diet_preference: profile.dietPreference,
    onboarding_complete: profile.onboardingComplete,
  };
}

function profileFromRow(row: ProfileRow): UserProfile {
  return {
    name: row.name,
    age: row.age,
    sex: row.sex,
    heightCm: row.height_cm,
    currentWeightKg: row.current_weight_kg,
    goalWeightKg: row.goal_weight_kg,
    goalType: row.goal_type,
    activityLevel: row.activity_level,
    trainingFrequency: row.training_frequency,
    units: row.units,
    displayUnits: row.display_units,
    dietPreference: row.diet_preference,
    onboardingComplete: row.onboarding_complete,
  };
}

function stateToUserDataRow(userId: string, state: MacrolyticsState): UserDataRow {
  return {
    user_id: userId,
    targets: state.targets,
    entries: state.entries,
    weights: state.weights,
    custom_foods: state.customFoods,
    recipes: state.recipes,
    check_ins: state.checkIns,
    training_templates: state.trainingTemplates.filter(
      (template) => !BUILT_IN_TRAINING_SPLITS.has(template.split),
    ),
    training_logs: state.trainingLogs,
    hidden_training_splits: state.hiddenTrainingSplits,
  };
}

function mergeUniqueFoods(...foodLists: Food[][]): Food[] {
  return Array.from(new Map(foodLists.flat().map((food) => [food.id, food])).values());
}

function profileFromDraft(draft: ProfileDraft): UserProfile {
  return {
    name: draft.name,
    age: draft.age,
    sex: draft.sex,
    heightCm:
      draft.units === "imperial"
        ? Number((draft.heightDisplay * 2.54).toFixed(1))
        : draft.heightDisplay,
    currentWeightKg: toKg(draft.currentWeightDisplay, draft.units),
    goalWeightKg: toKg(draft.goalWeightDisplay, draft.units),
    goalType: draft.goalType,
    activityLevel: draft.activityLevel,
    trainingFrequency: draft.trainingFrequency,
    units: draft.units,
    displayUnits: draft.displayUnits,
    dietPreference: draft.dietPreference,
    onboardingComplete: true,
  };
}

function createStartingWeight(profile: UserProfile): WeightEntry {
  return {
    id: `weight-start-${Date.now()}`,
    date: format(new Date(), "yyyy-MM-dd"),
    weightKg: profile.currentWeightKg,
    note: "Starting point",
  };
}

function createUserState(profile: UserProfile, session: Session | null): MacrolyticsState {
  return {
    session,
    profile,
    targets: calculateTargets(profile),
    entries: [],
    weights: [createStartingWeight(profile)],
    customFoods: [],
    recipes: starterRecipes,
    checkIns: [],
    trainingTemplates: starterTrainingTemplates,
    trainingLogs: [],
    hiddenTrainingSplits: [],
  };
}

function createInitialState(): MacrolyticsState {
  return createUserState(createDraftProfile(), null);
}

function loadState() {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return createInitialState();
  }

  try {
    const parsed = JSON.parse(stored) as Partial<MacrolyticsState>;
    const initialState = createInitialState();
    const hydratedProfile = {
      ...initialState.profile,
      ...parsed.profile,
      displayUnits:
        parsed.profile?.displayUnits ??
        parsed.profile?.units ??
        initialState.profile.displayUnits,
    };
    const hydratedWeights = parsed.weights ?? initialState.weights;
    const normalizedState = normalizeLegacyProfileState(hydratedProfile, hydratedWeights);

    return {
      ...initialState,
      ...parsed,
      profile: normalizedState.profile,
      weights: normalizedState.weights,
      hiddenTrainingSplits: parsed.hiddenTrainingSplits ?? [],
      trainingTemplates: normalizeTrainingTemplates(parsed.trainingTemplates, parsed.hiddenTrainingSplits),
      trainingLogs:
        parsed.trainingLogs?.map((log) => ({
          ...log,
          selectedExerciseIds: log.selectedExerciseIds ?? [],
        })) ?? [],
    };
  } catch {
    return createInitialState();
  }
}

function loadSharedFoods() {
  if (typeof window === "undefined") {
    return [] as Food[];
  }

  const stored = window.localStorage.getItem(SHARED_FOOD_LIBRARY_KEY);
  if (!stored) {
    return [] as Food[];
  }

  try {
    return JSON.parse(stored) as Food[];
  } catch {
    return [] as Food[];
  }
}

function buildMigratedState(email: string) {
  const localState = loadState();
  const canMigrateLocalState = localState.session?.email === email;
  const baseState = canMigrateLocalState
    ? localState
    : createUserState(createDraftProfile(), sessionFromEmail(email));
  const migratedFoods = canMigrateLocalState
    ? mergeUniqueFoods(loadSharedFoods(), baseState.customFoods)
    : [];
  const profile = {
    ...baseState.profile,
    displayUnits: baseState.profile.displayUnits ?? baseState.profile.units,
  };
  const normalizedState = normalizeLegacyProfileState(profile, baseState.weights);

  return {
    ...baseState,
    session: sessionFromEmail(email),
    profile: normalizedState.profile,
    targets: calculateTargets(normalizedState.profile),
    weights: normalizedState.weights,
    customFoods: migratedFoods,
    trainingTemplates: normalizeTrainingTemplates(
      baseState.trainingTemplates,
      baseState.hiddenTrainingSplits,
    ),
  };
}

async function persistRemoteState(userId: string, email: string, state: MacrolyticsState) {
  const profilePayload = profileToRow(userId, email, state.profile);
  const dataPayload = stateToUserDataRow(userId, state);

  const { error: profileError } = await supabase.from("profiles").upsert(profilePayload);
  if (profileError) {
    throw profileError;
  }

  const { error: dataError } = await supabase.from("user_data").upsert(dataPayload);
  if (dataError) {
    throw dataError;
  }
}

function PageBackdrop({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function BrandGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="11" width="3" height="7" rx="1.5" fill="currentColor" />
      <rect x="10.5" y="8" width="3" height="10" rx="1.5" fill="currentColor" />
      <rect x="17" y="5" width="3" height="13" rx="1.5" fill="currentColor" />
      <path
        d="M4.8 7.8L8.8 11.2L19.2 5.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashboardRing({
  label,
  value,
  target,
  progressClass,
}: {
  label: string;
  value: number;
  target: number;
  progressClass: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round((value / target) * 100)));
  const delta = target - value;
  const detail =
    delta >= 0
      ? `${target}g target • ${delta}g remaining`
      : `${target}g target • ${Math.abs(delta)}g over`;

  return (
    <div className="rounded-[1.75rem] border border-white/8 bg-slate-950/50 p-5">
      <p className="text-sm font-medium text-slate-200">{label}</p>

      <div className="mt-5">
        <p className="text-2xl font-semibold leading-none text-white sm:text-[2.5rem]">{value}g</p>
        <p className="mt-3 text-sm text-slate-400">{detail}</p>
      </div>

      <div className="mt-6">
        <div className="h-2 overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full ${progressClass}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-500">{percent}% complete</p>
      </div>
    </div>
  );
}

function AppShell({
  session,
  profile,
  activePath,
  onSignOut,
  children,
}: {
  session: Session;
  profile: UserProfile;
  activePath: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const navItems = [
    {
      href: "/app",
      label: "Dashboard",
      icon: LayoutDashboard,
      accentClass: "from-emerald-300/28 via-emerald-300/10 to-sky-300/20",
      badgeClass: "border-emerald-200/18 bg-emerald-300/12 text-emerald-50",
    },
    {
      href: "/app/log",
      label: "Food log",
      icon: Salad,
      accentClass: "from-lime-300/28 via-emerald-300/10 to-amber-300/18",
      badgeClass: "border-lime-200/18 bg-lime-300/12 text-lime-50",
    },
    {
      href: "/app/analytics",
      label: "Analytics",
      icon: BarChart3,
      accentClass: "from-sky-300/30 via-cyan-300/12 to-indigo-300/18",
      badgeClass: "border-sky-200/18 bg-sky-300/12 text-sky-50",
    },
    {
      href: "/app/check-in",
      label: "Check-in",
      icon: ClipboardCheck,
      accentClass: "from-amber-300/28 via-orange-300/10 to-emerald-300/16",
      badgeClass: "border-amber-200/18 bg-amber-300/12 text-amber-50",
    },
    {
      href: "/app/training",
      label: "Training",
      icon: Dumbbell,
      accentClass: "from-rose-300/28 via-fuchsia-300/10 to-sky-300/18",
      badgeClass: "border-rose-200/18 bg-rose-300/12 text-rose-50",
    },
    {
      href: "/app/profile",
      label: "Profile",
      icon: User,
      accentClass: "from-violet-300/26 via-indigo-300/10 to-sky-300/16",
      badgeClass: "border-violet-200/18 bg-violet-300/12 text-violet-50",
    },
  ];
  const activePage = navItems.find(({ href }) => href === activePath) ?? {
    label: "Macrolytics",
    accentClass: "from-emerald-300/28 via-emerald-300/10 to-sky-300/20",
    badgeClass: "border-emerald-200/18 bg-emerald-300/12 text-emerald-50",
  };
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-8">
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-4 space-y-4 rounded-[2rem] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
            <button
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setLocation("/app")}
              type="button"
            >
              <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-sky-300 text-slate-950">
                <BrandGlyph />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-100">
                  Macrolytics
                </p>
                <p className="text-xs text-slate-400">Nutrition intelligence</p>
              </div>
            </button>

            <div className="space-y-2 pt-4">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = activePath === href;
                return (
                  <button
                    key={href}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
                      active
                        ? "border-emerald-300/25 bg-emerald-300/10 text-white"
                        : "border-white/6 bg-slate-950/40 text-slate-300 hover:border-white/10 hover:text-white"
                    }`}
                    onClick={() => setLocation(href)}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/50 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Session</p>
              <p className="mt-3 text-sm font-medium text-white">{profile.name || session.email}</p>
              <p className="mt-1 text-sm text-slate-400">{session.email}</p>
              <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    className="mt-4 w-full rounded-full border-white/10 bg-white/6 text-white"
                    variant="outline"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-[2rem] border-white/10 bg-[#08120f] text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Sign out?</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      You will be returned to the login flow and your current session will end on this device.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      className="rounded-full border-white/12 bg-white/6 text-white"
                      onClick={() => setSignOutDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="rounded-full bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                      onClick={() => {
                        setSignOutDialogOpen(false);
                        onSignOut();
                      }}
                    >
                      Confirm sign out
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className={`relative mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/55 px-5 py-5 backdrop-blur-xl`}>
            <div className={`absolute inset-0 bg-gradient-to-r ${activePage.accentClass}`} />
            <div className="absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),transparent_68%)]" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-white">{activePage.label}</h1>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="rounded-full border-white/14 px-3 py-1 text-slate-100">
                  {profile.goalType}
                </Badge>
                <Badge className="rounded-full bg-white/14 px-3 py-1 text-white">
                  {profile.trainingFrequency} sessions/week
                </Badge>
              </div>
            </div>
          </div>

          {children}
        </div>
      </div>

      <div className="fixed bottom-0 left-4 right-4 z-40 rounded-t-[2rem] border border-white/10 border-b-0 bg-slate-950/88 px-2 py-2 backdrop-blur-xl sm:left-6 sm:right-6 lg:hidden">
        <div className="grid grid-cols-6 gap-1.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = activePath === href;
            return (
              <button
                key={href}
                aria-label={label}
                className={`flex items-center justify-center rounded-2xl px-2 py-2 ${
                  active ? "bg-emerald-300/12 text-white" : "text-slate-400"
                }`}
                onClick={() => setLocation(href)}
                type="button"
              >
                <Icon className="h-5 w-5" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function LandingPage({
  onGoLogin,
  onGoSignup,
  onGoAbout,
}: {
  onGoLogin: () => void;
  onGoSignup: () => void;
  onGoAbout: () => void;
}) {
  const corePoints = [
    "Targets from your setup",
    "Simple daily logging",
    "Weekly trend review",
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <PageBackdrop>
        <div className="absolute left-[-12rem] top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-300/16 blur-3xl" />
        <div className="absolute right-[-8rem] top-[10rem] h-[22rem] w-[22rem] rounded-full bg-sky-300/14 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl" />
        <Salad className="absolute left-[8%] top-[28%] h-9 w-9 text-emerald-200/7" />
        <Dumbbell className="absolute right-[11%] top-[24%] h-10 w-10 text-sky-200/7" />
        <Scale className="absolute left-[14%] bottom-[18%] h-8 w-8 text-white/6" />
      </PageBackdrop>

      <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-sky-300 text-slate-950">
              <BrandGlyph />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white">Macrolytics</p>
              <p className="text-xs text-slate-400">Nutrition tracking built around your numbers</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-full border-white/12 bg-white/6 text-white"
            onClick={onGoAbout}
            type="button"
          >
            About
          </Button>
        </header>

        <section className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10 lg:py-14">
          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="rounded-full bg-emerald-300/12 px-4 py-2 text-emerald-100">
              <ShieldCheck className="mr-2 h-3.5 w-3.5" />
              Personalized targets and simple check-ins.
            </Badge>
            <h1 className="mt-6 max-w-2xl font-serif text-4xl leading-[0.94] text-white sm:text-5xl lg:text-6xl">
              Track calories like a coach, not like a diary.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              Set your metrics once, log meals and bodyweight, and let the app keep your targets
              aligned with your goal.
            </p>
            <div className="mt-7 flex gap-3">
              <Button className="flex-1 rounded-full bg-emerald-300 px-6 text-slate-950 hover:bg-emerald-200 sm:flex-none" onClick={onGoSignup}>
                Sign up
              </Button>
              <Button variant="outline" className="flex-1 rounded-full border-white/12 bg-white/6 px-6 text-white sm:flex-none" onClick={onGoLogin}>
                Log in
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {corePoints.map((point) => (
                <div
                  key={point}
                  className="rounded-full border border-white/8 bg-white/6 px-4 py-2 text-sm text-slate-200 backdrop-blur-xl"
                >
                  {point}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="min-w-0"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
          >
            <Card className="overflow-hidden border-white/10 bg-white/6 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <CardContent className="space-y-6 p-5 sm:p-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Core workflow</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Built around your numbers.</h2>
                </div>

                <div className="grid gap-3">
                  {[
                    {
                      label: "Onboarding",
                      value: "Height, weight, goal, activity, and preferred units set the baseline.",
                    },
                    {
                      label: "Daily use",
                      value: "Log meals by day and keep bodyweight current.",
                    },
                    {
                      label: "Weekly review",
                      value: "Check-ins respond to your own trend.",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4 sm:p-5"
                    >
                      <p className="text-sm font-medium text-emerald-100">{item.label}</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">{item.value}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

function AboutPage({
  onBackHome,
}: {
  onBackHome: () => void;
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <PageBackdrop>
        <div className="absolute left-[-12rem] top-[-8rem] h-[26rem] w-[26rem] rounded-full bg-emerald-300/16 blur-3xl" />
        <div className="absolute right-[-8rem] top-[10rem] h-[22rem] w-[22rem] rounded-full bg-sky-300/14 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl" />
      </PageBackdrop>

      <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 px-4 py-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-sky-300 text-slate-950">
              <BrandGlyph />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white">Macrolytics</p>
              <p className="text-xs text-slate-400">About</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-full border-white/12 bg-white/6 text-white"
            onClick={onBackHome}
            type="button"
          >
            Back
          </Button>
        </header>

        <section className="py-10 lg:py-14">
          <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
            <CardContent className="space-y-6 p-6 sm:p-8">
              <div>
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">About Macrolytics</h1>
                <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  Macrolytics is a nutrition and progress tracking app built to keep daily logging
                  simple and targets clear.
                </p>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-5">
                  <h2 className="text-lg font-semibold text-white">What it does</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    It helps you track calories, protein, carbs, fat, bodyweight, and training in
                    one place.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-5">
                  <h2 className="text-lg font-semibold text-white">How it works</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    You set up your profile once, log food and weigh-ins over time, and review
                    trends through the dashboard, analytics, and check-ins.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-5">
                  <h2 className="text-lg font-semibold text-white">Who it is for</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    It is designed for people who want a focused system for cutting, maintaining,
                    or bulking without unnecessary complexity.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function AuthPage({
  mode,
  onSubmit,
  authError,
  authMessage,
  isSubmitting,
}: {
  mode: "login" | "signup";
  onSubmit: (email: string, password: string, mode: "login" | "signup") => Promise<void> | void;
  authError?: string | null;
  authMessage?: string | null;
  isSubmitting?: boolean;
}) {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-5xl overflow-hidden border-white/10 bg-white/6 backdrop-blur-xl">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-white/8 bg-slate-950/55 p-8 lg:border-b-0 lg:border-r">
            <Badge className="rounded-full bg-emerald-300/12 px-4 py-2 text-emerald-100">
              Macrolytics access
            </Badge>
            <h1 className="mt-6 font-serif text-4xl text-white">
              {mode === "login" ? "Welcome back." : "Create your coaching workspace."}
            </h1>
            <p className="mt-5 text-sm leading-7 text-slate-300">
              Sign in with your email to keep your plan, logs, and training data synced through
              your account.
            </p>
          </div>

          <CardContent className="p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">{mode === "login" ? "Log in" : "Sign up"}</h2>
              </div>
              <Button variant="outline" className="rounded-full border-white/12 bg-white/6 text-white" onClick={() => setLocation("/")}>
                Back
              </Button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmit(email, password, mode);
              }}
            >
              <div>
                <label className="mb-2 block text-sm text-slate-300">Email</label>
                <Input
                  className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Password</label>
                <Input
                  className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  className="h-10 w-full rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                  disabled={!email.trim() || !password.trim() || isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Working..." : mode === "login" ? "Continue to app" : "Create account"}
                </Button>
                <Button
                  variant="outline"
                  className="h-10 rounded-2xl border-white/12 bg-white/6 text-white"
                  onClick={() => setLocation(mode === "login" ? "/signup" : "/login")}
                  type="button"
                >
                  {mode === "login" ? "Need an account?" : "Already have an account?"}
                </Button>
              </div>
            </form>

            {authError ? (
              <p className="mt-4 text-sm text-red-300">{authError}</p>
            ) : null}
            {authMessage ? (
              <p className="mt-4 text-sm text-emerald-200">{authMessage}</p>
            ) : null}
          </CardContent>
        </div>
      </Card>
    </main>
  );
}

function OnboardingPage({
  initialProfile,
  onComplete,
}: {
  initialProfile: UserProfile;
  onComplete: (profile: UserProfile) => void;
}) {
  const [draft, setDraft] = useState(() => buildProfileDraft(initialProfile));
  const previewProfile = profileFromDraft(draft);
  const previewTargets = calculateTargets(previewProfile);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_0.9fr]">
        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-8">
            <Badge className="rounded-full bg-emerald-300/12 px-4 py-2 text-emerald-100">Onboarding</Badge>
            <h1 className="mt-5 text-3xl font-semibold text-white">Build the first coaching baseline.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              These details set the baseline for your saved targets, dashboard, and weekly reviews.
            </p>

            <ProfileEditorFields draft={draft} onChange={setDraft} />

            <Button
              className="mt-8 h-10 rounded-2xl bg-emerald-300 px-5 text-slate-950 hover:bg-emerald-200"
              onClick={() => onComplete(previewProfile)}
            >
              Save onboarding and open dashboard
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Calculated preview</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Your first target set</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <PreviewStat label="Calories" value={previewTargets.calories} />
                <PreviewStat label="Protein" value={`${previewTargets.proteinG} g`} />
                <PreviewStat label="Carbs" value={`${previewTargets.carbsG} g`} />
                <PreviewStat label="Fat" value={`${previewTargets.fatG} g`} />
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </main>
  );
}

function ProfileEditorFields({
  draft,
  onChange,
  showDisplayUnits = false,
}: {
  draft: ProfileDraft;
  onChange: Dispatch<SetStateAction<ProfileDraft>>;
  showDisplayUnits?: boolean;
}) {
  return (
    <div className="mt-8 grid gap-4 md:grid-cols-2">
      <Field label="Name">
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" value={draft.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} />
      </Field>
      <Field label="Age">
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={draft.age} onChange={(event) => onChange((current) => ({ ...current, age: Number(event.target.value) }))} />
      </Field>
      <Field label="Sex">
        <Select value={draft.sex} onValueChange={(value) => onChange((current) => ({ ...current, sex: value as UserProfile["sex"] }))}>
          <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Units">
        <Select
          value={draft.units}
          onValueChange={(value) =>
            onChange((current) => ({
              ...current,
              units: value as UserProfile["units"],
              displayUnits: showDisplayUnits ? current.displayUnits : (value as UserProfile["displayUnits"]),
              heightDisplay:
                value === current.units
                  ? current.heightDisplay
                  : value === "imperial"
                    ? Number((current.heightDisplay / 2.54).toFixed(1))
                    : Number((current.heightDisplay * 2.54).toFixed(1)),
              currentWeightDisplay:
                value === current.units
                  ? current.currentWeightDisplay
                  : Number(
                      toDisplayWeight(
                        toKg(current.currentWeightDisplay, current.units),
                        value as UserProfile["units"],
                      ).toFixed(1),
                    ),
              goalWeightDisplay:
                value === current.units
                  ? current.goalWeightDisplay
                  : Number(
                      toDisplayWeight(
                        toKg(current.goalWeightDisplay, current.units),
                        value as UserProfile["units"],
                      ).toFixed(1),
                    ),
            }))
          }
        >
          <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="imperial">Imperial</SelectItem>
            <SelectItem value="metric">Metric</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {showDisplayUnits ? (
        <Field label="Dashboard units">
          <Select value={draft.displayUnits} onValueChange={(value) => onChange((current) => ({ ...current, displayUnits: value as UserProfile["displayUnits"] }))}>
            <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="imperial">Imperial</SelectItem>
              <SelectItem value="metric">Metric</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <Field label={`Height (${draft.units === "imperial" ? "in" : "cm"})`}>
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={draft.heightDisplay} onChange={(event) => onChange((current) => ({ ...current, heightDisplay: Number(event.target.value) }))} />
      </Field>
      <Field label={`Current weight (${draft.units === "imperial" ? "lb" : "kg"})`}>
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={draft.currentWeightDisplay} onChange={(event) => onChange((current) => ({ ...current, currentWeightDisplay: Number(event.target.value) }))} />
      </Field>
      <Field label={`Goal weight (${draft.units === "imperial" ? "lb" : "kg"})`}>
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={draft.goalWeightDisplay} onChange={(event) => onChange((current) => ({ ...current, goalWeightDisplay: Number(event.target.value) }))} />
      </Field>
      <Field label="Goal type">
        <Select value={draft.goalType} onValueChange={(value) => onChange((current) => ({ ...current, goalType: value as UserProfile["goalType"] }))}>
          <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cut">Cut</SelectItem>
            <SelectItem value="maintain">Maintain</SelectItem>
            <SelectItem value="bulk">Bulk</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Activity level">
        <Select value={draft.activityLevel} onValueChange={(value) => onChange((current) => ({ ...current, activityLevel: value as UserProfile["activityLevel"] }))}>
          <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sedentary">Sedentary</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="very_active">Very active</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Training frequency">
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={draft.trainingFrequency} onChange={(event) => onChange((current) => ({ ...current, trainingFrequency: Number(event.target.value) }))} />
      </Field>
      <Field label="Diet preference" className="md:col-span-2">
        <Textarea className="min-h-28 rounded-2xl border-white/10 bg-slate-950/45 text-white" value={draft.dietPreference} onChange={(event) => onChange((current) => ({ ...current, dietPreference: event.target.value }))} />
      </Field>
    </div>
  );
}

function ProfilePage({
  profile,
  targets,
  onSignOut,
  onSave,
}: {
  profile: UserProfile;
  targets: MacroTargets;
  onSignOut: () => void;
  onSave: (profile: UserProfile) => void;
}) {
  const [draft, setDraft] = useState(() => buildProfileDraft(profile));
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const updatedProfile = profileFromDraft(draft);
  const updatedTargets = calculateTargets(updatedProfile);

  useEffect(() => {
    setDraft(buildProfileDraft(profile));
  }, [profile]);

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="max-w-xl">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Profile</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Account settings</h2>
          </div>

          <ProfileEditorFields draft={draft} onChange={setDraft} showDisplayUnits />
          <div className="mt-6 flex justify-center">
            <Button
              className="h-9 rounded-2xl bg-emerald-300 px-4 text-sm text-slate-950 hover:bg-emerald-200"
              onClick={() => onSave(updatedProfile)}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="px-4 py-6 sm:px-5">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Updated targets</p>
            <h3 className="mt-2 text-lg font-semibold text-white">Preview after save</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InlinePreviewStat label="Calories" value={`${updatedTargets.calories} kcal`} />
              <InlinePreviewStat label="Protein" value={`${updatedTargets.proteinG} g`} />
              <InlinePreviewStat label="Carbs" value={`${updatedTargets.carbsG} g`} />
              <InlinePreviewStat label="Fat" value={`${updatedTargets.fatG} g`} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Current setup</p>
            <h3 className="mt-2 text-lg font-semibold text-white">What is active now</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <InlinePreviewStat label="Entry units" value={profile.units === "imperial" ? "lb / in" : "kg / cm"} />
              <InlinePreviewStat label="Dashboard units" value={profile.displayUnits === "imperial" ? "lb / in" : "kg / cm"} />
              <InlinePreviewStat label="Training" value={`${profile.trainingFrequency} sessions`} />
              <InlinePreviewStat label="Calories" value={`${targets.calories} kcal`} />
              <InlinePreviewStat label="Goal" value={profile.goalType} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="lg:hidden">
        <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
          <DialogTrigger asChild>
            <Button
              className="h-10 rounded-2xl border-rose-300/20 bg-rose-400/12 px-4 text-sm text-rose-100 hover:bg-rose-400/18"
              variant="outline"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md rounded-[2rem] border-white/10 bg-[#08120f] text-white">
            <DialogHeader>
              <DialogTitle className="text-white">Sign out?</DialogTitle>
              <DialogDescription className="text-slate-400">
                You will be returned to the login flow and your current session will end on this device.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="rounded-full border-white/12 bg-white/6 text-white"
                onClick={() => setSignOutDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-full bg-rose-300 text-slate-950 hover:bg-rose-200"
                onClick={() => {
                  setSignOutDialogOpen(false);
                  onSignOut();
                }}
              >
                Confirm sign out
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function DashboardPage({
  profile,
  targets,
  entries,
  weights,
  selectedDate,
  onSelectedDateChange,
  onAddWeight,
  onDeleteEntry,
  onClearEntries,
}: {
  profile: UserProfile;
  targets: MacroTargets;
  entries: FoodLogEntry[];
  weights: WeightEntry[];
  selectedDate: string;
  onSelectedDateChange: (value: string) => void;
  onAddWeight: (weightDisplay: number, note: string) => void;
  onDeleteEntry: (id: string) => void;
  onClearEntries: (date: string) => void;
}) {
  const totals = totalsForDate(entries, selectedDate);
  const series = chartSeries(entries, 8).map((item) => ({
    ...item,
    target: targets.calories,
  }));
  const trendWeight = weights[weights.length - 1]?.weightKg ?? profile.currentWeightKg;
  const pending = buildCheckIn(profile, entries, weights);
  const recentEntries = entries.filter((entry) => entry.date === selectedDate).slice(0, 6);
  const displayUnits = profile.displayUnits;
  const trendChangeDisplay = toDisplayWeight(Math.abs(pending.trendChangeKg), displayUnits).toFixed(1);
  const trendUnit = displayUnits === "imperial" ? "lb" : "kg";
  const heightLabel = formatHeight(profile.heightCm, displayUnits);
  const weightUnitLabel = displayUnits === "imperial" ? "lb" : "kg";
  const [weightValue, setWeightValue] = useState(Number(toDisplayWeight(trendWeight, displayUnits).toFixed(1)));
  const [note, setNote] = useState("");
  const [clearDayDialogOpen, setClearDayDialogOpen] = useState(false);

  useEffect(() => {
    setWeightValue(Number(toDisplayWeight(trendWeight, displayUnits).toFixed(1)));
  }, [displayUnits, trendWeight]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Today</p>
                <h2 className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                  <span>Calories remaining</span>
                  <span className="whitespace-nowrap">{targets.calories - totals.calories}</span>
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  {totals.calories} logged of {targets.calories} target for {format(parseISO(selectedDate), "MMM d")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Input className="h-11 w-full rounded-2xl border-white/10 bg-slate-950/45 text-white sm:w-[168px]" type="date" value={selectedDate} onChange={(event) => onSelectedDateChange(event.target.value)} />
                <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                  {displayUnits === "imperial" ? "Using lb and in" : "Using kg and cm"}
                </Badge>
                <Badge className="rounded-full bg-emerald-300 px-3 py-1 text-slate-950">
                  {entries.length === 0 ? "No intake logged yet" : `${adherenceScore(entries, targets)}% adherence`}
                </Badge>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <DashboardRing label="Protein" value={Math.round(totals.proteinG)} target={targets.proteinG} progressClass="bg-emerald-300" />
              <DashboardRing label="Carbs" value={Math.round(totals.carbsG)} target={targets.carbsG} progressClass="bg-sky-300" />
              <DashboardRing label="Fat" value={Math.round(totals.fatG)} target={targets.fatG} progressClass="bg-amber-300" />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <MetricCard icon={Scale} label="Current weight" value={formatWeight(profile.currentWeightKg, displayUnits)} detail={`Goal ${formatWeight(profile.goalWeightKg, displayUnits)} • Height ${heightLabel}`} />
          <MetricCard icon={TrendingUp} label="Trend weight" value={formatWeight(trendWeight, displayUnits)} detail={`${pending.trendChangeKg < 0 ? "-" : "+"}${trendChangeDisplay} ${trendUnit} this week`} />
          <MetricCard icon={Activity} label="Estimated expenditure" value={`${pending.estimatedTdee} kcal`} detail={entries.length === 0 ? "Log meals to unlock a real intake average." : `7-day intake average ${averageCalories(entries, 7)} kcal`} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Last 8 days</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Calorie trend</h3>
              </div>
              <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                Intake vs target
              </Badge>
            </div>
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: -12, right: -12 }}>
                  <defs>
                    <linearGradient id="calories" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={40} />
                  <RechartsTooltip contentStyle={{ background: "#07120f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }} />
                  <Area type="monotone" dataKey="calories" stroke="#6ee7b7" fill="url(#calories)" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="target" stroke="#fbbf24" dot={false} strokeDasharray="4 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="space-y-5 p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Quick weigh-in</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Log bodyweight ({weightUnitLabel})</h3>
            </div>
            <div className="grid gap-3">
              <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={weightValue} onChange={(event) => setWeightValue(Number(event.target.value))} />
              <Textarea className="min-h-24 rounded-2xl border-white/10 bg-slate-950/45 text-white" placeholder="Optional note" value={note} onChange={(event) => setNote(event.target.value)} />
              <Button
                className="h-9 justify-self-start rounded-2xl bg-emerald-300 px-4 text-sm text-slate-950 hover:bg-emerald-200"
                onClick={() => {
                  onAddWeight(weightValue, note);
                  setNote("");
                }}
              >
                Save weight
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Recent log</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Meals for {format(parseISO(selectedDate), "MMM d")}</h3>
            </div>
            {recentEntries.length > 0 ? (
              <Dialog open={clearDayDialogOpen} onOpenChange={setClearDayDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 rounded-full border-white/10 bg-white/5 px-3 text-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear day
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md rounded-[2rem] border-white/10 bg-[#08120f] text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Clear this day?</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      This will remove all recent log items for {format(parseISO(selectedDate), "MMM d")}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button
                      variant="outline"
                      className="rounded-full border-white/12 bg-white/6 text-white"
                      onClick={() => setClearDayDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="rounded-full bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                      onClick={() => {
                        onClearEntries(selectedDate);
                        setClearDayDialogOpen(false);
                      }}
                    >
                      Confirm
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {recentEntries.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                No meals logged for this day yet.
              </div>
            ) : (
              recentEntries.map((entry) => (
                <div key={entry.id} className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{entry.name}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{entry.mealType}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                        {entry.calories} kcal
                      </Badge>
                      <Button
                        variant="outline"
                        className="h-8 w-8 rounded-full border-red-400/20 bg-red-400/8 p-0 text-red-200 hover:bg-red-400/12"
                        onClick={() => onDeleteEntry(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">
                    {entry.proteinG}P / {entry.carbsG}C / {entry.fatG}F
                  </p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FoodLogPage({
  selectedDate,
  onSelectedDateChange,
  foods,
  recipes,
  entries,
  onAddEntry,
  onUpdateServings,
  onDuplicateEntry,
  onDeleteEntry,
  onCopyPreviousDay,
  onAddCustomFood,
}: {
  selectedDate: string;
  onSelectedDateChange: (value: string) => void;
  foods: Food[];
  recipes: Recipe[];
  entries: FoodLogEntry[];
  onAddEntry: (food: Food, servings: number, mealType: MealType, date: string) => void;
  onUpdateServings: (id: string, servings: number) => void;
  onDuplicateEntry: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onCopyPreviousDay: (date: string) => void;
  onAddCustomFood: (food: Food) => void;
}) {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customFoodName, setCustomFoodName] = useState("");
  const logFoods = [...foods, ...recipes.map((recipe) => foodFromRecipe(recipe, foods))];
  const filteredFoods = logFoods.filter((food) => food.name.toLowerCase().includes(search.toLowerCase()));
  const dayEntries = entries.filter((entry) => entry.date === selectedDate);
  const totals = totalsForDate(entries, selectedDate);

  return (
    <div className="relative space-y-6">
      <PageBackdrop className="opacity-70">
        <Salad className="absolute left-[4%] top-[8%] h-8 w-8 text-emerald-200/6" />
        <Flame className="absolute right-[8%] top-[22%] h-8 w-8 text-amber-200/6" />
        <Scale className="absolute left-[10%] bottom-[10%] h-8 w-8 text-white/5" />
      </PageBackdrop>

      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Food log</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Timeline-based logging</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Input className="h-11 w-[180px] rounded-2xl border-white/10 bg-slate-950/45 text-white" type="date" value={selectedDate} onChange={(event) => onSelectedDateChange(event.target.value)} />
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-9 rounded-2xl bg-emerald-300 px-4 text-sm text-slate-950 hover:bg-emerald-200">
                <Plus className="h-4 w-4" />
                Quick add food
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl rounded-[2rem] border-white/10 bg-[#08120f] text-white">
              <FoodPickerDialog
                foods={filteredFoods}
                searchValue={search}
                onSearch={setSearch}
                onCreateFood={() => {
                  setDialogOpen(false);
                  setCustomFoodName(search.trim());
                  setCustomDialogOpen(true);
                }}
                onAdd={(food, servings, mealType) => {
                  onAddEntry(food, servings, mealType, selectedDate);
                  setDialogOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog
            open={customDialogOpen}
            onOpenChange={(open) => {
              setCustomDialogOpen(open);
              if (!open) {
                setCustomFoodName("");
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="h-9 rounded-2xl border-white/12 bg-white/6 px-4 text-sm text-white"
                onClick={() => setCustomFoodName("")}
              >
                Add new food
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl rounded-[2rem] border-white/10 bg-[#08120f] text-white">
              <CustomFoodDialog
                initialName={customFoodName}
                onSave={(food) => {
                  onAddCustomFood(food);
                  setCustomFoodName("");
                  setCustomDialogOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
          <Button variant="outline" className="h-9 rounded-2xl border-white/12 bg-white/6 px-4 text-sm text-white" onClick={() => onCopyPreviousDay(selectedDate)}>
            <Copy className="h-4 w-4" />
            Copy yesterday
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {mealOrder.map((mealType) => {
            const mealEntries = dayEntries.filter((entry) => entry.mealType === mealType);
            return (
              <Card key={mealType} className="border-white/10 bg-white/6 backdrop-blur-xl">
                <CardContent className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{mealType}</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">
                        {mealEntries.length ? `${mealEntries.length} entries` : "Nothing logged yet"}
                      </h3>
                    </div>
                    <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                      {mealEntries.reduce((sum, entry) => sum + entry.calories, 0)} kcal
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {mealEntries.length === 0 ? (
                      <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                        Add a meal to start building the day.
                      </div>
                    ) : (
                      mealEntries.map((entry) => (
                        <div key={entry.id} className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-sm font-medium text-white">{entry.name}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {entry.servingLabel} • {entry.calories} kcal • {entry.proteinG}P / {entry.carbsG}C / {entry.fatG}F
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                className="h-8 w-20 rounded-lg border-white/10 bg-white/5 px-3 text-sm text-white"
                                type="number"
                                step="0.25"
                                min="0.25"
                                value={entry.servings}
                                onChange={(event) => onUpdateServings(entry.id, Number(event.target.value))}
                              />
                              <Button variant="outline" className="h-8 rounded-lg border-white/10 bg-white/5 px-3 text-white" onClick={() => onDuplicateEntry(entry.id)}>
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" className="h-8 rounded-lg border-white/10 bg-white/5 px-3 text-white" onClick={() => onDeleteEntry(entry.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Daily totals</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{totals.calories} kcal</h3>
              <div className="mt-5 grid gap-3">
                {[
                  { label: "Protein", value: `${Math.round(totals.proteinG)} g` },
                  { label: "Carbs", value: `${Math.round(totals.carbsG)} g` },
                  { label: "Fat", value: `${Math.round(totals.fatG)} g` },
                  { label: "Fiber", value: `${Math.round(totals.fiberG)} g` },
                  { label: "Sugar", value: `${Math.round(totals.sugarG)} g` },
                  { label: "Sodium", value: `${Math.round(totals.sodiumMg)} mg` },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3 text-sm">
                    <span className="text-slate-300">{item.label}</span>
                    <span className="font-medium text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Recipes</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Reusable meals</h3>
              <div className="mt-4 space-y-3">
                {recipes.map((recipe) => {
                  const recipeFood = foodFromRecipe(recipe, foods);
                  return (
                    <div key={recipe.id} className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{recipe.name}</p>
                          <p className="text-xs text-slate-400">{recipe.notes}</p>
                        </div>
                        <Button className="rounded-full bg-emerald-300 text-slate-950 hover:bg-emerald-200" onClick={() => onAddEntry(recipeFood, 1, "lunch", selectedDate)}>
                          Log
                        </Button>
                      </div>
                      <p className="mt-3 text-sm text-slate-300">
                        {recipeFood.calories} kcal • {recipeFood.proteinG}P / {recipeFood.carbsG}C / {recipeFood.fatG}F
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPage({
  profile,
  targets,
  entries,
  weights,
}: {
  profile: UserProfile;
  targets: MacroTargets;
  entries: FoodLogEntry[];
  weights: WeightEntry[];
}) {
  const displayUnits = profile.displayUnits;
  const series = chartSeries(entries, 10).map((item) => ({
    ...item,
    target: targets.calories,
  }));
  const macroBars = series.map((item) => ({
    label: item.label,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
  }));
  const weightData = weights.map((item) => ({
    label: format(parseISO(item.date), "MMM d"),
    weight: Number(toDisplayWeight(item.weightKg, displayUnits).toFixed(1)),
  }));
  const insights =
    entries.length < 3
      ? [
          "Log a few full days of intake to unlock reliable adherence and calorie trends.",
          "Targets already reflect the profile you set during onboarding.",
          weights.length < 2
            ? "Add a couple of weigh-ins to build a meaningful bodyweight trend."
            : `Your current goal phase is ${profile.goalType}, and weekly check-ins will adjust from your real trend.`,
        ]
      : [
          `${averageCalories(entries, 7)} kcal is your current 7-day intake average against a ${targets.calories} kcal target.`,
          `${adherenceScore(entries, targets)}% adherence is based on your actual intake and protein logging.`,
          weights.length < 2
            ? "Add more weigh-ins to connect calorie intake with scale changes."
            : `Your current goal phase is ${profile.goalType}, and check-ins will use your logged trend instead of placeholder estimates.`,
        ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={Flame} label="Average intake" value={entries.length === 0 ? "No data yet" : `${averageCalories(entries, 7)} kcal`} detail={`Target ${targets.calories} kcal`} />
        <MetricCard icon={TrendingUp} label="Adherence score" value={entries.length === 0 ? "Pending" : `${adherenceScore(entries, targets)}%`} detail="7-day scoring window" />
        <MetricCard icon={Database} label="Logged entries" value={`${entries.length}`} detail="Food, custom foods, and recipes" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Calories over time" subtitle="Daily intake vs target">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ left: -12, right: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={40} />
              <RechartsTooltip contentStyle={{ background: "#07120f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }} />
              <Line type="monotone" dataKey="calories" stroke="#6ee7b7" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="target" stroke="#fbbf24" strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Weight trend" subtitle="Daily weigh-ins">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weightData} margin={{ left: -12, right: -12 }}>
              <defs>
                <linearGradient id="weight" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#7dd3fc" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#7dd3fc" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={40} />
              <RechartsTooltip contentStyle={{ background: "#07120f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }} />
              <Area type="monotone" dataKey="weight" stroke="#7dd3fc" fill="url(#weight)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Macro breakdown" subtitle="Protein, carbs, and fat by day">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={macroBars} margin={{ left: -12, right: -12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} width={40} />
              <RechartsTooltip contentStyle={{ background: "#07120f", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16 }} />
              <Bar dataKey="protein" fill="#6ee7b7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="carbs" fill="#7dd3fc" radius={[6, 6, 0, 0]} />
              <Bar dataKey="fat" fill="#fbbf24" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-6">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Insights</p>
            <h3 className="mt-2 text-xl font-semibold text-white">What the data says</h3>
            <div className="mt-5 space-y-3">
              {insights.map((text) => (
                <div key={text} className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 px-4 py-4 text-sm leading-7 text-slate-200">
                  {text}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CheckInPage({
  profile,
  entries,
  weights,
  targets,
  checkIns,
  onAccept,
  onSkip,
  onDeleteCheckIn,
  onClearCheckIns,
}: {
  profile: UserProfile;
  entries: FoodLogEntry[];
  weights: WeightEntry[];
  targets: MacroTargets;
  checkIns: CheckIn[];
  onAccept: (checkIn: CheckIn) => void;
  onSkip: (checkIn: CheckIn) => void;
  onDeleteCheckIn: (id: string) => void;
  onClearCheckIns: () => void;
}) {
  const displayUnits = profile.displayUnits;
  const pending = buildCheckIn(profile, entries, weights);
  const hasEnoughData = entries.length >= 3 && weights.length >= 2;

  return (
    <div className="space-y-6">
      <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Pending weekly check-in</p>
              <h2 className="mt-2 text-3xl font-semibold text-white">Recommended adjustment</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">{pending.message}</p>
            </div>
            <Badge className="self-start rounded-full bg-emerald-300 px-2.5 py-1 text-sm text-slate-950">
              {hasEnoughData ? `${pending.adherence}% adherence` : "Data pending"}
            </Badge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PreviewStat label="Average intake" value={`${pending.averageCalories} kcal`} />
            <PreviewStat label="Average weight" value={formatWeight(pending.averageWeightKg, displayUnits)} />
            <PreviewStat label="Estimated TDEE" value={`${pending.estimatedTdee} kcal`} />
            <PreviewStat label="Recommended calories" value={`${pending.recommendedCalories} kcal`} />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <PreviewStat label="Protein" value={`${pending.recommendedProteinG} g`} />
            <PreviewStat label="Carbs" value={`${pending.recommendedCarbsG} g`} />
            <PreviewStat label="Fat" value={`${pending.recommendedFatG} g`} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              className="h-9 rounded-2xl bg-emerald-300 px-4 text-sm text-slate-950 hover:bg-emerald-200"
              disabled={!hasEnoughData}
              onClick={() => onAccept(pending)}
            >
              Accept adjustment
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-2xl border-white/12 bg-white/6 px-4 text-sm text-white"
              disabled={!hasEnoughData}
              onClick={() => onSkip(pending)}
            >
              Keep current targets
            </Button>
            <Badge variant="outline" className="rounded-full border-white/10 px-3 py-2 text-slate-300">
              Current targets: {targets.calories} kcal / {targets.proteinG}P / {targets.carbsG}C / {targets.fatG}F
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">History</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Past check-ins</h3>
            </div>
            {checkIns.length > 0 ? (
              <Button
                variant="outline"
                className="h-8 rounded-full border-white/10 bg-white/5 px-3 text-white"
                onClick={onClearCheckIns}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear history
              </Button>
            ) : null}
          </div>
          <div className="mt-5 space-y-3">
            {checkIns.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                No check-ins yet. Once you log enough intake and bodyweight data, accepted or skipped weekly reviews will appear here.
              </div>
            ) : (
              checkIns.map((checkIn) => (
                <div key={checkIn.id} className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">Week ending {format(parseISO(checkIn.weekEnding), "MMM d")}</p>
                      <p className="mt-1 text-sm text-slate-300">{checkIn.message}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`rounded-full px-3 py-1 ${checkIn.status === "accepted" ? "bg-emerald-300 text-slate-950" : "bg-white/10 text-white"}`}>
                        {checkIn.status}
                      </Badge>
                      <Button
                        variant="outline"
                        className="h-8 w-8 rounded-full border-red-400/20 bg-red-400/8 p-0 text-red-200 hover:bg-red-400/12"
                        onClick={() => onDeleteCheckIn(checkIn.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrainingPage({
  selectedDate,
  onSelectedDateChange,
  templates,
  logs,
  onCreateCustomDay,
  onAddCustomExercise,
  onDeleteTrainingDay,
  onToggleExerciseSelection,
  onToggleExerciseCompletion,
  onUpdateNotes,
}: {
  selectedDate: string;
  onSelectedDateChange: (value: string) => void;
  templates: TrainingSessionTemplate[];
  logs: TrainingLogEntry[];
  onCreateCustomDay: (template: TrainingSessionTemplate) => void;
  onAddCustomExercise: (split: TrainingSplit, exercise: TrainingExercise) => void;
  onDeleteTrainingDay: (split: TrainingSplit) => void;
  onToggleExerciseSelection: (date: string, split: TrainingSplit, exerciseId: string) => void;
  onToggleExerciseCompletion: (date: string, split: TrainingSplit, exerciseId: string) => void;
  onUpdateNotes: (date: string, split: TrainingSplit, notes: string) => void;
}) {
  const [activeSplit, setActiveSplit] = useState<TrainingSplit>("push");
  const [createDayOpen, setCreateDayOpen] = useState(false);
  const [newDayTitle, setNewDayTitle] = useState("");
  const [newDayFocus, setNewDayFocus] = useState("");
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [deleteDayDialogOpen, setDeleteDayDialogOpen] = useState(false);
  const [customExerciseDraft, setCustomExerciseDraft] = useState({
    name: "",
    group: "Custom",
    sets: 3,
    reps: "8-12",
  });
  const activeTemplate = templates.find((template) => template.split === activeSplit) ?? templates[0];
  const activeLog = logs.find((log) => log.date === selectedDate && log.split === activeSplit);
  const defaultSelectedExerciseIds = activeTemplate?.exercises
    .filter((exercise) => exercise.defaultSelected)
    .map((exercise) => exercise.id) ?? [];
  const selectedExerciseIds = new Set(
    activeLog ? activeLog.selectedExerciseIds : defaultSelectedExerciseIds,
  );
  const completedExerciseIds = new Set(activeLog?.completedExerciseIds ?? []);
  const selectedExercises = activeTemplate
    ? activeTemplate.exercises.filter((exercise) => selectedExerciseIds.has(exercise.id))
    : [];
  const groupedExercises = activeTemplate?.exercises.reduce<Record<string, typeof activeTemplate.exercises>>(
    (groups, exercise) => {
      if (!groups[exercise.group]) {
        groups[exercise.group] = [];
      }
      groups[exercise.group].push(exercise);
      return groups;
    },
    {},
  ) ?? {};
  const completedCount = selectedExercises.filter((exercise) => completedExerciseIds.has(exercise.id)).length;
  const [exerciseQuery, setExerciseQuery] = useState("");
  const normalizedQuery = exerciseQuery.trim().toLowerCase();
  const filteredExerciseGroups = Object.entries(groupedExercises).reduce<Array<[string, typeof activeTemplate.exercises]>>(
    (groups, [group, exercises]) => {
      const filteredExercises = normalizedQuery
        ? exercises.filter((exercise) => {
            const haystack = `${exercise.name} ${exercise.group} ${exercise.reps}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          })
        : exercises;

      if (filteredExercises.length > 0) {
        groups.push([group, filteredExercises]);
      }

      return groups;
    },
    [],
  );
  const activeTemplateIsCustom = activeTemplate ? !BUILT_IN_TRAINING_SPLITS.has(activeTemplate.split) : false;

  useEffect(() => {
    if (!templates.some((template) => template.split === activeSplit) && templates[0]) {
      setActiveSplit(templates[0].split);
    }
  }, [activeSplit, templates]);

  if (!activeTemplate) {
    return null;
  }

  return (
    <div className="relative space-y-6">
      <PageBackdrop className="opacity-70">
        <Dumbbell className="absolute right-[8%] top-[10%] h-10 w-10 text-emerald-200/6" />
        <Activity className="absolute left-[6%] top-[32%] h-8 w-8 text-sky-200/6" />
        <TrendingUp className="absolute right-[12%] bottom-[14%] h-8 w-8 text-white/5" />
      </PageBackdrop>

      <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/6 p-5 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Training</p>
          <h2 className="mt-2 text-3xl font-semibold text-white">Push, pull, legs</h2>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <Badge variant="outline" className="justify-center rounded-full border-white/10 px-3 py-2 text-slate-300">
            {activeTemplate.exercises.length} exercises in {activeTemplate.title.toLowerCase()}
          </Badge>
          <Input
            className="h-11 w-full rounded-2xl border-white/10 bg-slate-950/45 text-white lg:w-[180px]"
            type="date"
            value={selectedDate}
            onChange={(event) => onSelectedDateChange(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
          <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Exercise library</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">{activeTemplate.title}</h3>
                  <p className="mt-1 text-sm text-slate-300">{activeTemplate.focus}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                    {activeTemplate.exercises.length} total
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                    {selectedExercises.length} selected
                  </Badge>
                  {templates.length > 1 ? (
                    <Dialog open={deleteDayDialogOpen} onOpenChange={setDeleteDayDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-8 w-8 rounded-full border-red-400/20 bg-red-400/8 p-0 text-red-200 hover:bg-red-400/12"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md rounded-[2rem] border-white/10 bg-[#08120f] text-white">
                        <DialogHeader>
                          <DialogTitle className="text-white">Delete this day?</DialogTitle>
                          <DialogDescription className="text-slate-400">
                            This will remove {activeTemplate.title.toLowerCase()} and its saved session history.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                          <Button
                            variant="outline"
                            className="rounded-full border-white/12 bg-white/6 text-white"
                            onClick={() => setDeleteDayDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="rounded-full bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                            onClick={() => {
                              onDeleteTrainingDay(activeTemplate.split);
                              setDeleteDayDialogOpen(false);
                            }}
                          >
                            Confirm
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {templates.map((template) => {
                  const isActive = template.split === activeSplit;
                  const templateLog = logs.find(
                    (log) => log.date === selectedDate && log.split === template.split,
                  );
                  const defaultIds = template.exercises
                    .filter((exercise) => exercise.defaultSelected)
                    .map((exercise) => exercise.id);
                  const activeSelectedIds = new Set(
                    templateLog ? templateLog.selectedExerciseIds : defaultIds,
                  );
                  const doneCount = template.exercises.filter(
                    (exercise) =>
                      activeSelectedIds.has(exercise.id) &&
                      templateLog?.completedExerciseIds.includes(exercise.id),
                  ).length;
                  const selectedCount = template.exercises.filter((exercise) =>
                    activeSelectedIds.has(exercise.id),
                  ).length;

                  return (
                    <button
                      key={template.id}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                        isActive
                          ? "border-emerald-200 bg-emerald-300 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                          : "border-white/8 bg-slate-950/45 text-slate-300 hover:text-white"
                      }`}
                      onClick={() => setActiveSplit(template.split)}
                      type="button"
                    >
                      <span className="font-medium">{template.title}</span>
                      <span className={`ml-2 ${isActive ? "text-slate-800/75" : "text-slate-400"}`}>
                        {doneCount}/{selectedCount}
                      </span>
                    </button>
                  );
                })}
                <Dialog open={createDayOpen} onOpenChange={setCreateDayOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="rounded-full border-white/10 bg-white/5 text-white">
                      <Plus className="h-4 w-4" />
                      New day
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg rounded-[2rem] border-white/10 bg-[#08120f] text-white">
                    <DialogHeader>
                      <DialogTitle className="text-white">Create training day</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Field label="Day name">
                        <Input
                          className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                          value={newDayTitle}
                          onChange={(event) => setNewDayTitle(event.target.value)}
                        />
                      </Field>
                      <Field label="Focus">
                        <Input
                          className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                          value={newDayFocus}
                          onChange={(event) => setNewDayFocus(event.target.value)}
                        />
                      </Field>
                      <Button
                        className="rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                        disabled={!newDayTitle.trim()}
                        onClick={() => {
                          const template: TrainingSessionTemplate = {
                            id: `custom-day-${Date.now()}`,
                            split: `custom-${newDayTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
                            title: newDayTitle.trim(),
                            focus: newDayFocus.trim() || "Custom training day",
                            exercises: [],
                          };
                          onCreateCustomDay(template);
                          setActiveSplit(template.split);
                          setNewDayTitle("");
                          setNewDayFocus("");
                          setCreateDayOpen(false);
                        }}
                      >
                        Create day
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    className="h-11 rounded-2xl border-white/10 bg-slate-950/45 pl-10 text-white"
                    placeholder="Search exercises"
                    value={exerciseQuery}
                    onChange={(event) => setExerciseQuery(event.target.value)}
                  />
                </div>
                {activeTemplateIsCustom ? (
                  <Dialog open={addExerciseOpen} onOpenChange={setAddExerciseOpen}>
                    <DialogTrigger asChild>
                      <Button className="h-11 rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200">
                        <Plus className="h-4 w-4" />
                        Add exercise
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg rounded-[2rem] border-white/10 bg-[#08120f] text-white">
                      <DialogHeader>
                        <DialogTitle className="text-white">Add custom exercise</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Field label="Exercise name">
                          <Input
                            className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                            value={customExerciseDraft.name}
                            onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, name: event.target.value }))}
                          />
                        </Field>
                        <Field label="Group">
                          <Input
                            className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                            value={customExerciseDraft.group}
                            onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, group: event.target.value }))}
                          />
                        </Field>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Sets">
                            <Input
                              className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                              type="number"
                              value={customExerciseDraft.sets}
                              onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, sets: Number(event.target.value) }))}
                            />
                          </Field>
                          <Field label="Reps">
                            <Input
                              className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
                              value={customExerciseDraft.reps}
                              onChange={(event) => setCustomExerciseDraft((current) => ({ ...current, reps: event.target.value }))}
                            />
                          </Field>
                        </div>
                        <Button
                          className="rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200"
                          disabled={!customExerciseDraft.name.trim()}
                          onClick={() => {
                            onAddCustomExercise(activeTemplate.split, {
                              id: `custom-exercise-${Date.now()}`,
                              name: customExerciseDraft.name.trim(),
                              group: customExerciseDraft.group.trim() || "Custom",
                              sets: customExerciseDraft.sets || 3,
                              reps: customExerciseDraft.reps.trim() || "8-12",
                            });
                            setCustomExerciseDraft({
                              name: "",
                              group: "Custom",
                              sets: 3,
                              reps: "8-12",
                            });
                            setAddExerciseOpen(false);
                          }}
                        >
                          Save exercise
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>

              <div className="space-y-5">
                {filteredExerciseGroups.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                    No exercises match that search.
                  </div>
                ) : (
                  filteredExerciseGroups.map(([group, exercises]) => (
                    <div key={group}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">{group}</p>
                        <span className="text-xs text-slate-500">{exercises.length} exercises</span>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {exercises.map((exercise) => {
                          const selected = selectedExerciseIds.has(exercise.id);
                          const completed = completedExerciseIds.has(exercise.id);

                          return (
                            <div
                              key={exercise.id}
                              className={`rounded-[1.5rem] border p-4 transition-colors ${
                                selected
                                  ? "border-emerald-300/25 bg-emerald-300/10"
                                  : "border-white/8 bg-slate-950/45"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-white">{exercise.name}</p>
                                  <p className="mt-2 text-sm text-slate-400">
                                    {exercise.sets} sets x {exercise.reps}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selected ? (
                                    <Button
                                      variant="outline"
                                      className="h-9 w-9 rounded-full border-red-400/20 bg-red-400/8 p-0 text-red-200 hover:bg-red-400/12"
                                      onClick={() => onToggleExerciseSelection(selectedDate, activeSplit, exercise.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      className="h-9 w-9 rounded-full border-emerald-300/25 bg-emerald-300/12 p-0 text-emerald-200 hover:bg-emerald-300/18"
                                      onClick={() => onToggleExerciseSelection(selectedDate, activeSplit, exercise.id)}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {selected ? (
                                    <Button
                                      variant="outline"
                                      className={completed
                                        ? "h-9 w-9 rounded-full border-emerald-300/25 bg-emerald-300/12 p-0 text-emerald-100"
                                        : "h-9 w-9 rounded-full border-white/10 bg-white/5 p-0 text-white"}
                                      onClick={() => onToggleExerciseCompletion(selectedDate, activeSplit, exercise.id)}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
            <CardContent className="space-y-5 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Selected for today</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Today&apos;s session</h3>
                </div>
                <Badge className="self-start rounded-full bg-emerald-300 px-3 py-1 text-slate-950">
                  {completedCount}/{selectedExercises.length || 0} done
                </Badge>
              </div>

              <div className="space-y-3">
                {selectedExercises.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-8 text-sm text-slate-400">
                    Add exercises from the library above to build today&apos;s session.
                  </div>
                ) : (
                  selectedExercises.map((exercise) => {
                    const completed = completedExerciseIds.has(exercise.id);

                    return (
                      <div
                        key={exercise.id}
                        className={`rounded-[1.5rem] border p-4 ${
                          completed
                            ? "border-emerald-300/25 bg-emerald-300/10"
                            : "border-white/8 bg-slate-950/45"
                        }`}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">{exercise.name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                              {exercise.group}
                            </p>
                            <p className="mt-2 text-sm text-slate-400">
                              {exercise.sets} sets x {exercise.reps} reps
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              className="h-9 w-9 rounded-full border-red-400/20 bg-red-400/8 p-0 text-red-200 hover:bg-red-400/12"
                              onClick={() => onToggleExerciseSelection(selectedDate, activeSplit, exercise.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              className={completed
                                ? "h-9 w-9 rounded-full border-emerald-300/25 bg-emerald-300/12 p-0 text-emerald-100"
                                : "h-9 w-9 rounded-full border-white/10 bg-white/5 p-0 text-white"}
                              onClick={() => onToggleExerciseCompletion(selectedDate, activeSplit, exercise.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4">
                <label className="mb-2 block text-sm text-slate-300">Session notes</label>
                <Textarea
                  className="min-h-24 rounded-2xl border-white/10 bg-white/5 text-white"
                  placeholder="Add notes about load, reps, or how the session felt."
                  value={activeLog?.notes ?? ""}
                  onChange={(event) => onUpdateNotes(selectedDate, activeSplit, event.target.value)}
                />
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-2 block text-sm text-slate-300">{label}</label>
      {children}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
      <CardContent className="flex items-start gap-4 p-5">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/8 text-emerald-200">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-sm text-slate-300">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function InlinePreviewStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-white/8 bg-slate-950/45 px-4 py-3">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-white/10 bg-white/6 backdrop-blur-xl">
      <CardContent className="px-4 py-6 sm:px-5">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{subtitle}</p>
        <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
        <div className="mt-6 h-80">{children}</div>
      </CardContent>
    </Card>
  );
}

function FoodPickerDialog({
  foods,
  searchValue,
  onSearch,
  onCreateFood,
  onAdd,
}: {
  foods: Food[];
  searchValue: string;
  onSearch: (value: string) => void;
  onCreateFood: () => void;
  onAdd: (food: Food, servings: number, mealType: MealType) => void;
}) {
  const [mealType, setMealType] = useState<MealType>("lunch");
  const [servings, setServings] = useState(1);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-white">Quick add food</DialogTitle>
        <DialogDescription className="text-slate-400">
          Search foods or add a new item if it is not already in the library.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 md:grid-cols-[1fr_180px_140px]">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
          <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 pl-10 text-white" placeholder="Search foods or recipes" onChange={(event) => onSearch(event.target.value)} />
        </div>
        <Select value={mealType} onValueChange={(value) => setMealType(value as MealType)}>
          <SelectTrigger className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="breakfast">Breakfast</SelectItem>
            <SelectItem value="lunch">Lunch</SelectItem>
            <SelectItem value="dinner">Dinner</SelectItem>
            <SelectItem value="snack">Snack</SelectItem>
          </SelectContent>
        </Select>
        <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" min="0.25" step="0.25" value={servings} onChange={(event) => setServings(Number(event.target.value))} />
      </div>

      <div className="grid max-h-[420px] gap-3 overflow-y-auto pr-2">
        {foods.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-white/10 px-4 py-8 text-center">
            <p className="text-sm text-slate-300">
              No foods found for <span className="font-medium text-white">{searchValue || "this search"}</span>.
            </p>
            <Button className="mt-4 rounded-full bg-emerald-300 text-slate-950 hover:bg-emerald-200" onClick={onCreateFood}>
              Add this food
            </Button>
          </div>
        ) : (
          foods.map((food) => (
            <button
              key={`${food.source}-${food.id}`}
              className="rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4 text-left transition-colors hover:border-emerald-300/25 hover:bg-emerald-300/6"
              onClick={() => onAdd(food, servings, mealType)}
              type="button"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">{food.name}</p>
                  <p className="text-xs text-slate-400">
                    {food.servingLabel} • {food.proteinG}P / {food.carbsG}C / {food.fatG}F
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full border-white/10 px-3 py-1 text-slate-300">
                  {food.calories} kcal
                </Badge>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function CustomFoodDialog({
  initialName = "",
  onSave,
}: {
  initialName?: string;
  onSave: (food: Food) => void;
}) {
  const [draft, setDraft] = useState({
    name: initialName,
    brand: "",
    servingLabel: "1 serving",
    calories: 100,
    proteinG: 10,
    carbsG: 10,
    fatG: 4,
    fiberG: 2,
    sugarG: 4,
    sodiumMg: 120,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-white">Create custom food</DialogTitle>
        <DialogDescription className="text-slate-400">
          This saves into your account so you can use it again on any device you sign into.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name">
          <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        </Field>
        <Field label="Brand">
          <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" value={draft.brand} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} />
        </Field>
        <Field label="Serving label">
          <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" value={draft.servingLabel} onChange={(event) => setDraft((current) => ({ ...current, servingLabel: event.target.value }))} />
        </Field>
        <Field label="Calories">
          <Input className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white" type="number" value={draft.calories} onChange={(event) => setDraft((current) => ({ ...current, calories: Number(event.target.value) }))} />
        </Field>
        {(["proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg"] as const).map((key) => (
          <Field key={key} label={key}>
            <Input
              className="h-11 rounded-2xl border-white/10 bg-slate-950/45 text-white"
              type="number"
              value={draft[key]}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))}
            />
          </Field>
        ))}
      </div>
      <Button
        className="mt-4 h-10 rounded-2xl bg-emerald-300 text-slate-950 hover:bg-emerald-200"
        onClick={() =>
          onSave({
            id: `custom-${Date.now()}`,
            source: "custom",
            ...draft,
          })
        }
      >
        Save custom food
      </Button>
    </>
  );
}

function Router() {
  const [appState, setAppState] = useState<MacrolyticsState>(createInitialState);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [location, setLocation] = useLocation();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrateForUser = async (userId: string, email: string) => {
      setDataReady(false);
      setBootstrapError(null);

      try {
        const [
          { data: rawProfileRow, error: profileError },
          { data: rawUserDataRow, error: userDataError },
        ] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
            supabase.from("user_data").select("*").eq("user_id", userId).maybeSingle(),
          ]);

        if (profileError) {
          throw profileError;
        }

        if (userDataError) {
          throw userDataError;
        }

        const profileRow = rawProfileRow as ProfileRow | null;
        const userDataRow = rawUserDataRow as UserDataRow | null;
        const migratedState = buildMigratedState(email);
        const hasRemoteData = Boolean(profileRow || userDataRow);
        const profile = profileRow ? profileFromRow(profileRow) : migratedState.profile;
        const weights = userDataRow?.weights?.length ? userDataRow.weights : migratedState.weights;
        const normalizedState = normalizeLegacyProfileState(profile, weights);

        const nextState: MacrolyticsState = {
          session: sessionFromEmail(email),
          profile: normalizedState.profile,
          targets: userDataRow?.targets ?? calculateTargets(normalizedState.profile),
          entries: userDataRow?.entries ?? (hasRemoteData ? [] : migratedState.entries),
          weights: normalizedState.weights,
          customFoods: mergeUniqueFoods(userDataRow?.custom_foods ?? [], hasRemoteData ? [] : migratedState.customFoods),
          recipes: userDataRow?.recipes?.length ? userDataRow.recipes : starterRecipes,
          checkIns: userDataRow?.check_ins ?? (hasRemoteData ? [] : migratedState.checkIns),
          trainingTemplates: normalizeTrainingTemplates(
            userDataRow?.training_templates,
            userDataRow?.hidden_training_splits,
          ),
          trainingLogs:
            userDataRow?.training_logs?.map((log) => ({
              ...log,
              selectedExerciseIds: log.selectedExerciseIds ?? [],
            })) ?? (hasRemoteData ? [] : migratedState.trainingLogs),
          hiddenTrainingSplits:
            userDataRow?.hidden_training_splits ?? (hasRemoteData ? [] : migratedState.hiddenTrainingSplits),
        };

        if (cancelled) {
          return;
        }

        setCurrentUserId(userId);
        setAppState(nextState);
        setDataReady(true);

        if (!hasRemoteData) {
          await persistRemoteState(userId, email, nextState);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Supabase bootstrap failed. Make sure the database schema is installed.";
        setBootstrapError(message);
        setDataReady(true);
      }
    };

    const initialize = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (error) {
        setBootstrapError(error.message);
        setAuthReady(true);
        setDataReady(true);
        return;
      }

      const user = data.session?.user;

      if (!user || !user.email) {
        setCurrentUserId(null);
        setAppState(createInitialState());
        setAuthReady(true);
        setDataReady(true);
        return;
      }

      setAuthReady(true);
      await hydrateForUser(user.id, user.email);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      if (!user || !user.email) {
        setCurrentUserId(null);
        setAppState(createInitialState());
        setAuthError(null);
        setAuthMessage(null);
        setDataReady(true);
        setAuthReady(true);
        return;
      }

      setAuthError(null);
      setAuthMessage(null);
      setAuthReady(true);
      void hydrateForUser(user.id, user.email);
    });

    void initialize();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady || !dataReady || !appState.session || !currentUserId || bootstrapError) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistRemoteState(currentUserId, appState.session!.email, appState).catch((error) => {
        setBootstrapError(error instanceof Error ? error.message : "Failed to save your data to Supabase.");
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [appState, authReady, bootstrapError, currentUserId, dataReady]);

  useEffect(() => {
    if (appState.session && !appState.profile.onboardingComplete && location !== "/onboarding") {
      setLocation("/onboarding");
    }
    if (!appState.session && (location.startsWith("/app") || location === "/onboarding")) {
      setLocation("/login");
    }
    if (appState.session && appState.profile.onboardingComplete && location === "/") {
      setLocation("/app");
    }
    if (
      appState.session &&
      appState.profile.onboardingComplete &&
      (location === "/login" || location === "/signup")
    ) {
      setLocation("/app");
    }
  }, [appState.profile.onboardingComplete, appState.session, authReady, dataReady, location, setLocation]);

  const allFoods = Array.from(
    new Map([...seedFoods, ...appState.customFoods].map((food) => [food.id, food])).values(),
  );

  const addEntry = (food: Food, servings: number, mealType: MealType, date: string) => {
    const entry: FoodLogEntry = {
      id: `entry-${Date.now()}`,
      date,
      mealType,
      name: food.name,
      brand: food.brand,
      servingLabel: food.servingLabel,
      servings,
      calories: Math.round(food.calories * servings),
      proteinG: Number((food.proteinG * servings).toFixed(1)),
      carbsG: Number((food.carbsG * servings).toFixed(1)),
      fatG: Number((food.fatG * servings).toFixed(1)),
      fiberG: Number((food.fiberG * servings).toFixed(1)),
      sugarG: Number((food.sugarG * servings).toFixed(1)),
      sodiumMg: Math.round(food.sodiumMg * servings),
      source: food.source,
    };

    setAppState((current) => ({
      ...current,
      entries: [entry, ...current.entries],
    }));
  };

  const updateServings = (id: string, servings: number) => {
    if (!Number.isFinite(servings) || servings <= 0) {
      return;
    }

    setAppState((current) => ({
      ...current,
      entries: current.entries.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }

        const ratio = servings / entry.servings;
        return {
          ...entry,
          servings,
          calories: Math.round(entry.calories * ratio),
          proteinG: Number((entry.proteinG * ratio).toFixed(1)),
          carbsG: Number((entry.carbsG * ratio).toFixed(1)),
          fatG: Number((entry.fatG * ratio).toFixed(1)),
          fiberG: Number((entry.fiberG * ratio).toFixed(1)),
          sugarG: Number((entry.sugarG * ratio).toFixed(1)),
          sodiumMg: Math.round(entry.sodiumMg * ratio),
        };
      }),
    }));
  };

  const duplicateEntry = (id: string) => {
    setAppState((current) => {
      const match = current.entries.find((entry) => entry.id === id);
      if (!match) {
        return current;
      }

      return {
        ...current,
        entries: [{ ...match, id: `entry-${Date.now()}` }, ...current.entries],
      };
    });
  };

  const deleteEntry = (id: string) => {
    setAppState((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.id !== id),
    }));
  };

  const clearEntriesForDate = (date: string) => {
    setAppState((current) => ({
      ...current,
      entries: current.entries.filter((entry) => entry.date !== date),
    }));
  };

  const copyPreviousDay = (date: string) => {
    const previous = format(subDays(parseISO(date), 1), "yyyy-MM-dd");
    setAppState((current) => {
      const matches = current.entries.filter((entry) => entry.date === previous);
      if (matches.length === 0) {
        return current;
      }

      const copied = matches.map((entry, index) => ({
        ...entry,
        id: `entry-copy-${Date.now()}-${index}`,
        date,
      }));

      return {
        ...current,
        entries: [...copied, ...current.entries],
      };
    });
  };

  const addWeight = (weightDisplay: number, note: string) => {
    setAppState((current) => ({
      ...current,
      profile: {
        ...current.profile,
        currentWeightKg: toKg(weightDisplay, current.profile.displayUnits),
      },
      weights: [
        ...current.weights.filter((entry) => entry.date !== selectedDate),
        {
          id: `weight-${Date.now()}`,
          date: selectedDate,
          weightKg: toKg(weightDisplay, current.profile.displayUnits),
          note,
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  };

  const saveProfile = (profile: UserProfile) => {
    setAppState((current) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const nextWeights = [
        ...current.weights.filter((entry) => entry.date !== today),
        {
          id: `weight-profile-${Date.now()}`,
          date: today,
          weightKg: profile.currentWeightKg,
          note: "Profile update",
        },
      ].sort((a, b) => a.date.localeCompare(b.date));

      return {
        ...current,
        profile: {
          ...profile,
          onboardingComplete: true,
        },
        targets: calculateTargets(profile),
        weights: nextWeights,
      };
    });
  };

  const acceptCheckIn = (checkIn: CheckIn) => {
    setAppState((current) => ({
      ...current,
      targets: {
        ...current.targets,
        calories: checkIn.recommendedCalories,
        proteinG: checkIn.recommendedProteinG,
        carbsG: checkIn.recommendedCarbsG,
        fatG: checkIn.recommendedFatG,
      },
      checkIns: [{ ...checkIn, status: "accepted" }, ...current.checkIns],
    }));
  };

  const skipCheckIn = (checkIn: CheckIn) => {
    setAppState((current) => ({
      ...current,
      checkIns: [{ ...checkIn, status: "skipped" }, ...current.checkIns],
    }));
  };

  const deleteCheckIn = (id: string) => {
    setAppState((current) => ({
      ...current,
      checkIns: current.checkIns.filter((checkIn) => checkIn.id !== id),
    }));
  };

  const clearCheckIns = () => {
    setAppState((current) => ({
      ...current,
      checkIns: [],
    }));
  };

  const signOut = async () => {
    setBootstrapError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setBootstrapError(error.message);
    }
  };

  const handleAuth = async (email: string, password: string, mode: "login" | "signup") => {
    setIsAuthSubmitting(true);
    setAuthError(null);
    setAuthMessage(null);
    setBootstrapError(null);

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (!data.session) {
        setAuthMessage("Check your email to confirm your account, then log in.");
        setLocation("/login");
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const addCustomFood = (food: Food) => {
    setAppState((current) => ({
      ...current,
      customFoods: [food, ...current.customFoods.filter((item) => item.id !== food.id)],
    }));
  };

  const createCustomTrainingDay = (template: TrainingSessionTemplate) => {
    setAppState((current) => ({
      ...current,
      trainingTemplates: [...current.trainingTemplates, template],
    }));
  };

  const addCustomTrainingExercise = (split: TrainingSplit, exercise: TrainingExercise) => {
    setAppState((current) => ({
      ...current,
      trainingTemplates: current.trainingTemplates.map((template) =>
        template.split === split
          ? {
              ...template,
              exercises: [...template.exercises, exercise],
            }
          : template,
      ),
    }));
  };

  const deleteTrainingDay = (split: TrainingSplit) => {
    setAppState((current) => ({
      ...current,
      trainingTemplates: current.trainingTemplates.filter((template) => template.split !== split),
      trainingLogs: current.trainingLogs.filter((log) => log.split !== split),
      hiddenTrainingSplits: BUILT_IN_TRAINING_SPLITS.has(split)
        ? Array.from(new Set([...current.hiddenTrainingSplits, split]))
        : current.hiddenTrainingSplits,
    }));
  };

  const toggleTrainingExerciseSelection = (date: string, split: TrainingSplit, exerciseId: string) => {
    setAppState((current) => {
      const template = current.trainingTemplates.find((item) => item.split === split);
      const defaultSelectedExerciseIds = template?.exercises
        .filter((exercise) => exercise.defaultSelected)
        .map((exercise) => exercise.id) ?? [];
      const existingLog = current.trainingLogs.find((log) => log.date === date && log.split === split);

      if (!existingLog) {
        return {
          ...current,
          trainingLogs: [
            ...current.trainingLogs,
            {
              id: `training-log-${date}-${split}`,
              date,
              split,
              selectedExerciseIds: defaultSelectedExerciseIds.includes(exerciseId)
                ? defaultSelectedExerciseIds.filter((id) => id !== exerciseId)
                : [...defaultSelectedExerciseIds, exerciseId],
              completedExerciseIds: [],
              notes: "",
            },
          ],
        };
      }

      const selectedExerciseIds = existingLog.selectedExerciseIds.includes(exerciseId)
        ? existingLog.selectedExerciseIds.filter((id) => id !== exerciseId)
        : [...existingLog.selectedExerciseIds, exerciseId];
      const completedExerciseIds = existingLog.completedExerciseIds.filter((id) =>
        selectedExerciseIds.includes(id),
      );

      return {
        ...current,
        trainingLogs: current.trainingLogs.map((log) =>
          log.id === existingLog.id
            ? {
                ...log,
                selectedExerciseIds,
                completedExerciseIds,
              }
            : log,
        ),
      };
    });
  };

  const toggleTrainingExerciseCompletion = (date: string, split: TrainingSplit, exerciseId: string) => {
    setAppState((current) => {
      const template = current.trainingTemplates.find((item) => item.split === split);
      const defaultSelectedExerciseIds = template?.exercises
        .filter((exercise) => exercise.defaultSelected)
        .map((exercise) => exercise.id) ?? [];
      const existingLog = current.trainingLogs.find((log) => log.date === date && log.split === split);

      if (!existingLog) {
        return {
          ...current,
          trainingLogs: [
            ...current.trainingLogs,
            {
              id: `training-log-${date}-${split}`,
              date,
              split,
              selectedExerciseIds: defaultSelectedExerciseIds.includes(exerciseId)
                ? defaultSelectedExerciseIds
                : [...defaultSelectedExerciseIds, exerciseId],
              completedExerciseIds: [exerciseId],
              notes: "",
            },
          ],
        };
      }

      const selectedExerciseIds = existingLog.selectedExerciseIds.includes(exerciseId)
        ? existingLog.selectedExerciseIds
        : [...existingLog.selectedExerciseIds, exerciseId];
      const completedExerciseIds = existingLog.completedExerciseIds.includes(exerciseId)
        ? existingLog.completedExerciseIds.filter((id) => id !== exerciseId)
        : [...existingLog.completedExerciseIds, exerciseId];

      return {
        ...current,
        trainingLogs: current.trainingLogs.map((log) =>
          log.id === existingLog.id
            ? {
                ...log,
                selectedExerciseIds,
                completedExerciseIds,
              }
            : log,
        ),
      };
    });
  };

  const updateTrainingNotes = (date: string, split: TrainingSplit, notes: string) => {
    setAppState((current) => {
      const template = current.trainingTemplates.find((item) => item.split === split);
      const defaultSelectedExerciseIds = template?.exercises
        .filter((exercise) => exercise.defaultSelected)
        .map((exercise) => exercise.id) ?? [];
      const existingLog = current.trainingLogs.find((log) => log.date === date && log.split === split);

      if (!existingLog) {
        return {
          ...current,
          trainingLogs: [
            ...current.trainingLogs,
            {
              id: `training-log-${date}-${split}`,
              date,
              split,
              selectedExerciseIds: defaultSelectedExerciseIds,
              completedExerciseIds: [],
              notes,
            },
          ],
        };
      }

      return {
        ...current,
        trainingLogs: current.trainingLogs.map((log) =>
          log.id === existingLog.id
            ? {
                ...log,
                notes,
              }
            : log,
        ),
      };
    });
  };

  const protectedPaths = ["/app", "/app/log", "/app/analytics", "/app/check-in", "/app/training", "/app/profile"];
  const activePath = protectedPaths.includes(location) ? location : "/app";

  const appView = (content: React.ReactNode) =>
    appState.session ? (
      <AppShell session={appState.session} profile={appState.profile} activePath={activePath} onSignOut={signOut}>
        {content}
      </AppShell>
    ) : null;

  if (!authReady || (appState.session && !dataReady)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-lg border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-8 text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/70">Macrolytics</p>
            <h1 className="mt-3 text-2xl font-semibold text-white">Loading your workspace</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Pulling your profile, logs, and training data from Supabase.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (appState.session && bootstrapError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-2xl border-white/10 bg-white/6 backdrop-blur-xl">
          <CardContent className="p-8">
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">Supabase setup</p>
            <h1 className="mt-3 text-2xl font-semibold text-white">Database schema is not ready</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Macrolytics can sign you in, but it could not load or save your account data yet.
              Run the SQL in <span className="font-medium text-white">supabase/schema.sql</span> inside
              the Supabase SQL editor, then refresh this page.
            </p>
            <div className="mt-5 rounded-[1.5rem] border border-white/8 bg-slate-950/45 p-4 text-sm text-slate-300">
              {bootstrapError}
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <Switch>
      <Route path="/">
        <LandingPage
          onGoLogin={() => setLocation("/login")}
          onGoSignup={() => setLocation("/signup")}
          onGoAbout={() => setLocation("/about")}
        />
      </Route>
      <Route path="/about">
        <AboutPage onBackHome={() => setLocation("/")} />
      </Route>
      <Route path="/login">
        <AuthPage
          mode="login"
          onSubmit={handleAuth}
          authError={authError}
          authMessage={authMessage}
          isSubmitting={isAuthSubmitting}
        />
      </Route>
      <Route path="/signup">
        <AuthPage
          mode="signup"
          onSubmit={handleAuth}
          authError={authError}
          authMessage={authMessage}
          isSubmitting={isAuthSubmitting}
        />
      </Route>
      <Route path="/onboarding">
        {appState.session ? (
          <OnboardingPage
            initialProfile={appState.profile}
            onComplete={(profile) => {
              setAppState((current) => createUserState({ ...profile, onboardingComplete: true }, current.session));
              setLocation("/app");
            }}
          />
        ) : null}
      </Route>
      <Route path="/app">
        {appView(
          <DashboardPage
            profile={appState.profile}
            targets={appState.targets}
            entries={appState.entries}
            weights={appState.weights}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onAddWeight={addWeight}
            onDeleteEntry={deleteEntry}
            onClearEntries={clearEntriesForDate}
          />,
        )}
      </Route>
      <Route path="/app/log">
        {appView(
          <FoodLogPage
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            foods={allFoods}
            recipes={appState.recipes}
            entries={appState.entries}
            onAddEntry={addEntry}
            onUpdateServings={updateServings}
            onDuplicateEntry={duplicateEntry}
            onDeleteEntry={deleteEntry}
            onCopyPreviousDay={copyPreviousDay}
            onAddCustomFood={addCustomFood}
          />,
        )}
      </Route>
      <Route path="/app/analytics">
        {appView(
          <AnalyticsPage
            profile={appState.profile}
            targets={appState.targets}
            entries={appState.entries}
            weights={appState.weights}
          />,
        )}
      </Route>
      <Route path="/app/check-in">
        {appView(
          <CheckInPage
            profile={appState.profile}
            entries={appState.entries}
            weights={appState.weights}
            targets={appState.targets}
            checkIns={appState.checkIns}
            onAccept={acceptCheckIn}
            onSkip={skipCheckIn}
            onDeleteCheckIn={deleteCheckIn}
            onClearCheckIns={clearCheckIns}
          />,
        )}
      </Route>
      <Route path="/app/training">
        {appView(
          <TrainingPage
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            templates={appState.trainingTemplates}
            logs={appState.trainingLogs}
            onCreateCustomDay={createCustomTrainingDay}
            onAddCustomExercise={addCustomTrainingExercise}
            onDeleteTrainingDay={deleteTrainingDay}
            onToggleExerciseSelection={toggleTrainingExerciseSelection}
            onToggleExerciseCompletion={toggleTrainingExerciseCompletion}
            onUpdateNotes={updateTrainingNotes}
          />,
        )}
      </Route>
      <Route path="/app/profile">
        {appView(
          <ProfilePage
            profile={appState.profile}
            targets={appState.targets}
            onSignOut={signOut}
            onSave={saveProfile}
          />,
        )}
      </Route>
      <Route path="/:rest*">
        <NotFound />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
