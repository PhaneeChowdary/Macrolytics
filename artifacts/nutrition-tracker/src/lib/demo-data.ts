import { format, subDays } from "date-fns";
import {
  calculateTargets,
  foodFromRecipe,
  type Food,
  type FoodLogEntry,
  type Recipe,
  type Session,
  type TrainingSessionTemplate,
  type UserProfile,
  type WeightEntry,
} from "./nutrition";

export const defaultProfile: UserProfile = {
  name: "Jordan",
  age: 31,
  sex: "male",
  heightCm: 178,
  currentWeightKg: 80.3,
  goalWeightKg: 76,
  goalType: "cut",
  activityLevel: "moderate",
  trainingFrequency: 4,
  units: "imperial",
  displayUnits: "imperial",
  dietPreference: "High-protein, simple prep",
  onboardingComplete: true,
};

export const demoSession: Session = {
  email: "demo@macrolytics.app",
  mode: "demo",
};

export const seedFoods: Food[] = [
  { id: "chicken-breast", name: "Chicken breast", servingLabel: "100 g cooked", calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, fiberG: 0, sugarG: 0, sodiumMg: 74, source: "seed" },
  { id: "eggs", name: "Eggs", servingLabel: "2 large eggs", calories: 144, proteinG: 12, carbsG: 1, fatG: 10, fiberG: 0, sugarG: 1, sodiumMg: 142, source: "seed" },
  { id: "rice", name: "Rice", servingLabel: "1 cup cooked", calories: 205, proteinG: 4, carbsG: 45, fatG: 0.4, fiberG: 0.6, sugarG: 0.1, sodiumMg: 2, source: "seed" },
  { id: "oats", name: "Oats", servingLabel: "40 g dry", calories: 154, proteinG: 5, carbsG: 27, fatG: 3, fiberG: 4, sugarG: 0.4, sodiumMg: 1, source: "seed" },
  { id: "greek-yogurt", name: "Greek yogurt", brand: "Plain nonfat", servingLabel: "170 g", calories: 100, proteinG: 17, carbsG: 6, fatG: 0, fiberG: 0, sugarG: 5, sodiumMg: 65, source: "seed" },
  { id: "whey-protein", name: "Whey protein", servingLabel: "1 scoop", calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5, fiberG: 0, sugarG: 1, sodiumMg: 90, source: "seed" },
  { id: "banana", name: "Banana", servingLabel: "1 medium", calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.3, fiberG: 3.1, sugarG: 14, sodiumMg: 1, source: "seed" },
  { id: "apple", name: "Apple", servingLabel: "1 medium", calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4.4, sugarG: 19, sodiumMg: 2, source: "seed" },
  { id: "potato", name: "Potato", servingLabel: "250 g baked", calories: 220, proteinG: 6, carbsG: 50, fatG: 0.2, fiberG: 5, sugarG: 2, sodiumMg: 18, source: "seed" },
  { id: "salmon", name: "Salmon", servingLabel: "120 g cooked", calories: 233, proteinG: 25, carbsG: 0, fatG: 14, fiberG: 0, sugarG: 0, sodiumMg: 70, source: "seed" },
  { id: "ground-beef", name: "Ground beef", servingLabel: "100 g cooked", calories: 250, proteinG: 26, carbsG: 0, fatG: 17, fiberG: 0, sugarG: 0, sodiumMg: 72, source: "seed" },
  { id: "olive-oil", name: "Olive oil", servingLabel: "1 tbsp", calories: 119, proteinG: 0, carbsG: 0, fatG: 13.5, fiberG: 0, sugarG: 0, sodiumMg: 0, source: "seed" },
  { id: "peanut-butter", name: "Peanut butter", servingLabel: "2 tbsp", calories: 188, proteinG: 8, carbsG: 7, fatG: 16, fiberG: 2.6, sugarG: 3.2, sodiumMg: 147, source: "seed" },
  { id: "bread", name: "Bread", servingLabel: "2 slices", calories: 160, proteinG: 6, carbsG: 28, fatG: 2, fiberG: 2, sugarG: 4, sodiumMg: 260, source: "seed" },
  { id: "milk", name: "Milk", servingLabel: "240 ml", calories: 122, proteinG: 8, carbsG: 12, fatG: 5, fiberG: 0, sugarG: 12, sodiumMg: 107, source: "seed" },
];

export const starterRecipes: Recipe[] = [
  {
    id: "recipe-yogurt-bowl",
    name: "Greek yogurt bowl",
    servings: 1,
    notes: "High-protein breakfast with easy carbs.",
    ingredients: [
      { foodId: "greek-yogurt", servings: 1.2 },
      { foodId: "oats", servings: 1 },
      { foodId: "banana", servings: 1 },
      { foodId: "whey-protein", servings: 0.5 },
    ],
  },
  {
    id: "recipe-chicken-rice",
    name: "Chicken rice plate",
    servings: 1,
    notes: "Reliable default lunch for adherence.",
    ingredients: [
      { foodId: "chicken-breast", servings: 1.6 },
      { foodId: "rice", servings: 1.25 },
      { foodId: "olive-oil", servings: 0.5 },
    ],
  },
];

export const starterTrainingTemplates: TrainingSessionTemplate[] = [
  {
    id: "push-day",
    split: "push",
    title: "Push day",
    focus: "Chest, shoulders, and triceps",
    exercises: [
      { id: "barbell-bench-press", name: "Barbell bench press", group: "Primary presses", sets: 4, reps: "5-8", defaultSelected: true },
      { id: "incline-barbell-press", name: "Incline barbell press", group: "Primary presses", sets: 3, reps: "6-8" },
      { id: "incline-dumbbell-press", name: "Incline dumbbell press", group: "Primary presses", sets: 3, reps: "8-10", defaultSelected: true },
      { id: "machine-chest-press", name: "Machine chest press", group: "Primary presses", sets: 3, reps: "8-12" },
      { id: "weighted-dips", name: "Weighted dips", group: "Primary presses", sets: 3, reps: "6-10" },
      { id: "flat-dumbbell-press", name: "Flat dumbbell press", group: "Primary presses", sets: 3, reps: "8-10" },
      { id: "smith-machine-bench-press", name: "Smith machine bench press", group: "Primary presses", sets: 3, reps: "6-10" },
      { id: "close-grip-bench-press", name: "Close-grip bench press", group: "Primary presses", sets: 3, reps: "6-8" },
      { id: "seated-shoulder-press", name: "Seated shoulder press", group: "Shoulders", sets: 3, reps: "8-10", defaultSelected: true },
      { id: "standing-overhead-press", name: "Standing overhead press", group: "Shoulders", sets: 3, reps: "5-8" },
      { id: "arnold-press", name: "Arnold press", group: "Shoulders", sets: 3, reps: "8-10" },
      { id: "lateral-raise", name: "Lateral raise", group: "Shoulders", sets: 3, reps: "12-15", defaultSelected: true },
      { id: "cable-lateral-raise", name: "Cable lateral raise", group: "Shoulders", sets: 3, reps: "12-15" },
      { id: "machine-shoulder-press", name: "Machine shoulder press", group: "Shoulders", sets: 3, reps: "8-12" },
      { id: "front-raise", name: "Front raise", group: "Shoulders", sets: 3, reps: "12-15" },
      { id: "pec-deck-fly", name: "Pec deck fly", group: "Chest accessories", sets: 3, reps: "12-15" },
      { id: "cable-fly", name: "Cable fly", group: "Chest accessories", sets: 3, reps: "12-15" },
      { id: "incline-cable-fly", name: "Incline cable fly", group: "Chest accessories", sets: 3, reps: "12-15" },
      { id: "push-up", name: "Push-up", group: "Chest accessories", sets: 3, reps: "AMRAP" },
      { id: "rope-pushdown", name: "Rope pushdown", group: "Triceps", sets: 3, reps: "10-12", defaultSelected: true },
      { id: "overhead-triceps-extension", name: "Overhead triceps extension", group: "Triceps", sets: 3, reps: "10-12" },
      { id: "skull-crusher", name: "Skull crusher", group: "Triceps", sets: 3, reps: "8-10" },
      { id: "single-arm-pushdown", name: "Single-arm pushdown", group: "Triceps", sets: 3, reps: "12-15" },
      { id: "dip-machine", name: "Dip machine", group: "Triceps", sets: 3, reps: "10-12" },
    ],
  },
  {
    id: "pull-day",
    split: "pull",
    title: "Pull day",
    focus: "Back and biceps",
    exercises: [
      { id: "pull-up", name: "Pull-up", group: "Vertical pulls", sets: 4, reps: "6-10", defaultSelected: true },
      { id: "lat-pulldown", name: "Lat pulldown", group: "Vertical pulls", sets: 4, reps: "8-10", defaultSelected: true },
      { id: "neutral-grip-pulldown", name: "Neutral grip pulldown", group: "Vertical pulls", sets: 3, reps: "8-12" },
      { id: "assisted-pull-up", name: "Assisted pull-up", group: "Vertical pulls", sets: 3, reps: "8-12" },
      { id: "straight-arm-pulldown", name: "Straight-arm pulldown", group: "Vertical pulls", sets: 3, reps: "12-15" },
      { id: "barbell-row", name: "Barbell row", group: "Rows", sets: 4, reps: "6-8" },
      { id: "chest-supported-row", name: "Chest-supported row", group: "Rows", sets: 3, reps: "8-10", defaultSelected: true },
      { id: "single-arm-row", name: "Single-arm dumbbell row", group: "Rows", sets: 3, reps: "10-12" },
      { id: "seated-cable-row", name: "Seated cable row", group: "Rows", sets: 3, reps: "8-12" },
      { id: "t-bar-row", name: "T-bar row", group: "Rows", sets: 3, reps: "8-10" },
      { id: "meadows-row", name: "Meadows row", group: "Rows", sets: 3, reps: "8-10" },
      { id: "machine-high-row", name: "Machine high row", group: "Rows", sets: 3, reps: "10-12" },
      { id: "face-pull", name: "Face pull", group: "Rear delts", sets: 3, reps: "12-15", defaultSelected: true },
      { id: "reverse-pec-deck", name: "Reverse pec deck", group: "Rear delts", sets: 3, reps: "12-15" },
      { id: "rear-delt-row", name: "Rear delt row", group: "Rear delts", sets: 3, reps: "12-15" },
      { id: "cable-rear-delt-fly", name: "Cable rear delt fly", group: "Rear delts", sets: 3, reps: "12-15" },
      { id: "ez-bar-curl", name: "EZ-bar curl", group: "Biceps", sets: 3, reps: "10-12", defaultSelected: true },
      { id: "incline-dumbbell-curl", name: "Incline dumbbell curl", group: "Biceps", sets: 3, reps: "10-12" },
      { id: "hammer-curl", name: "Hammer curl", group: "Biceps", sets: 3, reps: "10-12" },
      { id: "cable-curl", name: "Cable curl", group: "Biceps", sets: 3, reps: "12-15" },
      { id: "preacher-curl", name: "Preacher curl", group: "Biceps", sets: 3, reps: "10-12" },
      { id: "bayesian-curl", name: "Bayesian cable curl", group: "Biceps", sets: 3, reps: "12-15" },
    ],
  },
  {
    id: "legs-day",
    split: "legs",
    title: "Leg day",
    focus: "Quads, hamstrings, glutes, and calves",
    exercises: [
      { id: "back-squat", name: "Back squat", group: "Primary lifts", sets: 4, reps: "5-8", defaultSelected: true },
      { id: "front-squat", name: "Front squat", group: "Primary lifts", sets: 3, reps: "5-8" },
      { id: "hack-squat", name: "Hack squat", group: "Primary lifts", sets: 3, reps: "8-10" },
      { id: "safety-bar-squat", name: "Safety bar squat", group: "Primary lifts", sets: 3, reps: "5-8" },
      { id: "pendulum-squat", name: "Pendulum squat", group: "Primary lifts", sets: 3, reps: "8-10" },
      { id: "leg-press", name: "Leg press", group: "Quad work", sets: 3, reps: "10-12", defaultSelected: true },
      { id: "walking-lunge", name: "Walking lunge", group: "Quad work", sets: 3, reps: "10 each side" },
      { id: "bulgarian-split-squat", name: "Bulgarian split squat", group: "Quad work", sets: 3, reps: "8 each side" },
      { id: "leg-extension", name: "Leg extension", group: "Quad work", sets: 3, reps: "12-15" },
      { id: "heel-elevated-squat", name: "Heel elevated squat", group: "Quad work", sets: 3, reps: "10-12" },
      { id: "step-up", name: "Step-up", group: "Quad work", sets: 3, reps: "10 each side" },
      { id: "romanian-deadlift", name: "Romanian deadlift", group: "Posterior chain", sets: 3, reps: "8-10", defaultSelected: true },
      { id: "good-morning", name: "Good morning", group: "Posterior chain", sets: 3, reps: "8-10" },
      { id: "lying-leg-curl", name: "Lying leg curl", group: "Posterior chain", sets: 3, reps: "10-12" },
      { id: "seated-leg-curl", name: "Seated leg curl", group: "Posterior chain", sets: 3, reps: "10-12" },
      { id: "stiff-leg-deadlift", name: "Stiff-leg deadlift", group: "Posterior chain", sets: 3, reps: "8-10" },
      { id: "single-leg-romanian-deadlift", name: "Single-leg Romanian deadlift", group: "Posterior chain", sets: 3, reps: "10 each side" },
      { id: "hip-thrust", name: "Hip thrust", group: "Glutes", sets: 3, reps: "8-10" },
      { id: "glute-bridge", name: "Glute bridge", group: "Glutes", sets: 3, reps: "10-12" },
      { id: "cable-kickback", name: "Cable kickback", group: "Glutes", sets: 3, reps: "12-15" },
      { id: "standing-calf-raise", name: "Standing calf raise", group: "Calves", sets: 4, reps: "12-15", defaultSelected: true },
      { id: "seated-calf-raise", name: "Seated calf raise", group: "Calves", sets: 4, reps: "12-15" },
      { id: "leg-press-calf-raise", name: "Leg press calf raise", group: "Calves", sets: 4, reps: "12-15" },
    ],
  },
];

function makeEntry(
  date: string,
  mealType: FoodLogEntry["mealType"],
  food: Food,
  servings = 1,
): FoodLogEntry {
  return {
    id: `${date}-${mealType}-${food.id}-${servings}`,
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
}

export function buildDemoEntries(): FoodLogEntry[] {
  const recipeFoods = starterRecipes.map((recipe) => foodFromRecipe(recipe, seedFoods));
  const today = new Date();

  const mealPlans = [
    [
      makeEntry(format(subDays(today, 0), "yyyy-MM-dd"), "breakfast", recipeFoods[0]),
      makeEntry(format(subDays(today, 0), "yyyy-MM-dd"), "lunch", recipeFoods[1]),
      makeEntry(format(subDays(today, 0), "yyyy-MM-dd"), "dinner", seedFoods[9], 1),
      makeEntry(format(subDays(today, 0), "yyyy-MM-dd"), "snack", seedFoods[5], 1),
      makeEntry(format(subDays(today, 0), "yyyy-MM-dd"), "snack", seedFoods[6], 1),
    ],
    [
      makeEntry(format(subDays(today, 1), "yyyy-MM-dd"), "breakfast", seedFoods[1], 1),
      makeEntry(format(subDays(today, 1), "yyyy-MM-dd"), "breakfast", seedFoods[13], 1),
      makeEntry(format(subDays(today, 1), "yyyy-MM-dd"), "lunch", recipeFoods[1]),
      makeEntry(format(subDays(today, 1), "yyyy-MM-dd"), "dinner", seedFoods[8], 1),
      makeEntry(format(subDays(today, 1), "yyyy-MM-dd"), "dinner", seedFoods[10], 1),
      makeEntry(format(subDays(today, 1), "yyyy-MM-dd"), "snack", seedFoods[4], 1),
    ],
    [
      makeEntry(format(subDays(today, 2), "yyyy-MM-dd"), "breakfast", recipeFoods[0]),
      makeEntry(format(subDays(today, 2), "yyyy-MM-dd"), "lunch", seedFoods[0], 1.5),
      makeEntry(format(subDays(today, 2), "yyyy-MM-dd"), "lunch", seedFoods[2], 1),
      makeEntry(format(subDays(today, 2), "yyyy-MM-dd"), "dinner", seedFoods[9], 1),
      makeEntry(format(subDays(today, 2), "yyyy-MM-dd"), "dinner", seedFoods[8], 1),
      makeEntry(format(subDays(today, 2), "yyyy-MM-dd"), "snack", seedFoods[14], 1),
    ],
  ];

  for (let offset = 3; offset < 10; offset += 1) {
    const date = format(subDays(today, offset), "yyyy-MM-dd");
    mealPlans.push([
      makeEntry(date, "breakfast", recipeFoods[0]),
      makeEntry(date, "lunch", seedFoods[0], 1.4),
      makeEntry(date, "lunch", seedFoods[2], 1.1),
      makeEntry(date, "dinner", seedFoods[10], 1),
      makeEntry(date, "dinner", seedFoods[8], 1),
      makeEntry(date, "snack", seedFoods[4], 1),
      makeEntry(date, "snack", seedFoods[6], 1),
    ]);
  }

  return mealPlans.flat();
}

export function buildDemoWeights(): WeightEntry[] {
  const today = new Date();
  const values = [81.3, 81.1, 80.9, 80.8, 80.7, 80.5, 80.6, 80.4, 80.4, 80.3];

  return values.map((weightKg, index) => ({
    id: `weight-${index}`,
    date: format(subDays(today, values.length - index - 1), "yyyy-MM-dd"),
    weightKg,
    note: index === values.length - 1 ? "Travel day bloat settled." : undefined,
  }));
}

export const demoTargets = calculateTargets(defaultProfile);
