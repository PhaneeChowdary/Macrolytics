import { differenceInCalendarDays, format, isSameDay, parseISO, subDays } from "date-fns";

export type GoalType = "cut" | "maintain" | "bulk";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";
export type Sex = "male" | "female";
export type Units = "metric" | "imperial";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodSource = "seed" | "custom" | "recipe";
export type TrainingSplit = string;

export interface Session {
  email: string;
  mode: "demo" | "email";
}

export interface UserProfile {
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  currentWeightKg: number;
  goalWeightKg: number;
  goalType: GoalType;
  activityLevel: ActivityLevel;
  trainingFrequency: number;
  units: Units;
  displayUnits: Units;
  dietPreference: string;
  onboardingComplete: boolean;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  bmr: number;
  tdee: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  servingLabel: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  source: FoodSource;
}

export interface RecipeIngredient {
  foodId: string;
  servings: number;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  notes?: string;
}

export interface FoodLogEntry {
  id: string;
  date: string;
  mealType: MealType;
  name: string;
  brand?: string;
  servings: number;
  servingLabel: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  source: FoodSource;
}

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  note?: string;
}

export interface CheckIn {
  id: string;
  weekEnding: string;
  adherence: number;
  averageCalories: number;
  averageWeightKg: number;
  trendChangeKg: number;
  estimatedTdee: number;
  recommendedCalories: number;
  recommendedProteinG: number;
  recommendedCarbsG: number;
  recommendedFatG: number;
  message: string;
  status: "pending" | "accepted" | "skipped";
}

export interface TrainingExercise {
  id: string;
  name: string;
  group: string;
  sets: number;
  reps: string;
  defaultSelected?: boolean;
}

export interface TrainingSessionTemplate {
  id: string;
  split: TrainingSplit;
  title: string;
  focus: string;
  exercises: TrainingExercise[];
}

export interface TrainingLogEntry {
  id: string;
  date: string;
  split: TrainingSplit;
  selectedExerciseIds: string[];
  completedExerciseIds: string[];
  notes: string;
}

export interface DailyTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function toKg(weight: number, units: Units) {
  return units === "imperial" ? weight * 0.453592 : weight;
}

export function toDisplayWeight(weightKg: number, units: Units) {
  return units === "imperial" ? weightKg * 2.20462 : weightKg;
}

export function formatWeight(weightKg: number, units: Units) {
  const value = toDisplayWeight(weightKg, units);
  return `${value.toFixed(1)} ${units === "imperial" ? "lb" : "kg"}`;
}

export function formatHeight(heightCm: number, units: Units) {
  if (units === "imperial") {
    return `${(heightCm / 2.54).toFixed(1)} in`;
  }

  return `${Number(heightCm.toFixed(1))} cm`;
}

export function calculateBmr(profile: UserProfile) {
  const weightKg = profile.currentWeightKg;
  const heightCm = profile.heightCm;
  const age = profile.age;
  const sexConstant = profile.sex === "male" ? 5 : -161;
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant);
}

export function calculateTargets(profile: UserProfile): MacroTargets {
  const bmr = calculateBmr(profile);
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[profile.activityLevel]);

  const calorieDelta =
    profile.goalType === "cut"
      ? -400
      : profile.goalType === "bulk"
        ? 250
        : 0;

  const calories = tdee + calorieDelta;
  const proteinPerKg = profile.goalType === "cut" ? 2.1 : 1.8;
  const proteinG = Math.round(profile.currentWeightKg * proteinPerKg);
  const fatRatio = profile.goalType === "bulk" ? 0.24 : 0.27;
  const fatG = Math.round((calories * fatRatio) / 9);
  const carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);

  return {
    calories,
    proteinG,
    carbsG,
    fatG,
    bmr,
    tdee,
  };
}

export function totalsForDate(entries: FoodLogEntry[], date: string): DailyTotals {
  return entries
    .filter((entry) => entry.date === date)
    .reduce<DailyTotals>(
      (totals, entry) => ({
        calories: totals.calories + entry.calories,
        proteinG: totals.proteinG + entry.proteinG,
        carbsG: totals.carbsG + entry.carbsG,
        fatG: totals.fatG + entry.fatG,
        fiberG: totals.fiberG + entry.fiberG,
        sugarG: totals.sugarG + entry.sugarG,
        sodiumMg: totals.sodiumMg + entry.sodiumMg,
      }),
      {
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        sugarG: 0,
        sodiumMg: 0,
      },
    );
}

// Days without a food log are unknown, not 0 kcal, so averages use logged days only.
export function loggedDates(entries: FoodLogEntry[], days = 7) {
  const today = new Date();
  const dates = new Set(entries.map((entry) => entry.date));
  return Array.from({ length: days }, (_, index) => format(subDays(today, index), "yyyy-MM-dd")).filter((date) =>
    dates.has(date),
  );
}

export function adherenceScore(entries: FoodLogEntry[], targets: MacroTargets, days = 7) {
  const dates = loggedDates(entries, days);
  if (dates.length === 0) {
    return 0;
  }

  const scores = dates.map((date) => {
    const totals = totalsForDate(entries, date);
    const calorieDelta = Math.abs(totals.calories - targets.calories);
    const proteinDelta = Math.abs(totals.proteinG - targets.proteinG) * 4;
    const rawScore = 100 - Math.min(100, calorieDelta / 12 + proteinDelta / 10);
    return Math.max(38, Math.round(rawScore));
  });

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function averageCalories(entries: FoodLogEntry[], days = 7) {
  const dates = loggedDates(entries, days);
  if (dates.length === 0) {
    return 0;
  }

  const total = dates.reduce((sum, date) => sum + totalsForDate(entries, date).calories, 0);
  return Math.round(total / dates.length);
}

function recentWeights(weights: WeightEntry[], days: number) {
  const start = subDays(new Date(), days - 1);
  start.setHours(0, 0, 0, 0);
  return weights
    .filter((entry) => parseISO(entry.date) >= start)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function averageWeight(weights: WeightEntry[], days = 7) {
  const recent = recentWeights(weights, days).map((entry) => entry.weightKg);

  if (recent.length === 0) {
    return 0;
  }

  return Number((recent.reduce((sum, value) => sum + value, 0) / recent.length).toFixed(2));
}

// Weight change per week, from the first and last weigh-ins in the window.
export function weightTrendChange(weights: WeightEntry[], days = 7) {
  const recent = recentWeights(weights, days);
  if (recent.length < 2) {
    return 0;
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanDays = differenceInCalendarDays(parseISO(last.date), parseISO(first.date));
  if (spanDays < 1) {
    return 0;
  }

  return Number((((last.weightKg - first.weightKg) / spanDays) * 7).toFixed(2));
}

export function buildCheckIn(
  profile: UserProfile,
  entries: FoodLogEntry[],
  weights: WeightEntry[],
): CheckIn {
  const currentTargets = calculateTargets(profile);
  const hasEnoughData = loggedDates(entries, 7).length >= 3 && recentWeights(weights, 7).length >= 2;
  const averageIntake = averageCalories(entries, 7);
  const trendChangeKg = weightTrendChange(weights, 7);
  const rawEstimatedTdee = hasEnoughData
    ? Math.round(averageIntake - (trendChangeKg * 7700) / 7)
    : currentTargets.tdee;
  const estimatedTdee = Math.min(5000, Math.max(1200, rawEstimatedTdee));

  const rawRecommendedCalories =
    profile.goalType === "cut"
      ? estimatedTdee - 350
      : profile.goalType === "bulk"
        ? estimatedTdee + 225
        : estimatedTdee;
  const recommendedCalories = Math.min(5200, Math.max(1200, rawRecommendedCalories));

  const recommendedProteinG = Math.round(profile.currentWeightKg * (profile.goalType === "cut" ? 2.1 : 1.8));
  const recommendedFatG = Math.max(35, Math.round((recommendedCalories * 0.27) / 9));
  const recommendedCarbsG = Math.max(
    0,
    Math.round(
      (recommendedCalories - recommendedProteinG * 4 - recommendedFatG * 9) / 4,
    ),
  );

  const message = !hasEnoughData
    ? "Log a few days of intake and bodyweight to unlock weekly check-ins based on your own data."
    : trendChangeKg < -0.5
      ? "You are losing faster than planned. A modest calorie increase would keep performance steadier."
      : trendChangeKg > 0.2 && profile.goalType === "cut"
        ? "The cut is stalling. Tighten calories slightly and keep protein stable."
        : "The current pace looks controlled. Keep adherence high and review again next week.";

  return {
    id: "pending-check-in",
    weekEnding: format(new Date(), "yyyy-MM-dd"),
    adherence: hasEnoughData ? adherenceScore(entries, currentTargets, 7) : 0,
    averageCalories: averageIntake,
    averageWeightKg: hasEnoughData ? averageWeight(weights, 7) : profile.currentWeightKg,
    trendChangeKg: hasEnoughData ? trendChangeKg : 0,
    estimatedTdee,
    recommendedCalories,
    recommendedProteinG,
    recommendedCarbsG,
    recommendedFatG,
    message,
    status: "pending",
  };
}

export function foodFromRecipe(recipe: Recipe, foods: Food[]): Food {
  const totals = recipe.ingredients.reduce(
    (acc, ingredient) => {
      const food = foods.find((item) => item.id === ingredient.foodId);
      if (!food) {
        return acc;
      }

      return {
        calories: acc.calories + food.calories * ingredient.servings,
        proteinG: acc.proteinG + food.proteinG * ingredient.servings,
        carbsG: acc.carbsG + food.carbsG * ingredient.servings,
        fatG: acc.fatG + food.fatG * ingredient.servings,
        fiberG: acc.fiberG + food.fiberG * ingredient.servings,
        sugarG: acc.sugarG + food.sugarG * ingredient.servings,
        sodiumMg: acc.sodiumMg + food.sodiumMg * ingredient.servings,
      };
    },
    {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    },
  );

  return {
    id: recipe.id,
    name: recipe.name,
    servingLabel: `1 of ${recipe.servings} servings`,
    source: "recipe",
    calories: Math.round(totals.calories / recipe.servings),
    proteinG: Math.round(totals.proteinG / recipe.servings),
    carbsG: Math.round(totals.carbsG / recipe.servings),
    fatG: Math.round(totals.fatG / recipe.servings),
    fiberG: Math.round(totals.fiberG / recipe.servings),
    sugarG: Math.round(totals.sugarG / recipe.servings),
    sodiumMg: Math.round(totals.sodiumMg / recipe.servings),
  };
}

export function chartSeries(entries: FoodLogEntry[], days = 10) {
  const today = new Date();

  return Array.from({ length: days }, (_, index) => {
    const date = format(subDays(today, days - index - 1), "yyyy-MM-dd");
    const totals = totalsForDate(entries, date);
    return {
      date,
      label: format(parseISO(date), "MMM d"),
      calories: totals.calories,
      protein: totals.proteinG,
      carbs: totals.carbsG,
      fat: totals.fatG,
    };
  });
}

export function weightSeries(weights: WeightEntry[], days = 10) {
  const today = new Date();

  return Array.from({ length: days }, (_, index) => {
    const date = subDays(today, days - index - 1);
    const exact = weights.find((entry) => isSameDay(parseISO(entry.date), date));
    return {
      date: format(date, "yyyy-MM-dd"),
      label: format(date, "MMM d"),
      weightKg: exact?.weightKg ?? null,
    };
  });
}
