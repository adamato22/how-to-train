/* ============================================================================
   HOW TO TRAIN — Personalized lifestyle plan generator
   Built from "How to Train According to the Experts" (FoundMyFitness).

   FILE STRUCTURE (jump to a section):
     1.  STORAGE LAYER         — works in artifact preview AND when self-hosted
     2.  EXERCISE DATABASE     — curated, editable. ADD/REMOVE/EDIT EXERCISES HERE.
     3.  PROTOCOL CONSTANTS    — sets/reps/rest tables per goal. TWEAK HERE.
     4.  CARDIO PROTOCOLS      — Norwegian 4x4, Tabata, 10-min, endurance, snacks
     5.  NUTRITION & SUPPLEMENTS — protein, creatine, omega-3 logic
     6.  PLAN GENERATOR        — turns user profile into a weekly plan
     7.  UI — DESIGN TOKENS    — colors, fonts
     8.  UI — SHARED COMPONENTS
     9.  UI — SCREENS          — Welcome, Setup, Plan, WorkoutDetail
     10. APP ROOT              — state machine + routing

   WHEN SELF-HOSTING:
     - This file works as-is. Storage uses window.storage if available
       (Claude artifact runtime), otherwise localStorage (every browser).
     - Drop into a Vite/Next/CRA React project. Tailwind required.
     - Required deps: react, lucide-react. No other libs needed.
   ============================================================================ */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dumbbell, Heart, Flame, Activity, Zap, Clock,
  ChevronRight, ChevronLeft, ChevronDown, Check, X, Plus, Minus,
  Settings, RotateCcw, ArrowRight, Info, BookOpen,
  Target, TrendingUp, Apple, Pill, Calendar, Edit2,
  Trash2, ListChecks, Sparkles, Moon
} from "lucide-react";

/* ============================================================================
   1. STORAGE LAYER
   ============================================================================ */

const STORAGE_KEYS = {
  PROFILE: "htt:profile",
  PLAN: "htt:plan",
  LOGS: "htt:logs",                    // resistance workout logs
  CARDIO_LOGS: "htt:cardioLogs",       // cardio session logs
  CHECKLIST: "htt:checklist",          // daily checklist by date
  CURRENT_WEEK: "htt:currentWeek",
};

// Async storage that uses window.storage in artifact runtime,
// localStorage in any normal browser. Same API for both.
const storage = {
  async get(key) {
    try {
      if (typeof window !== "undefined" && window.storage?.get) {
        const r = await window.storage.get(key);
        return r?.value ? JSON.parse(r.value) : null;
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const v = window.localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      }
    } catch (e) { /* fall through */ }
    return null;
  },
  async set(key, value) {
    const serialized = JSON.stringify(value);
    try {
      if (typeof window !== "undefined" && window.storage?.set) {
        await window.storage.set(key, serialized);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, serialized);
        return true;
      }
    } catch (e) { /* fall through */ }
    return false;
  },
  async remove(key) {
    try {
      if (typeof window !== "undefined" && window.storage?.delete) {
        await window.storage.delete(key);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
        return true;
      }
    } catch (e) { /* fall through */ }
    return false;
  },
};

/* ============================================================================
   2. EXERCISE DATABASE
   --------------------------------------------------------------------------
   Schema for each exercise:
     id          — unique slug
     name        — display name
     category    — "push" | "pull" | "legs" | "accessory" | "core"
     pattern     — movement pattern (squat, hinge, push-h, push-v, pull-h, pull-v,
                   isolation, lunge, core)
     joints      — "multi" | "single"
     primary     — array of primary muscles trained
     secondary   — array of secondary muscles
     equipment   — required equipment tags. Plan generator filters by user equipment.
                   Tags: "barbell" | "dumbbell" | "bench" | "rack" | "cable" |
                         "machine" | "pullup-bar" | "bands" | "kettlebell" |
                         "bodyweight" (always available)
     level       — "beginner" | "intermediate" | "advanced"
     note        — short coaching cue

   To ADD an exercise: copy any object below, edit fields, add to the array.
   To REMOVE: delete the object. The plan generator will pick alternatives.
   ============================================================================ */

const EXERCISES = [
  // ────────── PUSH — multi-joint ──────────
  { id: "barbell-bench-press", name: "Barbell Bench Press", category: "push", pattern: "push-h", joints: "multi",
    primary: ["chest"], secondary: ["triceps", "anterior delts"],
    equipment: ["barbell", "bench", "rack"], level: "intermediate",
    note: "Foundational pressing lift. Drive feet, retract shoulder blades, controlled descent to lower chest." },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", category: "push", pattern: "push-h", joints: "multi",
    primary: ["chest"], secondary: ["triceps", "anterior delts"],
    equipment: ["dumbbell", "bench"], level: "beginner",
    note: "Greater range of motion than barbell. Lower until elbows are roughly even with torso." },
  { id: "incline-barbell-press", name: "Incline Barbell Press", category: "push", pattern: "push-h", joints: "multi",
    primary: ["upper chest"], secondary: ["anterior delts", "triceps"],
    equipment: ["barbell", "bench", "rack"], level: "intermediate",
    note: "Bench at 30–45°. Targets upper chest fibers." },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", category: "push", pattern: "push-h", joints: "multi",
    primary: ["upper chest"], secondary: ["anterior delts", "triceps"],
    equipment: ["dumbbell", "bench"], level: "beginner",
    note: "Bench at 30–45°. Free path of motion is shoulder-friendly." },
  { id: "overhead-press", name: "Overhead Press", category: "push", pattern: "push-v", joints: "multi",
    primary: ["delts"], secondary: ["triceps", "upper chest"],
    equipment: ["barbell", "rack"], level: "intermediate",
    note: "Brace core hard. Press in straight line, finish with arms by ears." },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", category: "push", pattern: "push-v", joints: "multi",
    primary: ["delts"], secondary: ["triceps"],
    equipment: ["dumbbell"], level: "beginner",
    note: "Seated or standing. Neutral or pronated grip both work." },
  { id: "push-up", name: "Push-Up", category: "push", pattern: "push-h", joints: "multi",
    primary: ["chest"], secondary: ["triceps", "anterior delts", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Plank-tight body. Elevate hands or progress to deficit/weighted as needed." },
  { id: "dip", name: "Dip", category: "push", pattern: "push-v", joints: "multi",
    primary: ["chest", "triceps"], secondary: ["anterior delts"],
    equipment: ["bodyweight"], level: "intermediate",
    note: "Lean forward for chest emphasis, stay upright for triceps emphasis." },
  { id: "machine-chest-press", name: "Machine Chest Press", category: "push", pattern: "push-h", joints: "multi",
    primary: ["chest"], secondary: ["triceps", "anterior delts"],
    equipment: ["machine"], level: "beginner",
    note: "Stable plane of motion. Excellent for training to or near failure safely." },
  { id: "landmine-press", name: "Landmine Press", category: "push", pattern: "push-v", joints: "multi",
    primary: ["delts"], secondary: ["upper chest", "triceps", "core"],
    equipment: ["barbell"], level: "beginner",
    note: "Shoulder-friendly pressing angle. Stagger stance for stability." },
  { id: "close-grip-bench", name: "Close-Grip Bench Press", category: "push", pattern: "push-h", joints: "multi",
    primary: ["triceps"], secondary: ["chest", "anterior delts"],
    equipment: ["barbell", "bench", "rack"], level: "intermediate",
    note: "Hands shoulder-width. Elbows tucked." },

  // ────────── PUSH — single-joint ──────────
  { id: "cable-chest-fly", name: "Cable Chest Fly", category: "push", pattern: "isolation", joints: "single",
    primary: ["chest"], secondary: [],
    equipment: ["cable"], level: "beginner",
    note: "Constant tension through full range. Slight elbow bend, hug a tree." },
  { id: "dumbbell-fly", name: "Dumbbell Fly", category: "push", pattern: "isolation", joints: "single",
    primary: ["chest"], secondary: [],
    equipment: ["dumbbell", "bench"], level: "beginner",
    note: "Fixed elbow angle, stretch deeply at the bottom." },
  { id: "tricep-pushdown", name: "Tricep Pushdown", category: "push", pattern: "isolation", joints: "single",
    primary: ["triceps"], secondary: [],
    equipment: ["cable"], level: "beginner",
    note: "Elbows pinned. Rope or straight bar both effective." },
  { id: "overhead-tricep-extension", name: "Overhead Tricep Extension", category: "push", pattern: "isolation", joints: "single",
    primary: ["triceps"], secondary: [],
    equipment: ["dumbbell"], level: "beginner",
    note: "Long head emphasis from the stretched position overhead." },
  { id: "skull-crushers", name: "Skull Crushers", category: "push", pattern: "isolation", joints: "single",
    primary: ["triceps"], secondary: [],
    equipment: ["barbell", "bench"], level: "intermediate",
    note: "Lower toward forehead or just behind. Use EZ bar for wrist comfort." },
  { id: "lateral-raise", name: "Lateral Raise", category: "push", pattern: "isolation", joints: "single",
    primary: ["lateral delts"], secondary: [],
    equipment: ["dumbbell"], level: "beginner",
    note: "Lead with elbows. Slow eccentric, no momentum." },

  // ────────── PULL — multi-joint ──────────
  { id: "pull-up", name: "Pull-Up", category: "pull", pattern: "pull-v", joints: "multi",
    primary: ["lats", "upper back"], secondary: ["biceps", "rear delts"],
    equipment: ["pullup-bar"], level: "intermediate",
    note: "Pronated grip. Chest to bar, full hang at bottom. Use band assist if needed." },
  { id: "chin-up", name: "Chin-Up", category: "pull", pattern: "pull-v", joints: "multi",
    primary: ["lats", "biceps"], secondary: ["upper back"],
    equipment: ["pullup-bar"], level: "intermediate",
    note: "Supinated grip. More biceps recruitment than pull-ups." },
  { id: "lat-pulldown", name: "Lat Pulldown", category: "pull", pattern: "pull-v", joints: "multi",
    primary: ["lats"], secondary: ["upper back", "biceps"],
    equipment: ["cable"], level: "beginner",
    note: "Drive elbows down toward hips. Slight backward lean." },
  { id: "barbell-row", name: "Barbell Row", category: "pull", pattern: "pull-h", joints: "multi",
    primary: ["mid back", "lats"], secondary: ["biceps", "rear delts"],
    equipment: ["barbell"], level: "intermediate",
    note: "Hinged torso. Pull to lower chest/upper abdomen." },
  { id: "dumbbell-row", name: "Dumbbell Row (One-Arm)", category: "pull", pattern: "pull-h", joints: "multi",
    primary: ["lats", "mid back"], secondary: ["biceps", "rear delts"],
    equipment: ["dumbbell", "bench"], level: "beginner",
    note: "Hand and knee on bench. Pull to hip, no torso rotation." },
  { id: "seated-cable-row", name: "Seated Cable Row", category: "pull", pattern: "pull-h", joints: "multi",
    primary: ["mid back"], secondary: ["lats", "biceps", "rear delts"],
    equipment: ["cable"], level: "beginner",
    note: "Chest up, pull to lower ribs. Avoid heaving with low back." },
  { id: "inverted-row", name: "Inverted Row", category: "pull", pattern: "pull-h", joints: "multi",
    primary: ["mid back"], secondary: ["lats", "biceps", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Body straight, pull chest to bar. Adjust difficulty by changing foot height." },
  { id: "chest-supported-row", name: "Chest-Supported Row", category: "pull", pattern: "pull-h", joints: "multi",
    primary: ["mid back", "lats"], secondary: ["biceps", "rear delts"],
    equipment: ["dumbbell", "bench"], level: "beginner",
    note: "Removes lower back from equation — pure upper-back work." },
  { id: "t-bar-row", name: "T-Bar Row", category: "pull", pattern: "pull-h", joints: "multi",
    primary: ["mid back", "lats"], secondary: ["biceps", "rear delts"],
    equipment: ["barbell"], level: "intermediate",
    note: "Heavy compound back builder. Hinge hard, drive elbows back." },

  // ────────── PULL — single-joint ──────────
  { id: "barbell-curl", name: "Barbell Curl", category: "pull", pattern: "isolation", joints: "single",
    primary: ["biceps"], secondary: [],
    equipment: ["barbell"], level: "beginner",
    note: "Elbows pinned to sides. Don't swing." },
  { id: "dumbbell-curl", name: "Dumbbell Curl", category: "pull", pattern: "isolation", joints: "single",
    primary: ["biceps"], secondary: [],
    equipment: ["dumbbell"], level: "beginner",
    note: "Supinate as you curl up. Alternate or simultaneous both work." },
  { id: "hammer-curl", name: "Hammer Curl", category: "pull", pattern: "isolation", joints: "single",
    primary: ["biceps", "brachialis"], secondary: ["forearms"],
    equipment: ["dumbbell"], level: "beginner",
    note: "Neutral grip. Hits brachialis and brachioradialis." },
  { id: "incline-dumbbell-curl", name: "Incline Dumbbell Curl", category: "pull", pattern: "isolation", joints: "single",
    primary: ["biceps"], secondary: [],
    equipment: ["dumbbell", "bench"], level: "intermediate",
    note: "Stretched-position emphasis. Bench at 60°, let arms hang behind torso." },
  { id: "preacher-curl", name: "Preacher Curl", category: "pull", pattern: "isolation", joints: "single",
    primary: ["biceps"], secondary: [],
    equipment: ["dumbbell"], level: "beginner",
    note: "Strict, peak contraction. Don't fully lock out at top." },
  { id: "cable-curl", name: "Cable Curl", category: "pull", pattern: "isolation", joints: "single",
    primary: ["biceps"], secondary: [],
    equipment: ["cable"], level: "beginner",
    note: "Constant tension throughout the range." },
  { id: "face-pull", name: "Face Pull", category: "pull", pattern: "isolation", joints: "single",
    primary: ["rear delts"], secondary: ["upper back", "rotator cuff"],
    equipment: ["cable"], level: "beginner",
    note: "Pull rope toward face, externally rotate at the top. Excellent for shoulder health." },
  { id: "rear-delt-fly", name: "Rear Delt Fly", category: "pull", pattern: "isolation", joints: "single",
    primary: ["rear delts"], secondary: ["upper back"],
    equipment: ["dumbbell"], level: "beginner",
    note: "Hinge forward, lead with pinkies up. Light weight, strict form." },

  // ────────── LEGS — multi-joint ──────────
  { id: "back-squat", name: "Back Squat", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core", "lower back"],
    equipment: ["barbell", "rack"], level: "intermediate",
    note: "King of lower body lifts. Bar on traps, brace, descend to depth." },
  { id: "front-squat", name: "Front Squat", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads"], secondary: ["glutes", "core", "upper back"],
    equipment: ["barbell", "rack"], level: "advanced",
    note: "Bar on front delts. Upright torso — quad-dominant." },
  { id: "goblet-squat", name: "Goblet Squat", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["core"],
    equipment: ["dumbbell"], level: "beginner",
    note: "Hold dumbbell at chest. Best teaching variation for the squat pattern." },
  { id: "leg-press", name: "Leg Press", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings"],
    equipment: ["machine"], level: "beginner",
    note: "Stable, easy to overload. Don't lock out knees." },
  { id: "bulgarian-split-squat", name: "Bulgarian Split Squat", category: "legs", pattern: "lunge", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core"],
    equipment: ["dumbbell", "bench"], level: "intermediate",
    note: "Rear foot elevated. Brutal but effective single-leg builder." },
  { id: "walking-lunge", name: "Walking Lunge", category: "legs", pattern: "lunge", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Long stride, knee tracks over toes. Add dumbbells once bodyweight feels too easy." },
  { id: "step-up", name: "Step-Up", category: "legs", pattern: "lunge", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings"],
    equipment: ["dumbbell", "bench"], level: "beginner",
    note: "Drive through heel of stepping leg. Don't push off back foot." },
  { id: "deadlift", name: "Conventional Deadlift", category: "legs", pattern: "hinge", joints: "multi",
    primary: ["glutes", "hamstrings"], secondary: ["lower back", "lats", "core", "traps"],
    equipment: ["barbell"], level: "intermediate",
    note: "Bar over midfoot, neutral spine, push the floor away. Limit volume — high systemic cost." },
  { id: "romanian-deadlift", name: "Romanian Deadlift", category: "legs", pattern: "hinge", joints: "multi",
    primary: ["hamstrings", "glutes"], secondary: ["lower back"],
    equipment: ["barbell"], level: "intermediate",
    note: "Hinge with soft knees. Bar slides down thighs to mid-shin." },
  { id: "trap-bar-deadlift", name: "Trap Bar Deadlift", category: "legs", pattern: "hinge", joints: "multi",
    primary: ["quads", "glutes", "hamstrings"], secondary: ["traps", "core"],
    equipment: ["barbell"], level: "beginner",
    note: "Beginner-friendly deadlift. Neutral spine is easier to maintain." },
  { id: "hip-thrust", name: "Hip Thrust", category: "legs", pattern: "hinge", joints: "multi",
    primary: ["glutes"], secondary: ["hamstrings"],
    equipment: ["barbell", "bench"], level: "beginner",
    note: "Upper back on bench, drive hips up to full extension." },
  { id: "kettlebell-swing", name: "Kettlebell Swing", category: "legs", pattern: "hinge", joints: "multi",
    primary: ["glutes", "hamstrings"], secondary: ["lower back", "core"],
    equipment: ["kettlebell"], level: "intermediate",
    note: "Hinge, not squat. Hips drive the bell — arms are passive." },

  // ────────── LEGS — single-joint ──────────
  { id: "leg-extension", name: "Leg Extension", category: "legs", pattern: "isolation", joints: "single",
    primary: ["quads"], secondary: [],
    equipment: ["machine"], level: "beginner",
    note: "Pure quad isolation. Pause at top." },
  { id: "lying-leg-curl", name: "Lying Leg Curl", category: "legs", pattern: "isolation", joints: "single",
    primary: ["hamstrings"], secondary: [],
    equipment: ["machine"], level: "beginner",
    note: "Hamstring isolation. Slow eccentric." },
  { id: "seated-leg-curl", name: "Seated Leg Curl", category: "legs", pattern: "isolation", joints: "single",
    primary: ["hamstrings"], secondary: [],
    equipment: ["machine"], level: "beginner",
    note: "Stretched-position emphasis on hamstrings — research suggests slight hypertrophy edge over lying version." },
  { id: "standing-calf-raise", name: "Standing Calf Raise", category: "legs", pattern: "isolation", joints: "single",
    primary: ["calves"], secondary: [],
    equipment: ["machine"], level: "beginner",
    note: "Full stretch at bottom, full contraction at top. Pause briefly at both ends." },
  { id: "seated-calf-raise", name: "Seated Calf Raise", category: "legs", pattern: "isolation", joints: "single",
    primary: ["calves"], secondary: [],
    equipment: ["machine"], level: "beginner",
    note: "Targets the soleus more than standing version." },

  // ────────── LEGS — bodyweight options ──────────
  { id: "air-squat", name: "Bodyweight Squat", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Sit between your heels, knees track over toes. Add a tempo (3 sec down, 1 sec pause) once it feels easy." },
  { id: "jump-squat", name: "Jump Squat", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["calves", "core"],
    equipment: ["bodyweight"], level: "intermediate",
    note: "Explosive intent — drive hard from the bottom, land soft. Counts as power work." },
  { id: "pistol-squat", name: "Pistol Squat", category: "legs", pattern: "squat", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"], level: "advanced",
    note: "Single-leg squat to depth. Use a TRX, doorway, or counter for assistance until strong enough." },
  { id: "reverse-lunge", name: "Reverse Lunge", category: "legs", pattern: "lunge", joints: "multi",
    primary: ["quads", "glutes"], secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Knee-friendly lunge variant. Step back, drop straight down, drive through front heel." },
  { id: "single-leg-rdl-bw", name: "Single-Leg Romanian Deadlift", category: "legs", pattern: "hinge", joints: "multi",
    primary: ["hamstrings", "glutes"], secondary: ["lower back", "core"],
    equipment: ["bodyweight"], level: "intermediate",
    note: "Hinge on one leg, back leg extends behind. Bodyweight or hold a dumbbell/kettlebell. Slow and controlled." },
  { id: "nordic-curl", name: "Nordic Curl", category: "legs", pattern: "isolation", joints: "single",
    primary: ["hamstrings"], secondary: ["glutes"],
    equipment: ["bodyweight"], level: "advanced",
    note: "Anchor your feet, lower yourself slowly forward, eccentric only at first. Brutal but elite hamstring builder." },
  { id: "wall-sit", name: "Wall Sit", category: "legs", pattern: "isolation", joints: "single",
    primary: ["quads"], secondary: ["glutes", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Back flat against wall, thighs parallel to floor. Hold for 30–60 seconds per set." },
  { id: "bw-calf-raise", name: "Calf Raise", category: "legs", pattern: "isolation", joints: "single",
    primary: ["calves"], secondary: [],
    equipment: ["bodyweight"], level: "beginner",
    note: "Two-leg or single-leg. Step edge if available for full stretch. Slow, full range." },
  { id: "single-leg-glute-bridge", name: "Single-Leg Glute Bridge", category: "legs", pattern: "isolation", joints: "single",
    primary: ["glutes"], secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Lift one foot, drive through the other heel. Squeeze hard at top." },

  // ────────── ACCESSORY / CORE ──────────
  { id: "plank", name: "Plank", category: "core", pattern: "core", joints: "multi",
    primary: ["core"], secondary: [],
    equipment: ["bodyweight"], level: "beginner",
    note: "Squeeze glutes, ribs down. Hold for time, not minutes — quality over duration." },
  { id: "side-plank", name: "Side Plank", category: "core", pattern: "core", joints: "multi",
    primary: ["obliques", "core"], secondary: [],
    equipment: ["bodyweight"], level: "beginner",
    note: "Stack hips. Hold for time per side." },
  { id: "hanging-leg-raise", name: "Hanging Leg Raise", category: "core", pattern: "core", joints: "multi",
    primary: ["core", "hip flexors"], secondary: [],
    equipment: ["pullup-bar"], level: "intermediate",
    note: "Don't swing. Knees-up regression if straight legs are too hard." },
  { id: "pallof-press", name: "Pallof Press", category: "core", pattern: "core", joints: "multi",
    primary: ["core", "obliques"], secondary: [],
    equipment: ["cable"], level: "beginner",
    note: "Anti-rotation. Resist the cable's pull as you press out." },
  { id: "shrug", name: "Shrug", category: "accessory", pattern: "isolation", joints: "single",
    primary: ["traps"], secondary: [],
    equipment: ["dumbbell"], level: "beginner",
    note: "Straight up, no rolling. Pause at the top." },
  { id: "glute-bridge", name: "Glute Bridge", category: "accessory", pattern: "hinge", joints: "multi",
    primary: ["glutes"], secondary: ["hamstrings", "core"],
    equipment: ["bodyweight"], level: "beginner",
    note: "Bodyweight or weighted. Squeeze hard at the top." },
];

// Equipment availability presets keyed off the user's setup choice.
const EQUIPMENT_PRESETS = {
  "full-gym":   ["barbell", "dumbbell", "bench", "rack", "cable", "machine", "pullup-bar", "kettlebell", "bands", "bodyweight"],
  "home-gym":   ["dumbbell", "bench", "pullup-bar", "kettlebell", "bands", "bodyweight"],
  "minimal":    ["dumbbell", "bands", "bodyweight"],
  "bodyweight": ["bodyweight", "pullup-bar"],
};

function exerciseAvailable(ex, equipmentTags) {
  return ex.equipment.every(tag => equipmentTags.includes(tag));
}

function pickExercise(category, pattern, equipmentTags, level, used = new Set(), jointsPref = null) {
  const candidates = EXERCISES.filter(ex =>
    ex.category === category &&
    (pattern === null || ex.pattern === pattern) &&
    (jointsPref === null || ex.joints === jointsPref) &&
    exerciseAvailable(ex, equipmentTags) &&
    !used.has(ex.id)
  );
  // Prefer level-appropriate; fall back to easier or harder if needed.
  const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 };
  const userLvl = levelOrder[level] ?? 1;
  candidates.sort((a, b) => {
    const da = Math.abs(levelOrder[a.level] - userLvl);
    const db = Math.abs(levelOrder[b.level] - userLvl);
    return da - db;
  });
  return candidates[0] || null;
}

/* ============================================================================
   3. PROTOCOL CONSTANTS
   --------------------------------------------------------------------------
   These tables encode the resistance training protocols from the guide
   (Schoenfeld, Norton, Phillips). Each goal has parameters by experience.
   TWEAK any of these to adjust the prescriptions globally.
   ============================================================================ */

const RESISTANCE_PROTOCOLS = {
  strength: {
    name: "Strength",
    blurb: "Heavy loads, low reps, long rest. Prioritize compound lifts and skill of force production.",
    loadPctRange: [85, 95],            // % of 1RM
    repRange: [3, 5],                  // reps per set
    setsPerExercise: [3, 5],
    weeklySetsPerMuscle: [5, 12],      // hard sets per muscle group per week
    restSec: [180, 300],               // 3–5 min
    tempo: "Fast/moderate (1–2s up, 1–2s down)",
    proximity: "Stop 3–4 reps before failure on compounds. Failure rare.",
    notes: [
      "Train multi-joint compounds first; isolation work after.",
      "Prioritize bar speed and crisp execution over chasing the burn.",
      "Strength is a skill — practice the lift, don't just fatigue the muscle.",
    ],
  },
  hypertrophy: {
    name: "Hypertrophy",
    blurb: "Moderate loads, moderate-to-high reps, mechanical tension and metabolic stress.",
    loadPctRange: [60, 80],
    repRange: [8, 12],
    setsPerExercise: [3, 4],
    weeklySetsPerMuscle: [10, 20],
    restSec: [60, 120],
    tempo: "Moderate to slow (1–2s up, 2–4s down)",
    proximity: "0–3 reps in reserve. Take isolations to or near failure.",
    notes: [
      "Mix compound and isolation work — both matter for size.",
      "Train each muscle 2–3× per week to spread volume.",
      "Train target muscles first when fresh; exercise order otherwise flexible.",
    ],
  },
  recomp: {
    name: "Body Recomposition",
    blurb: "Hypertrophy training paired with a small calorie deficit and high protein.",
    loadPctRange: [60, 80],
    repRange: [8, 12],
    setsPerExercise: [3, 4],
    weeklySetsPerMuscle: [10, 18],
    restSec: [60, 120],
    tempo: "Moderate to slow (1–2s up, 2–4s down)",
    proximity: "0–3 reps in reserve.",
    notes: [
      "Drive the hypertrophy stimulus while protein and sleep protect muscle.",
      "Most achievable for newer lifters or those with significant fat to lose.",
      "Expect slow but durable progress on the scale and in the mirror.",
    ],
  },
  aerobic: {
    name: "Aerobic Fitness / VO₂ max",
    blurb: "Cardio is the priority. Resistance work supports muscle and joint health.",
    loadPctRange: [65, 80],
    repRange: [6, 12],
    setsPerExercise: [2, 3],
    weeklySetsPerMuscle: [6, 12],
    restSec: [90, 150],
    tempo: "Moderate (1–2s up, 1–2s down)",
    proximity: "1–3 reps in reserve. No need to grind.",
    notes: [
      "Lift to maintain muscle and tissue resilience — cardio drives the goal here.",
      "Schedule lifts on different days from hard intervals when possible.",
    ],
  },
  heart: {
    name: "Heart Health (Levine Protocol)",
    blurb: "Dr. Benjamin Levine's mixed protocol for a youthful cardiovascular system.",
    loadPctRange: [65, 80],
    repRange: [6, 12],
    setsPerExercise: [2, 3],
    weeklySetsPerMuscle: [6, 12],
    restSec: [90, 150],
    tempo: "Moderate (1–2s up, 1–2s down)",
    proximity: "1–3 reps in reserve.",
    notes: [
      "Two resistance sessions per week is the floor — more is fine.",
      "Hit the cardio prescription first; resistance supports the cardiac adaptations.",
    ],
  },
  efficient: {
    name: "Time-Efficient General Fitness",
    blurb: "Maximum return on minimum hours. Compounds, supersets, brief rests.",
    loadPctRange: [70, 85],
    repRange: [6, 10],
    setsPerExercise: [2, 3],
    weeklySetsPerMuscle: [6, 12],
    restSec: [60, 90],
    tempo: "Moderate (1–2s up, 1–2s down)",
    proximity: "1–3 reps in reserve on compounds; failure OK on isolations.",
    notes: [
      "Lean on supersets — pair non-competing movements (e.g., row + press).",
      "Skip extensive warm-ups and stretching. A few warm-up sets of the lift itself is enough.",
      "Compound, bilateral movements give the most muscle worked per minute.",
    ],
  },
};

// Older-adult adjustments — applied as overrides when age >= 60.
const OLDER_ADULT_ADJUSTMENTS = {
  proximityNote: "Stop 2–4 reps before failure. Recovery is the bottleneck — don't grind.",
  extraNotes: [
    "Type II (fast-twitch) fibers atrophy fastest with age — heavier loads (when safely managed) help preserve them.",
    "Allow extra recovery between hard sessions. Soreness lingers longer past 60.",
    "Resistance training is the single most protective lifestyle factor against age-related frailty and falls.",
  ],
};

/* ============================================================================
   4. CARDIO PROTOCOLS
   ============================================================================ */

const CARDIO_PROTOCOLS = {
  norwegian_4x4: {
    id: "norwegian_4x4",
    name: "Norwegian 4×4",
    category: "HIIT",
    blurb: "The gold standard for raising VO₂ max. ~7% improvement over 8 weeks.",
    structure: [
      "10 min warm-up (easy pace, ramp up at end)",
      "4 min hard at 85–95% max HR (zone 4–5)",
      "3 min active recovery at ~70% max HR",
      "Repeat the 4 min / 3 min block 4 total rounds",
      "5–10 min cool-down (easy pace)",
    ],
    duration: 45,
    rpe: "16–18 during the 4-minute work intervals",
    equipmentSuggestions: ["treadmill", "bike", "rower", "outdoor running"],
  },
  tabata: {
    id: "tabata",
    name: "Tabata Intervals",
    category: "HIIT",
    blurb: "20 seconds all-out, 10 seconds rest, 8 rounds. Final round should leave nothing.",
    structure: [
      "10 min warm-up",
      "20 sec all-out effort",
      "10 sec complete rest",
      "Repeat 8 rounds = 4 min set",
      "Optional: 3–5 min recovery, then repeat for a 2nd or 3rd set",
      "5 min cool-down",
    ],
    duration: 25,
    rpe: "19–20 during work intervals — true maximal effort",
    equipmentSuggestions: ["bike (best)", "rower", "treadmill (sprint)", "bodyweight exercises"],
  },
  ten_minute: {
    id: "ten_minute",
    name: "10-Minute Workout",
    category: "HIIT",
    blurb: "Gibala's low-volume protocol. 10 × 60s at 90% max HR.",
    structure: [
      "10 min warm-up",
      "60 sec hard at ~90% max HR",
      "60 sec easy recovery",
      "Repeat 10 total rounds",
      "Short cool-down",
    ],
    duration: 30,
    rpe: "17–18 during work intervals",
    equipmentSuggestions: ["bike", "treadmill", "rower"],
  },
  zone2: {
    id: "zone2",
    name: "Endurance / Zone 2",
    category: "Endurance",
    blurb: "Conversational-pace aerobic work. Builds the aerobic base and metabolic health.",
    structure: [
      "5 min easy warm-up",
      "Sustained effort at 60–70% max HR",
      "Talk test: full sentences with some effort",
      "5 min cool-down",
    ],
    duration: 60,
    rpe: "9–12 (very light to light)",
    equipmentSuggestions: ["bike", "incline walking", "easy jogging", "elliptical", "rowing"],
  },
  long_endurance: {
    id: "long_endurance",
    name: "Long Endurance Session",
    category: "Endurance",
    blurb: "One longer aerobic session per week per Levine's heart-health protocol.",
    structure: [
      "60–90+ min at zone 2 intensity (60–70% max HR)",
      "Talk test: full sentences with effort, can't sing",
      "Hike, long bike ride, dance class, easy run — whatever you'll actually do",
    ],
    duration: 75,
    rpe: "10–12",
    equipmentSuggestions: ["outdoor activity", "bike", "hike", "fitness class"],
  },
  recovery: {
    id: "recovery",
    name: "Active Recovery",
    category: "Recovery",
    blurb: "Easy aerobic work the day after intervals. Promotes recovery, builds base.",
    structure: [
      "20–30 min at 50–60% max HR",
      "Conversational pace, easy effort",
      "Walk, easy bike, swim",
    ],
    duration: 25,
    rpe: "6–9 (very light)",
    equipmentSuggestions: ["walking", "easy bike", "swimming"],
  },
  exercise_snacks: {
    id: "exercise_snacks",
    name: "Exercise Snacks (daily, throughout the day)",
    category: "Daily Movement",
    blurb: "Brief vigorous bouts spread across the day — ~4 minutes total can move VO₂ max.",
    structure: [
      "Pick 3–4 short bursts of vigorous activity per day, 60 seconds or less each",
      "Climb 3 flights of stairs, fast",
      "20 seconds of all-out cycling on a stationary bike (3× spread across the day)",
      "10 bodyweight squats every 45 minutes if desk-bound",
      "Aim for 4–5 minutes of total vigorous time across the day",
    ],
    duration: 5,
    rpe: "16–19 during the bursts",
    equipmentSuggestions: ["stairs", "bike", "any vertical surface", "bodyweight"],
  },
  vilpa: {
    id: "vilpa",
    name: "VILPA (Vigorous Intermittent Lifestyle Physical Activity)",
    category: "Daily Movement",
    blurb: "Embed brief vigorous bouts into normal life. 4 min/day cuts mortality risk by ~30%.",
    structure: [
      "Take stairs and sprint up them when possible",
      "Walk briskly with a bag/luggage instead of using moving walkways",
      "Carry groceries fast across the parking lot",
      "Sprint for the bus you don't actually need to catch",
      "Aim to accumulate 4–16 minutes of huffing-and-puffing intensity per day",
    ],
    duration: 0,
    rpe: "16–18 during bursts",
    equipmentSuggestions: ["everyday life"],
  },
};

/* ============================================================================
   5. NUTRITION & SUPPLEMENTS
   ============================================================================ */

// Protein dose by goal, in grams per kg of bodyweight per day.
const PROTEIN_DOSE_PER_KG = {
  strength:    1.6,
  hypertrophy: 1.8,
  recomp:      2.2,   // higher end during deficit
  aerobic:     1.4,
  heart:       1.4,
  efficient:   1.6,
};

// Mifflin–St Jeor BMR. Simple, well-validated.
function calcBMR({ weightKg, heightCm, age, sex }) {
  const base = 10 * weightKg + 6.25 * (heightCm || 170) - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

// Activity multiplier from training load.
function activityMultiplier(sessionsPerWeek) {
  if (sessionsPerWeek <= 2) return 1.375;   // light
  if (sessionsPerWeek <= 4) return 1.55;    // moderate
  if (sessionsPerWeek <= 6) return 1.725;   // active
  return 1.9;                                // very active
}

function calcMaintenanceCalories(profile) {
  const bmr = calcBMR(profile);
  return Math.round(bmr * activityMultiplier(profile.sessionsPerWeek + (profile.cardioCount || 2)));
}

function buildNutritionPlan(profile) {
  const dose = PROTEIN_DOSE_PER_KG[profile.goal] || 1.6;
  const proteinG = Math.round(profile.weightKg * dose);
  const meals = profile.age >= 60 ? 4 : 3;
  const perMealG = Math.round(proteinG / meals);

  const maintenance = calcMaintenanceCalories(profile);
  let target = maintenance;
  let calorieNote = `Eat at maintenance (~${maintenance} kcal/day) to support training and recovery.`;
  if (profile.goal === "recomp") {
    target = Math.round(maintenance * 0.85);  // ~15% deficit
    calorieNote = `Modest deficit: ~${target} kcal/day (~15% below maintenance of ${maintenance}). Recomp progresses slowly — give it 8–12 weeks before judging.`;
  }
  if (profile.goal === "hypertrophy" && profile.experience !== "beginner") {
    target = Math.round(maintenance * 1.05);
    calorieNote = `Slight surplus: ~${target} kcal/day (~5% above maintenance of ${maintenance}). Excess past this just becomes fat.`;
  }

  const principles = [
    `Total protein matters most. Distribution and timing are secondary tweaks.`,
    `Spread protein across ${meals} meals: ~${perMealG}g each. Each meal then triggers its own muscle protein synthesis pulse.`,
    profile.age >= 60
      ? `At your age, protein distribution matters more — anabolic sensitivity declines, so each meal should clear 30g+ of high-quality protein.`
      : `Hit each meal with at least 20–30g of high-quality protein.`,
    `Prioritize protein at breakfast (~30g) — it blunts cravings and reward-driven eating throughout the day.`,
    `Post-workout protein helps but the "anabolic window" is wide. If your daily total is met, exact timing barely matters.`,
  ];
  if (profile.age >= 60) {
    principles.push(`Train before your post-workout meal — exercise restores muscle's protein responsiveness in older adults.`);
  }
  if (profile.goal === "recomp") {
    principles.push(`Sleep is non-negotiable here. Poor sleep during a deficit shifts losses from fat to muscle.`);
  }

  return {
    proteinG, perMealG, meals, maintenance, target, calorieNote, principles, dosePerKg: dose,
  };
}

function buildSupplementPlan(profile) {
  const supps = [];

  // Creatine — universal recommendation
  let creatineDose = 5;
  let creatineNote = "5 g/day. No loading phase needed. Take any time of day, every day (training and rest days).";
  if (profile.age >= 60) {
    creatineDose = 5;
    creatineNote = "5 g/day minimum. Some experts suggest 8–10 g/day at older ages for potential bone and cognitive benefits, especially during periods of cognitive demand or poor sleep.";
  }
  supps.push({
    name: "Creatine Monohydrate",
    dose: `${creatineDose} g/day`,
    timing: "Any time, every day",
    note: creatineNote,
    rationale: "Best-evidenced supplement for muscle strength and size. Emerging evidence for bone, brain, and cognitive support — especially under stress or poor sleep. 40+ years of safety data; no kidney or hair-loss concerns at standard doses.",
  });

  // Omega-3 — recommend especially for older adults, recomp, and aerobic goals
  if (profile.age >= 50 || profile.goal === "recomp" || profile.goal === "aerobic" || profile.goal === "heart") {
    supps.push({
      name: "Omega-3 (EPA + DHA)",
      dose: "Loading: 5 g/day (≈3g EPA + 2g DHA) for 4 weeks. Maintenance: 2 g/day combined EPA+DHA.",
      timing: "With food, ideally split across two meals",
      note: "Choose a third-party tested fish-oil or algae-oil product. Refrigerate after opening.",
      rationale: profile.age >= 50
        ? "Anti-catabolic effects protect against age-related and disuse muscle atrophy. Improves muscle protein response to amino acids. Combined with resistance training, improves lower-body strength and function in older adults."
        : "Supports recovery, anti-inflammatory balance, and the muscle phospholipid profile that responds to training.",
    });
  }

  // Whey or high-quality protein supplement — convenience pick
  if (profile.goal !== "aerobic") {
    supps.push({
      name: "Whey Protein (optional)",
      dose: "20–40 g per serving as needed to hit daily protein target",
      timing: "Any time it helps you reach your daily total",
      note: "Convenience, not magic. If you can hit your protein target with food, no supplement needed.",
      rationale: "Fast-digesting, high-leucine, complete-amino-acid profile — easiest way to top up daily protein. Rated tier-1 by most exercise scientists for that practical reason.",
    });
  }

  // Caffeine for performance — listed as Norton's tier-1 supplement
  if (profile.experience !== "beginner") {
    supps.push({
      name: "Caffeine (pre-workout, optional)",
      dose: "2–3 mg/kg bodyweight, 30–60 min before training",
      timing: "Pre-workout sessions only — avoid within 8 hours of bedtime",
      note: "Not for everyone. Skip if it disrupts your sleep — sleep matters more.",
      rationale: "Performance-enhancing effects for both strength and endurance work. Skip on rest days to maintain sensitivity.",
    });
  }

  return supps;
}


/* ============================================================================
   6. PLAN GENERATOR
   --------------------------------------------------------------------------
   Turns the user's profile into a complete weekly plan.

   Returns:
     {
       resistanceWorkouts: [ { id, name, focus, exercises: [...] }, ... ]
       cardioSessions:     [ { id, protocolKey, name, ... }, ... ]
       nutrition: { proteinG, perMealG, ... }
       supplements: [ ... ]
       progression: [ { week, focus, prescription }, ... ]
       principles: [ string, ... ]
       warnings:   [ string, ... ]
     }
   ============================================================================ */

// Workout split templates by resistance sessions per week.
// Each template names a set of focuses; the generator fills exercises into each.
const SPLIT_TEMPLATES = {
  2: [
    { id: "fb-a", name: "Full Body A", focus: ["squat", "push-h", "pull-h", "isolation-arms"] },
    { id: "fb-b", name: "Full Body B", focus: ["hinge", "push-v", "pull-v", "isolation-shoulders"] },
  ],
  3: [
    { id: "upper", name: "Upper Body", focus: ["push-h", "pull-h", "push-v", "pull-v", "isolation-arms"] },
    { id: "lower", name: "Lower Body", focus: ["squat", "hinge", "lunge", "isolation-legs"] },
    { id: "full",  name: "Full Body",  focus: ["squat", "push-h", "pull-h", "isolation"] },
  ],
  4: [
    { id: "upper-a", name: "Upper Body A (push focus)", focus: ["push-h", "pull-h", "push-v", "isolation-chest", "isolation-triceps"] },
    { id: "lower-a", name: "Lower Body A (squat focus)", focus: ["squat", "lunge", "isolation-quads", "isolation-calves", "core"] },
    { id: "upper-b", name: "Upper Body B (pull focus)", focus: ["pull-v", "push-h", "pull-h", "isolation-back", "isolation-biceps"] },
    { id: "lower-b", name: "Lower Body B (hinge focus)", focus: ["hinge", "lunge", "isolation-hamstrings", "isolation-glutes", "core"] },
  ],
  5: [
    { id: "push",  name: "Push", focus: ["push-h", "push-v", "isolation-chest", "isolation-shoulders", "isolation-triceps"] },
    { id: "pull",  name: "Pull", focus: ["pull-v", "pull-h", "isolation-back", "isolation-biceps", "isolation-rear-delts"] },
    { id: "legs",  name: "Legs", focus: ["squat", "hinge", "lunge", "isolation-quads", "isolation-hamstrings", "isolation-calves"] },
    { id: "upper", name: "Upper Body", focus: ["push-h", "pull-h", "push-v", "pull-v", "isolation-arms"] },
    { id: "lower", name: "Lower Body", focus: ["squat", "hinge", "isolation-quads", "isolation-hamstrings", "core"] },
  ],
  6: [
    { id: "push-a", name: "Push A", focus: ["push-h", "push-v", "isolation-chest", "isolation-shoulders"] },
    { id: "pull-a", name: "Pull A", focus: ["pull-v", "pull-h", "isolation-biceps", "isolation-rear-delts"] },
    { id: "legs-a", name: "Legs A (squat focus)", focus: ["squat", "lunge", "isolation-quads", "isolation-calves"] },
    { id: "push-b", name: "Push B", focus: ["push-h", "push-v", "isolation-shoulders", "isolation-triceps"] },
    { id: "pull-b", name: "Pull B", focus: ["pull-h", "pull-v", "isolation-back", "isolation-biceps"] },
    { id: "legs-b", name: "Legs B (hinge focus)", focus: ["hinge", "lunge", "isolation-hamstrings", "isolation-glutes"] },
  ],
};

// Picks a concrete exercise for a focus slot.
// Cascades: tries strict match, then loosens pattern, then loosens joints, then loosens category.
function pickForFocus(focus, equipmentTags, level, used) {
  // Map abstract focus → (category, pattern, joints) constraints.
  const map = {
    "squat":     { cat: "legs",     pat: "squat",     joints: "multi" },
    "hinge":     { cat: "legs",     pat: "hinge",     joints: "multi" },
    "lunge":     { cat: "legs",     pat: "lunge",     joints: "multi" },
    "push-h":    { cat: "push",     pat: "push-h",    joints: "multi" },
    "push-v":    { cat: "push",     pat: "push-v",    joints: "multi" },
    "pull-h":    { cat: "pull",     pat: "pull-h",    joints: "multi" },
    "pull-v":    { cat: "pull",     pat: "pull-v",    joints: "multi" },
    "core":      { cat: "core",     pat: null,        joints: null },
    "isolation":          { cat: null, pat: "isolation", joints: "single" },
    "isolation-arms":     { cat: "pull", pat: "isolation", joints: "single" },
    "isolation-biceps":   { cat: "pull", pat: "isolation", joints: "single" },
    "isolation-back":     { cat: "pull", pat: "isolation", joints: "single" },
    "isolation-rear-delts":{ cat: "pull", pat: "isolation", joints: "single" },
    "isolation-chest":    { cat: "push", pat: "isolation", joints: "single" },
    "isolation-triceps":  { cat: "push", pat: "isolation", joints: "single" },
    "isolation-shoulders":{ cat: "push", pat: "isolation", joints: "single" },
    "isolation-legs":     { cat: "legs", pat: "isolation", joints: "single" },
    "isolation-quads":    { cat: "legs", pat: "isolation", joints: "single" },
    "isolation-hamstrings":{ cat: "legs", pat: "isolation", joints: "single" },
    "isolation-glutes":   { cat: null, pat: null, joints: null },
    "isolation-calves":   { cat: "legs", pat: "isolation", joints: "single" },
  };
  const c = map[focus] || { cat: null, pat: null, joints: null };

  const levelOrder = { beginner: 0, intermediate: 1, advanced: 2 };
  const userLvl = levelOrder[level] ?? 1;
  const sortByFit = (arr) => {
    arr.sort((a, b) => {
      const da = Math.abs(levelOrder[a.level] - userLvl);
      const db = Math.abs(levelOrder[b.level] - userLvl);
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name);
    });
    return arr;
  };

  const baseFilter = (ex) => exerciseAvailable(ex, equipmentTags) && !used.has(ex.id);

  // Pass 1: strict (category + pattern + joints)
  let candidates = EXERCISES.filter(ex =>
    baseFilter(ex) &&
    (c.cat === null || ex.category === c.cat) &&
    (c.pat === null || ex.pattern === c.pat) &&
    (c.joints === null || ex.joints === c.joints)
  );

  // Refinement for specific isolation focuses → match by primary muscle
  if (focus.startsWith("isolation-") && candidates.length > 0) {
    const tag = focus.replace("isolation-", "");
    const muscleTagMap = {
      biceps: ["biceps"], triceps: ["triceps"], chest: ["chest", "upper chest"],
      shoulders: ["delts", "lateral delts"], "rear-delts": ["rear delts"],
      back: ["upper back", "mid back", "lats"], quads: ["quads"],
      hamstrings: ["hamstrings"], glutes: ["glutes"], calves: ["calves"],
      arms: ["biceps", "triceps"], legs: ["quads", "hamstrings", "calves"],
    };
    const targets = muscleTagMap[tag];
    if (targets) {
      const refined = candidates.filter(ex => ex.primary.some(m => targets.includes(m)));
      if (refined.length) candidates = refined;
    }
  }

  // Pass 2: relax joints constraint (e.g., isolation-quads has nothing → try quad-targeting multi-joint)
  if (candidates.length === 0 && focus.startsWith("isolation-")) {
    const tag = focus.replace("isolation-", "");
    const muscleTagMap = {
      quads: ["quads"], hamstrings: ["hamstrings"], glutes: ["glutes"], calves: ["calves"],
      biceps: ["biceps"], triceps: ["triceps"], chest: ["chest", "upper chest"],
      shoulders: ["delts", "lateral delts"], "rear-delts": ["rear delts"],
      back: ["upper back", "mid back", "lats"],
      arms: ["biceps", "triceps"], legs: ["quads", "hamstrings", "calves"],
    };
    const targets = muscleTagMap[tag];
    if (targets) {
      candidates = EXERCISES.filter(ex =>
        baseFilter(ex) &&
        ex.primary.some(m => targets.includes(m))
      );
    }
  }

  // Pass 3: relax pattern (keep category + joints, drop pattern)
  if (candidates.length === 0 && c.cat) {
    candidates = EXERCISES.filter(ex =>
      baseFilter(ex) &&
      ex.category === c.cat &&
      (c.joints === null || ex.joints === c.joints)
    );
  }

  // Pass 4: relax everything except category
  if (candidates.length === 0 && c.cat) {
    candidates = EXERCISES.filter(ex =>
      baseFilter(ex) &&
      ex.category === c.cat
    );
  }

  // Pass 5: anything available, just to fill the slot
  if (candidates.length === 0) {
    candidates = EXERCISES.filter(baseFilter);
  }

  return sortByFit(candidates)[0] || null;
}

// Determine how many sets & reps to prescribe for a given exercise based on goal & joint type.
function setsRepsForExercise(exercise, protocol, isFirstCompound) {
  const [minSets, maxSets] = protocol.setsPerExercise;
  const [minReps, maxReps] = protocol.repRange;
  // Multi-joint compound at the top of a session gets the higher set count.
  let sets = isFirstCompound ? maxSets : Math.max(minSets, Math.round((minSets + maxSets) / 2));
  // Isolations get slightly higher reps within hypertrophy/efficient ranges.
  let repsLow = minReps;
  let repsHigh = maxReps;
  if (exercise.joints === "single" && (protocol === RESISTANCE_PROTOCOLS.hypertrophy || protocol === RESISTANCE_PROTOCOLS.recomp || protocol === RESISTANCE_PROTOCOLS.efficient)) {
    repsLow = Math.max(repsLow, 10);
    repsHigh = Math.min(repsHigh + 3, 15);
    sets = Math.min(sets, 3);
  }
  return { sets, repRange: [repsLow, repsHigh] };
}

// Build one resistance workout from a template entry.
function buildWorkout(template, protocol, equipmentTags, level) {
  const used = new Set();
  const exercises = [];
  for (let i = 0; i < template.focus.length; i++) {
    const focus = template.focus[i];
    const ex = pickForFocus(focus, equipmentTags, level, used);
    if (!ex) continue;
    used.add(ex.id);
    const isFirstCompound = i === 0 && ex.joints === "multi";
    const sr = setsRepsForExercise(ex, protocol, isFirstCompound);
    exercises.push({
      ...ex,
      sets: sr.sets,
      repRange: sr.repRange,
      restSec: ex.joints === "multi" ? protocol.restSec[1] : protocol.restSec[0],
      loadPctRange: protocol.loadPctRange,
    });
  }
  return {
    id: template.id,
    name: template.name,
    exercises,
    estimatedMinutes: estimateWorkoutMinutes(exercises),
  };
}

function estimateWorkoutMinutes(exercises) {
  const total = exercises.reduce((sum, ex) => {
    const setTime = 45;          // sec per set including the lift itself
    const rest = ex.restSec;
    return sum + ex.sets * (setTime + rest);
  }, 0);
  // Add 8 min for transitions/setup/warm-up across the session.
  return Math.round(total / 60 + 8);
}

// Determine cardio prescription based on goal and time budget.
function buildCardioSessions(profile) {
  const { goal, sessionsPerWeek, minutesPerSession, experience } = profile;
  const sessions = [];

  switch (goal) {
    case "aerobic": {
      // 80/20: mostly zone 2 with one HIIT session.
      sessions.push({ ...CARDIO_PROTOCOLS.norwegian_4x4, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.zone2, instances: 2 });
      sessions.push({ ...CARDIO_PROTOCOLS.recovery, instances: 1 });
      break;
    }
    case "heart": {
      // Levine's prescription
      sessions.push({ ...CARDIO_PROTOCOLS.norwegian_4x4, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.long_endurance, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.zone2, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.recovery, instances: 1 });
      break;
    }
    case "recomp": {
      sessions.push({ ...CARDIO_PROTOCOLS.zone2, instances: 2 });
      sessions.push({ ...CARDIO_PROTOCOLS.norwegian_4x4, instances: 1 });
      break;
    }
    case "hypertrophy": {
      // Less cardio so it doesn't blunt hypertrophy adaptations.
      sessions.push({ ...CARDIO_PROTOCOLS.zone2, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.norwegian_4x4, instances: 1 });
      break;
    }
    case "strength": {
      sessions.push({ ...CARDIO_PROTOCOLS.zone2, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.recovery, instances: 1 });
      break;
    }
    case "efficient":
    default: {
      sessions.push({ ...CARDIO_PROTOCOLS.ten_minute, instances: 1 });
      sessions.push({ ...CARDIO_PROTOCOLS.zone2, instances: 1 });
      break;
    }
  }

  // Always include exercise snacks / VILPA as daily background work.
  sessions.push({ ...CARDIO_PROTOCOLS.exercise_snacks, instances: "daily" });
  sessions.push({ ...CARDIO_PROTOCOLS.vilpa, instances: "throughout the day, every day" });

  return sessions;
}

// Optional add-ons: BFR (advanced), sauna (any level)
function buildAddOns(profile) {
  const addOns = [];
  if (profile.experience === "advanced") {
    addOns.push({
      name: "Blood Flow Restriction (BFR) Training",
      blurb: "Optional advanced technique for arms/legs. Useful when joints are cranky or you want hypertrophy with lighter loads.",
      protocol: [
        "Cuff pressure: 40–50% on arms, 60–80% on legs",
        "Load: 20–50% of 1RM",
        "Reps: 30-15-15-15 across 4 sets, OR sets to failure",
        "Rest 30–60 sec between sets",
        "Don't exceed 10–20 minutes of total cuff time",
        "Use on 1–2 isolation exercises per muscle group, 2–3× per week",
        "Take a 4-week break from BFR every 3 months",
      ],
      caution: "Anyone with cardiovascular disease, clotting issues, or severe hypertension should clear BFR with their doctor first.",
    });
  }
  addOns.push({
    name: "Sauna (post-workout)",
    blurb: "Heat exposure mimics aspects of exercise — emerging evidence for muscle preservation, cardiovascular benefit, and recovery.",
    protocol: [
      "Temperature: 80–90°C / 176–194°F",
      "Duration: 15–30 minutes",
      "Frequency: 1–3× per week minimum (more is fine; 4–7× shows additional benefits)",
      "Timing: within 5–10 minutes after your workout when possible",
      "Hydrate well — you'll lose noticeable fluid",
    ],
    caution: "Build up tolerance gradually. Skip if pregnant or with cardiovascular conditions without doctor sign-off.",
  });
  return addOns;
}

// 12-week progression scaffold (simple & guidance-based, not auto-changing weekly).
function buildProgression(protocol) {
  return [
    { range: "Weeks 1–2",  focus: "Establish form & baseline",
      prescription: `Use the lower end of the load range (${protocol.loadPctRange[0]}% 1RM). Stop sets ${protocol.proximity.includes("3–4") ? "5+ reps" : "3+ reps"} short of failure. The point is owning the movements, not exhaustion.` },
    { range: "Weeks 3–6",  focus: "Build the engine",
      prescription: `Add weight when you hit the top of the rep range with good form on the last set. Aim for the high end of weekly volume (${protocol.weeklySetsPerMuscle[1]} sets/muscle if recovery allows).` },
    { range: "Weeks 7–9",  focus: "Push intensity",
      prescription: `Settle into the upper end of the load range (${protocol.loadPctRange[1]}% 1RM on key compounds). This is when most growth happens — sleep, eat, and recover hard.` },
    { range: "Weeks 10–12",focus: "Peak / consolidate",
      prescription: `Hold loads steady, sharpen execution. Track lifetime PRs on key lifts. After week 12, consider a deload week — drop volume by 40% and load by 10–15% — then start a new cycle with new exercise variations.` },
  ];
}

// Determine which phase of the 12-week cycle a given week belongs to,
// and what the load/effort guidance is for that week.
function getPhaseForWeek(week, protocol) {
  const lo = protocol.loadPctRange[0];
  const hi = protocol.loadPctRange[1];
  const mid = Math.round((lo + hi) / 2);
  const isStrength = protocol === RESISTANCE_PROTOCOLS.strength;

  if (week <= 2) return {
    number: 1, range: "Weeks 1–2", label: "Establish",
    blurb: "Form first. Lower loads, more reps in reserve. Own the movements before chasing weight.",
    loadHint: `${lo}% 1RM (lower end)`,
    rirHint: isStrength ? "5+ reps in reserve" : "3–4 reps in reserve",
    volumeHint: `Hit minimum: ${protocol.weeklySetsPerMuscle[0]} sets/muscle/week`,
    color: "#7B8B6F",
  };
  if (week <= 6) return {
    number: 2, range: "Weeks 3–6", label: "Build",
    blurb: "Add weight when you hit the top of the rep range with good form on the last set. Climb the volume curve.",
    loadHint: `~${mid}% 1RM (mid-range)`,
    rirHint: isStrength ? "3–4 reps in reserve" : "2–3 reps in reserve",
    volumeHint: `Aim for upper end: ${protocol.weeklySetsPerMuscle[1]} sets/muscle/week`,
    color: "#B5462C",
  };
  if (week <= 9) return {
    number: 3, range: "Weeks 7–9", label: "Intensify",
    blurb: "Settle into the upper end of the load range. This is when most of the adaptation happens — sleep, eat, recover.",
    loadHint: `${hi}% 1RM (upper end)`,
    rirHint: isStrength ? "1–2 reps in reserve" : "0–2 reps in reserve",
    volumeHint: `Maintain upper-range volume`,
    color: "#8C3520",
  };
  if (week <= 12) return {
    number: 4, range: "Weeks 10–12", label: "Peak / Consolidate",
    blurb: "Hold loads steady, sharpen execution. Track lifetime PRs. After week 12, take a deload week.",
    loadHint: `${hi}% 1RM`,
    rirHint: isStrength ? "1–2 reps in reserve" : "0–1 reps in reserve",
    volumeHint: `Hold volume; consider deload after this week`,
    color: "#2D4A35",
  };
  // Past week 12 — recommend deload + new cycle
  return {
    number: 5, range: `Week ${week}`, label: "Deload / New Cycle",
    blurb: "You're past the 12-week cycle. Drop volume by ~40% and load by 10–15% for one week, then start a new cycle (rotate exercise variations).",
    loadHint: "Reduce 10–15%",
    rirHint: "5+ reps in reserve",
    volumeHint: "Cut sets by ~40%",
    color: "#6B6258",
  };
}

// Top-level plan generator
function generatePlan(profile) {
  const protocol = RESISTANCE_PROTOCOLS[profile.goal] || RESISTANCE_PROTOCOLS.hypertrophy;
  const equipmentTags = EQUIPMENT_PRESETS[profile.equipment] || EQUIPMENT_PRESETS["full-gym"];
  const split = SPLIT_TEMPLATES[profile.sessionsPerWeek] || SPLIT_TEMPLATES[3];

  const resistanceWorkouts = split.map(t => buildWorkout(t, protocol, equipmentTags, profile.experience));

  // If the user asked for time-efficient + low minutes-per-session, trim each workout's exercises.
  if (profile.goal === "efficient" || profile.minutesPerSession <= 30) {
    resistanceWorkouts.forEach(w => {
      const target = Math.min(w.exercises.length, profile.minutesPerSession <= 30 ? 4 : 5);
      w.exercises = w.exercises.slice(0, target);
      w.estimatedMinutes = estimateWorkoutMinutes(w.exercises);
      w.note = "Trimmed for time-efficient training. Consider supersetting non-competing pairs (e.g., a row + a press) to compress the session further.";
    });
  }

  const cardioSessions = buildCardioSessions({ ...profile, cardioCount: 3 });
  const nutrition = buildNutritionPlan(profile);
  const supplements = buildSupplementPlan(profile);
  const addOns = buildAddOns(profile);
  const progression = buildProgression(protocol);

  // Goal-specific principles + age-aware notes
  const principles = [...protocol.notes];
  if (profile.age >= 60) principles.push(...OLDER_ADULT_ADJUSTMENTS.extraNotes);
  if (profile.experience === "beginner") {
    principles.unshift("Consistency beats optimization right now. Two months of showing up is worth more than the perfect program you abandon.");
  }
  principles.push("Sleep 7–9 hours. It is, mechanically, when growth happens.");
  principles.push("Skip extensive warm-ups and stretching — a few light sets of the actual exercise is enough. Resistance training itself improves flexibility.");

  // Warnings / safety notes
  const warnings = [];
  if (profile.limitations && profile.limitations.trim().length > 0) {
    warnings.push(`You noted: "${profile.limitations}". Substitute or skip any exercise that aggravates this. Machines and cables are usually friendlier on cranky joints than free weights.`);
  }
  if (profile.age >= 70) {
    warnings.push("After 70, the heart's structure no longer responds dramatically to training, but VO₂ max and muscle still do. Lift heavy (with safe form), train cardio consistently, and don't skip the recovery days.");
  }
  if (profile.experience === "beginner" && profile.sessionsPerWeek >= 5) {
    warnings.push("5+ sessions/week as a beginner is ambitious. Most beginners progress just as fast on 3 sessions/week with better recovery — consider scaling back if you feel beat up.");
  }
  if (profile.goal === "recomp" && profile.experience !== "beginner") {
    warnings.push("Body recomposition is hardest for trained, lean individuals. Expect slower progress than beginners report. The key is patience and sleep, not aggressive cuts.");
  }

  return {
    profile,
    protocol,
    resistanceWorkouts,
    cardioSessions,
    nutrition,
    supplements,
    addOns,
    progression,
    principles,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}


/* ============================================================================
   7. UI — DESIGN TOKENS
   --------------------------------------------------------------------------
   Editorial fitness-journal aesthetic.
   Paper-cream background, deep ink, rust accent.
   Display: Fraunces (variable serif). Body/UI: Hanken Grotesk.
   ============================================================================ */

const COLORS = {
  paper: "#F5F1EA",
  paperDeep: "#EDE6D6",
  ink: "#1A1A1A",
  inkSoft: "#3A3530",
  muted: "#6B6258",
  rust: "#B5462C",
  rustDeep: "#8C3520",
  forest: "#2D4A35",
  hairline: "#D9CFB8",
  card: "#FFFFFF",
};

function useGoogleFonts() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector('link[data-htt-fonts]')) return;
    const link1 = document.createElement("link");
    link1.rel = "preconnect";
    link1.href = "https://fonts.googleapis.com";
    link1.setAttribute("data-htt-fonts", "1");
    const link2 = document.createElement("link");
    link2.rel = "preconnect";
    link2.href = "https://fonts.gstatic.com";
    link2.crossOrigin = "anonymous";
    link2.setAttribute("data-htt-fonts", "1");
    const link3 = document.createElement("link");
    link3.rel = "stylesheet";
    link3.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..900,0..100&family=Hanken+Grotesk:wght@300;400;500;600;700&display=swap";
    link3.setAttribute("data-htt-fonts", "1");
    document.head.appendChild(link1);
    document.head.appendChild(link2);
    document.head.appendChild(link3);
  }, []);
}

const FONT_DISPLAY = { fontFamily: '"Fraunces", "Iowan Old Style", Georgia, serif', fontFeatureSettings: '"ss01", "ss02"' };
const FONT_BODY = { fontFamily: '"Hanken Grotesk", -apple-system, system-ui, sans-serif' };
const FONT_TABULAR = { fontFamily: '"Fraunces", Georgia, serif', fontFeatureSettings: '"tnum"', fontVariantNumeric: 'tabular-nums' };

/* ============================================================================
   8. UI — SHARED COMPONENTS
   ============================================================================ */

function PaperFrame({ children }) {
  return (
    <div style={{ background: COLORS.paper, color: COLORS.ink, ...FONT_BODY, minHeight: "100vh" }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, num }) {
  return (
    <div style={{ ...FONT_BODY }} className="flex items-center gap-3 mb-4">
      {num !== undefined && (
        <span style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "13px", fontWeight: 500, letterSpacing: "0.05em" }}>
          {String(num).padStart(2, "0")} —
        </span>
      )}
      <span style={{ color: COLORS.muted, fontSize: "11px", letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
        {children}
      </span>
    </div>
  );
}

function Heading({ children, size = "lg", className = "" }) {
  const sizes = {
    xl: "text-5xl md:text-7xl",
    lg: "text-3xl md:text-5xl",
    md: "text-2xl md:text-3xl",
    sm: "text-xl md:text-2xl",
  };
  return (
    <h1 style={{ ...FONT_DISPLAY, color: COLORS.ink, lineHeight: 1.05, letterSpacing: "-0.02em", fontWeight: 400 }}
        className={`${sizes[size]} ${className}`}>
      {children}
    </h1>
  );
}

function Body({ children, muted = false, className = "" }) {
  return (
    <p style={{ color: muted ? COLORS.muted : COLORS.inkSoft, lineHeight: 1.6, fontSize: "15px" }} className={className}>
      {children}
    </p>
  );
}

function Card({ children, className = "", interactive = false, onClick }) {
  const base = {
    background: COLORS.card,
    border: `1px solid ${COLORS.hairline}`,
    borderRadius: "4px",
    transition: "all 200ms ease",
  };
  return (
    <div
      onClick={onClick}
      style={{
        ...base,
        cursor: interactive ? "pointer" : "default",
      }}
      onMouseEnter={interactive ? (e) => {
        e.currentTarget.style.borderColor = COLORS.ink;
        e.currentTarget.style.transform = "translateY(-2px)";
      } : undefined}
      onMouseLeave={interactive ? (e) => {
        e.currentTarget.style.borderColor = COLORS.hairline;
        e.currentTarget.style.transform = "translateY(0)";
      } : undefined}
      className={className}
    >
      {children}
    </div>
  );
}

function Button({ children, onClick, variant = "primary", icon, disabled, className = "", type = "button" }) {
  const variants = {
    primary: {
      background: disabled ? COLORS.muted : COLORS.ink,
      color: COLORS.paper,
      border: `1px solid ${disabled ? COLORS.muted : COLORS.ink}`,
    },
    accent: {
      background: disabled ? COLORS.muted : COLORS.rust,
      color: "#fff",
      border: `1px solid ${disabled ? COLORS.muted : COLORS.rust}`,
    },
    ghost: {
      background: "transparent",
      color: COLORS.ink,
      border: `1px solid ${COLORS.ink}`,
    },
    quiet: {
      background: "transparent",
      color: COLORS.muted,
      border: `1px solid transparent`,
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...variants[variant],
        ...FONT_BODY,
        padding: "12px 22px",
        borderRadius: "2px",
        fontSize: "13px",
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 200ms ease",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (variant === "primary") { e.currentTarget.style.background = COLORS.rust; e.currentTarget.style.borderColor = COLORS.rust; }
        if (variant === "ghost") { e.currentTarget.style.background = COLORS.ink; e.currentTarget.style.color = COLORS.paper; }
        if (variant === "quiet") { e.currentTarget.style.color = COLORS.ink; }
        if (variant === "accent") { e.currentTarget.style.background = COLORS.rustDeep; e.currentTarget.style.borderColor = COLORS.rustDeep; }
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        Object.assign(e.currentTarget.style, variants[variant]);
      }}
      className={className}
    >
      {children}
      {icon}
    </button>
  );
}

function HairlineDivider({ vertical = false, className = "" }) {
  return (
    <div className={className} style={{
      background: COLORS.hairline,
      ...(vertical ? { width: "1px", height: "100%" } : { height: "1px", width: "100%" }),
    }} />
  );
}

function Badge({ children, color = COLORS.rust }) {
  return (
    <span style={{
      ...FONT_BODY,
      display: "inline-block",
      padding: "3px 10px",
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      border: `1px solid ${color}`,
      color: color,
      borderRadius: "2px",
    }}>{children}</span>
  );
}

function StatBlock({ label, value, unit, accent = false }) {
  return (
    <div>
      <div style={{ color: COLORS.muted, fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ ...FONT_TABULAR, color: accent ? COLORS.rust : COLORS.ink, fontSize: "32px", fontWeight: 400, lineHeight: 1 }}>
        {value}{unit && <span style={{ fontSize: "16px", color: COLORS.muted, marginLeft: "4px" }}>{unit}</span>}
      </div>
    </div>
  );
}

function ChoiceCard({ title, description, selected, onClick, badge }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? COLORS.ink : COLORS.card,
        color: selected ? COLORS.paper : COLORS.ink,
        border: `1px solid ${selected ? COLORS.ink : COLORS.hairline}`,
        padding: "20px 22px",
        cursor: "pointer",
        borderRadius: "3px",
        transition: "all 180ms ease",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = COLORS.inkSoft;
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = COLORS.hairline;
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div style={{ ...FONT_DISPLAY, fontSize: "20px", fontWeight: 500, marginBottom: 6, letterSpacing: "-0.01em" }}>
            {title}
          </div>
          {description && (
            <div style={{ fontSize: "13px", color: selected ? "rgba(245,241,234,0.7)" : COLORS.muted, lineHeight: 1.5 }}>
              {description}
            </div>
          )}
        </div>
        {badge && <span style={{ fontSize: "10px", color: selected ? COLORS.paper : COLORS.rust, letterSpacing: "0.1em" }}>{badge}</span>}
        {selected && <Check size={18} style={{ flexShrink: 0, marginTop: 2 }} />}
      </div>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, suffix }) {
  // Local string state so users can type freely (including partial states like "" or "1.")
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (v === "" || v === "-" || v === ".") return; // allow partial typing
    const n = parseFloat(v);
    if (!isNaN(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onChange(clamped);
    }
  };
  const handleBlur = () => {
    const n = parseFloat(text);
    if (isNaN(n)) {
      setText(String(value)); // snap back
    } else {
      const clamped = Math.max(min, Math.min(max, n));
      setText(String(clamped));
      onChange(clamped);
    }
  };

  return (
    <div className="flex items-center gap-1" style={{
      border: `1px solid ${COLORS.hairline}`,
      borderRadius: "3px",
      padding: "4px",
      background: COLORS.card,
      width: "fit-content",
    }}>
      <button type="button" onClick={decrement} aria-label="Decrease" style={{
        width: 36, height: 36, borderRadius: "2px", background: COLORS.paper,
        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: COLORS.muted,
      }}>
        <Minus size={14} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        style={{
          ...FONT_TABULAR,
          width: 72,
          textAlign: "center",
          fontSize: "20px",
          background: "transparent",
          border: "none",
          outline: "none",
          color: COLORS.ink,
          padding: "8px 4px",
        }}
      />
      {suffix && <span style={{ fontSize: "12px", color: COLORS.muted, paddingRight: 6, ...FONT_BODY }}>{suffix}</span>}
      <button type="button" onClick={increment} aria-label="Increase" style={{
        width: 36, height: 36, borderRadius: "2px", background: COLORS.paper,
        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        color: COLORS.muted,
      }}>
        <Plus size={14} />
      </button>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, multiline = false }) {
  const Tag = multiline ? "textarea" : "input";
  return (
    <Tag
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={multiline ? 3 : undefined}
      style={{
        ...FONT_BODY,
        width: "100%",
        background: COLORS.card,
        border: `1px solid ${COLORS.hairline}`,
        borderRadius: "3px",
        padding: "12px 14px",
        fontSize: "15px",
        color: COLORS.ink,
        outline: "none",
        resize: multiline ? "vertical" : "none",
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = COLORS.ink; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = COLORS.hairline; }}
    />
  );
}

function WeekSelector({ currentWeek, onChange, protocol, compact = false }) {
  const phase = getPhaseForWeek(currentWeek, protocol);
  const dec = () => onChange(Math.max(1, currentWeek - 1));
  const inc = () => onChange(Math.min(20, currentWeek + 1));
  return (
    <div className="flex items-center gap-2" style={{
      border: `1px solid ${COLORS.hairline}`,
      borderRadius: "3px",
      padding: "4px 4px 4px 12px",
      background: COLORS.card,
    }}>
      <button onClick={dec} aria-label="Previous week" style={navBtn}>
        <ChevronLeft size={14} />
      </button>
      <div style={{ display: "flex", flexDirection: compact ? "row" : "column", alignItems: compact ? "center" : "flex-start", gap: compact ? 8 : 0, lineHeight: 1.1 }}>
        <span style={{ ...FONT_TABULAR, fontSize: compact ? "13px" : "14px", color: COLORS.ink, fontWeight: 500 }}>
          Week {String(currentWeek).padStart(2, "0")} <span style={{ color: COLORS.muted }}>of 12</span>
        </span>
        <span style={{ ...FONT_BODY, fontSize: "10px", color: phase.color, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
          {phase.label}
        </span>
      </div>
      <button onClick={inc} aria-label="Next week" style={navBtn}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

const navBtn = {
  width: 32, height: 32, borderRadius: "2px", background: COLORS.paper,
  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  color: COLORS.muted,
};

function PhaseContextCard({ phase, onJumpProgression }) {
  return (
    <Card>
      <div className="p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div style={{ ...FONT_TABULAR, fontSize: "11px", color: phase.color, letterSpacing: "0.18em", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>
              Phase {phase.number} · {phase.range}
            </div>
            <div style={{ ...FONT_DISPLAY, fontSize: "24px", color: COLORS.ink, letterSpacing: "-0.01em" }}>
              {phase.label}
            </div>
          </div>
          {onJumpProgression && (
            <button onClick={onJumpProgression} style={{
              ...FONT_BODY, fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em",
              textTransform: "uppercase", fontWeight: 600, background: "transparent",
              border: `1px solid ${COLORS.hairline}`, padding: "6px 10px", borderRadius: "2px", cursor: "pointer",
            }}>
              See full progression
            </button>
          )}
        </div>
        <Body className="text-sm mb-4">{phase.blurb}</Body>
        <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 14 }}>
          <div className="grid md:grid-cols-3 gap-4">
            <PhaseHint label="This week's load" value={phase.loadHint} />
            <PhaseHint label="This week's effort" value={phase.rirHint} />
            <PhaseHint label="Volume target" value={phase.volumeHint} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function PhaseHint({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...FONT_BODY, fontSize: "14px", color: COLORS.ink, fontWeight: 500 }}>{value}</div>
    </div>
  );
}


/* ============================================================================
   9. UI — SCREENS
   ============================================================================ */

// ──────────────────── WELCOME SCREEN ────────────────────

function WelcomeScreen({ onStart, hasExistingPlan, onResume }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLORS.paper }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 md:px-12 py-6">
        <div className="flex items-center gap-3">
          <div style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "13px", letterSpacing: "0.1em" }}>
            EVIDENCE — BASED
          </div>
        </div>
        <div style={{ ...FONT_BODY, fontSize: "11px", color: COLORS.muted, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600 }}>
          A Training Companion
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 px-6 md:px-12 py-8 md:py-16 flex flex-col justify-center max-w-6xl mx-auto w-full">
        <div className="grid md:grid-cols-12 gap-8 md:gap-12 items-end">
          <div className="md:col-span-8">
            <div style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "12px", letterSpacing: "0.2em", marginBottom: 24 }}>
              VOL. 01 / TRAINING
            </div>
            <Heading size="xl" className="mb-6">
              How to <em style={{ fontStyle: "italic", color: COLORS.rust }}>train</em>,<br/>
              according to<br/>
              the experts.
            </Heading>
            <Body className="max-w-xl mt-6 text-lg" muted>
              A personalized plan distilled from FoundMyFitness interviews with
              Schoenfeld, Norton, Phillips, Gibala, Levine, van Loon, and McGlory —
              built around your goal, schedule, and equipment.
            </Body>
          </div>
          <div className="md:col-span-4 flex md:justify-end">
            <div style={{ ...FONT_TABULAR, color: COLORS.ink, fontSize: "84px", lineHeight: 1, fontWeight: 300, opacity: 0.08 }}>
              01
            </div>
          </div>
        </div>

        <div className="mt-16 md:mt-24 grid md:grid-cols-3 gap-6 md:gap-8">
          {[
            { num: "01", label: "Resistance Training", text: "Strength, hypertrophy, or recomp protocols matched to your sessions and equipment." },
            { num: "02", label: "Cardio Architecture", text: "HIIT, Norwegian 4×4, Tabata, zone 2, exercise snacks — selected to fit your goal." },
            { num: "03", label: "Nutrition & Supplements", text: "Protein targets, calorie guidance, creatine and omega-3 protocols by age and goal." },
          ].map((b, i) => (
            <div key={i} style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 20 }}>
              <div style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "13px", letterSpacing: "0.08em", marginBottom: 8 }}>
                {b.num}
              </div>
              <div style={{ ...FONT_DISPLAY, fontSize: "20px", marginBottom: 8 }}>{b.label}</div>
              <Body muted className="text-sm">{b.text}</Body>
            </div>
          ))}
        </div>

        <div className="mt-12 md:mt-16 flex flex-wrap gap-4 items-center">
          <Button onClick={onStart} variant="primary" icon={<ArrowRight size={16} />}>
            {hasExistingPlan ? "Start a new plan" : "Begin"}
          </Button>
          {hasExistingPlan && (
            <Button onClick={onResume} variant="ghost" icon={<ChevronRight size={16} />}>
              Resume current plan
            </Button>
          )}
        </div>
      </main>

      <footer className="px-6 md:px-12 py-6" style={{ borderTop: `1px solid ${COLORS.hairline}` }}>
        <div style={{ fontSize: "11px", color: COLORS.muted, letterSpacing: "0.05em" }}>
          Educational use only. Not medical advice. If you have a heart condition or are returning from an injury, talk to your doctor before starting any program.
        </div>
      </footer>
    </div>
  );
}

// ──────────────────── SETUP — multi-step form ────────────────────

const SETUP_STEPS = [
  { key: "goal",       title: "Choose your focus" },
  { key: "experience", title: "Training experience" },
  { key: "schedule",   title: "Schedule" },
  { key: "equipment",  title: "Equipment available" },
  { key: "about",      title: "About you" },
  { key: "limits",     title: "Anything to work around?" },
  { key: "review",     title: "Review and generate" },
];

function SetupScreen({ initialProfile, onComplete, onCancel }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [profile, setProfile] = useState(initialProfile || {
    goal: "",
    experience: "",
    sessionsPerWeek: 3,
    minutesPerSession: 60,
    equipment: "",
    age: 35,
    sex: "",
    weightKg: 75,
    heightCm: 170,
    weightUnit: "kg",
    heightUnit: "cm",
    limitations: "",
  });

  const update = (patch) => setProfile(p => ({ ...p, ...patch }));
  const step = SETUP_STEPS[stepIdx];

  const canAdvance = () => {
    switch (step.key) {
      case "goal":       return !!profile.goal;
      case "experience": return !!profile.experience;
      case "schedule":   return profile.sessionsPerWeek > 0 && profile.minutesPerSession > 0;
      case "equipment":  return !!profile.equipment;
      case "about":      return !!profile.sex && profile.age > 0 && profile.weightKg > 0;
      case "limits":     return true;
      case "review":     return true;
      default:           return true;
    }
  };

  const next = () => {
    if (stepIdx < SETUP_STEPS.length - 1) setStepIdx(stepIdx + 1);
    else onComplete(profile);
  };
  const back = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else onCancel();
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLORS.paper }}>
      <header className="flex items-center justify-between px-6 md:px-12 py-6" style={{ borderBottom: `1px solid ${COLORS.hairline}` }}>
        <button onClick={back} style={{ ...FONT_BODY, fontSize: "12px", letterSpacing: "0.1em", color: COLORS.muted, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", border: "none", background: "transparent" }}>
          <ChevronLeft size={14} /> Back
        </button>
        <div style={{ ...FONT_TABULAR, fontSize: "12px", color: COLORS.muted, letterSpacing: "0.05em" }}>
          Step {String(stepIdx + 1).padStart(2, "0")} <span style={{ color: COLORS.hairline }}>/</span> {String(SETUP_STEPS.length).padStart(2, "0")}
        </div>
      </header>

      {/* Progress hairline */}
      <div style={{ height: "2px", background: COLORS.hairline, position: "relative" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          background: COLORS.rust,
          width: `${((stepIdx + 1) / SETUP_STEPS.length) * 100}%`,
          transition: "width 320ms ease",
        }} />
      </div>

      <main className="flex-1 px-6 md:px-12 py-12 md:py-20 max-w-3xl mx-auto w-full">
        <SectionLabel num={stepIdx + 1}>{step.title}</SectionLabel>

        {step.key === "goal" && <GoalStep profile={profile} update={update} />}
        {step.key === "experience" && <ExperienceStep profile={profile} update={update} />}
        {step.key === "schedule" && <ScheduleStep profile={profile} update={update} />}
        {step.key === "equipment" && <EquipmentStep profile={profile} update={update} />}
        {step.key === "about" && <AboutStep profile={profile} update={update} />}
        {step.key === "limits" && <LimitsStep profile={profile} update={update} />}
        {step.key === "review" && <ReviewStep profile={profile} />}

        <div className="mt-12 flex items-center gap-4">
          <Button onClick={next} variant="primary" disabled={!canAdvance()} icon={<ArrowRight size={16} />}>
            {stepIdx === SETUP_STEPS.length - 1 ? "Generate plan" : "Continue"}
          </Button>
          {stepIdx > 0 && <Button onClick={back} variant="quiet">Back</Button>}
        </div>
      </main>
    </div>
  );
}

// ── Step components ──

function GoalStep({ profile, update }) {
  const goals = [
    { id: "strength",    title: "Muscle strength", desc: "Heavy loads, low reps. Get stronger at the big lifts." },
    { id: "hypertrophy", title: "Muscle hypertrophy", desc: "Build size. Moderate loads, more volume." },
    { id: "recomp",      title: "Body recomposition", desc: "Lose fat and gain muscle simultaneously. High protein, modest deficit." },
    { id: "aerobic",     title: "Aerobic fitness / VO₂ max", desc: "Maximize cardiorespiratory fitness — one of the best predictors of longevity." },
    { id: "heart",       title: "Heart health", desc: "Dr. Benjamin Levine's protocol for a youthful cardiovascular system." },
    { id: "efficient",   title: "Time-efficient general fitness", desc: "Strong, fit, healthy. Minimum hours per week." },
  ];
  return (
    <div>
      <Heading size="lg" className="mb-3">What's the focus?</Heading>
      <Body muted className="mb-10">Pick one. You can regenerate later if your goal changes.</Body>
      <div className="grid md:grid-cols-2 gap-3">
        {goals.map(g => (
          <ChoiceCard key={g.id} title={g.title} description={g.desc}
            selected={profile.goal === g.id} onClick={() => update({ goal: g.id })} />
        ))}
      </div>
    </div>
  );
}

function ExperienceStep({ profile, update }) {
  const opts = [
    { id: "beginner",     title: "Beginner",     desc: "Less than a year of consistent training, or returning after a long break." },
    { id: "intermediate", title: "Intermediate", desc: "1–3+ years of consistent training. Comfortable with the major lifts." },
    { id: "advanced",     title: "Advanced",     desc: "Many years of training. Compete or train near competitive levels." },
  ];
  return (
    <div>
      <Heading size="lg" className="mb-3">Where are you now?</Heading>
      <Body muted className="mb-10">Be honest — this calibrates volume, intensity, and proximity-to-failure.</Body>
      <div className="space-y-3">
        {opts.map(o => (
          <ChoiceCard key={o.id} title={o.title} description={o.desc}
            selected={profile.experience === o.id} onClick={() => update({ experience: o.id })} />
        ))}
      </div>
    </div>
  );
}

function ScheduleStep({ profile, update }) {
  return (
    <div>
      <Heading size="lg" className="mb-3">How much time?</Heading>
      <Body muted className="mb-10">Resistance training sessions per week, and minutes you have for each session.</Body>
      <div className="space-y-10">
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", color: COLORS.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>
            Resistance Sessions per Week
          </div>
          <NumberInput value={profile.sessionsPerWeek}
            onChange={(v) => update({ sessionsPerWeek: v })} min={2} max={6} suffix="/wk" />
          <Body muted className="mt-3 text-sm">2 sessions covers full-body. 3–4 splits upper/lower well. 5–6 is a push/pull/legs split.</Body>
        </div>
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", color: COLORS.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 16 }}>
            Minutes Available per Session
          </div>
          <NumberInput value={profile.minutesPerSession}
            onChange={(v) => update({ minutesPerSession: v })} min={20} max={120} step={5} suffix="min" />
          <Body muted className="mt-3 text-sm">Under 30 min triggers a time-efficient build (fewer exercises, supersets-friendly).</Body>
        </div>
      </div>
    </div>
  );
}

function EquipmentStep({ profile, update }) {
  const opts = [
    { id: "full-gym",   title: "Full gym",   desc: "Barbell, dumbbells, rack, bench, cables, machines, pull-up bar." },
    { id: "home-gym",   title: "Home setup", desc: "Dumbbells, bench, pull-up bar, kettlebell. No barbell or machines." },
    { id: "minimal",    title: "Minimal",    desc: "A pair of dumbbells and bands. No bench." },
    { id: "bodyweight", title: "Bodyweight", desc: "Just your body and a pull-up bar (or sturdy door frame)." },
  ];
  return (
    <div>
      <Heading size="lg" className="mb-3">What do you have access to?</Heading>
      <Body muted className="mb-10">The plan generator picks exercises that match — no machines you don't own.</Body>
      <div className="grid md:grid-cols-2 gap-3">
        {opts.map(o => (
          <ChoiceCard key={o.id} title={o.title} description={o.desc}
            selected={profile.equipment === o.id} onClick={() => update({ equipment: o.id })} />
        ))}
      </div>
    </div>
  );
}

function AboutStep({ profile, update }) {
  const lbToKg = (lb) => Math.round((lb / 2.20462) * 10) / 10;
  const kgToLb = (kg) => Math.round(kg * 2.20462);
  const inToCm = (inches) => Math.round(inches * 2.54);
  const cmToIn = (cm) => Math.round(cm / 2.54);

  return (
    <div>
      <Heading size="lg" className="mb-3">A few more things</Heading>
      <Body muted className="mb-10">Used for protein, calorie, and supplement calculations. Stays on your device.</Body>

      <div className="space-y-8">
        {/* Sex */}
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", color: COLORS.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
            Biological sex (for calorie / protein math)
          </div>
          <div className="flex gap-3">
            {["male", "female"].map(s => (
              <button key={s} onClick={() => update({ sex: s })}
                style={{
                  ...FONT_BODY,
                  padding: "12px 24px",
                  background: profile.sex === s ? COLORS.ink : COLORS.card,
                  color: profile.sex === s ? COLORS.paper : COLORS.ink,
                  border: `1px solid ${profile.sex === s ? COLORS.ink : COLORS.hairline}`,
                  borderRadius: "3px", cursor: "pointer",
                  textTransform: "capitalize", fontSize: "14px",
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Age */}
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", color: COLORS.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
            Age
          </div>
          <NumberInput value={profile.age} onChange={(v) => update({ age: v })} min={16} max={95} suffix="yrs" />
          {profile.age >= 60 && <Body muted className="mt-3 text-sm" style={{ color: COLORS.rust }}>The plan will adjust protein distribution and recovery cues for older adults.</Body>}
        </div>

        {/* Weight */}
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", color: COLORS.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
            Bodyweight
          </div>
          <div className="flex items-center gap-4">
            {profile.weightUnit === "kg" ? (
              <NumberInput value={profile.weightKg} onChange={(v) => update({ weightKg: v })} min={35} max={200} suffix="kg" />
            ) : (
              <NumberInput
                value={kgToLb(profile.weightKg)}
                onChange={(v) => update({ weightKg: lbToKg(v) })}
                min={80} max={440} step={1} suffix="lb" />
            )}
            <button onClick={() => update({ weightUnit: profile.weightUnit === "kg" ? "lb" : "kg" })}
              style={{ ...FONT_BODY, fontSize: "12px", color: COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: `1px solid ${COLORS.hairline}`, padding: "8px 14px", borderRadius: "3px", cursor: "pointer" }}>
              Switch to {profile.weightUnit === "kg" ? "lb" : "kg"}
            </button>
          </div>
        </div>

        {/* Height */}
        <div>
          <div style={{ fontSize: "12px", letterSpacing: "0.16em", color: COLORS.muted, textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
            Height (for calorie estimate)
          </div>
          <div className="flex items-center gap-4">
            {profile.heightUnit === "cm" ? (
              <NumberInput value={profile.heightCm} onChange={(v) => update({ heightCm: v })} min={140} max={220} suffix="cm" />
            ) : (
              <NumberInput
                value={cmToIn(profile.heightCm)}
                onChange={(v) => update({ heightCm: inToCm(v) })}
                min={55} max={87} step={1} suffix="in" />
            )}
            <button onClick={() => update({ heightUnit: profile.heightUnit === "cm" ? "in" : "cm" })}
              style={{ ...FONT_BODY, fontSize: "12px", color: COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: `1px solid ${COLORS.hairline}`, padding: "8px 14px", borderRadius: "3px", cursor: "pointer" }}>
              Switch to {profile.heightUnit === "cm" ? "in" : "cm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LimitsStep({ profile, update }) {
  return (
    <div>
      <Heading size="lg" className="mb-3">Anything to work around?</Heading>
      <Body muted className="mb-10">Old injuries, a cranky knee or shoulder, lower-back history — anything you'd flag to a coach.</Body>
      <TextInput
        value={profile.limitations}
        onChange={(v) => update({ limitations: v })}
        placeholder="e.g., right shoulder impingement, prefer machines over barbell for squats…"
        multiline
      />
      <Body muted className="mt-4 text-sm">Optional. The plan will surface this as a reminder in the warnings panel and you can substitute exercises freely.</Body>
    </div>
  );
}

function ReviewStep({ profile }) {
  const goalLabel = RESISTANCE_PROTOCOLS[profile.goal]?.name || profile.goal;
  return (
    <div>
      <Heading size="lg" className="mb-3">Ready to generate</Heading>
      <Body muted className="mb-10">A quick summary. You can edit anything by going back.</Body>
      <Card>
        <div className="p-6 grid md:grid-cols-2 gap-y-5 gap-x-8">
          <ReviewRow label="Goal" value={goalLabel} />
          <ReviewRow label="Experience" value={profile.experience} />
          <ReviewRow label="Sessions per week" value={`${profile.sessionsPerWeek}`} />
          <ReviewRow label="Time per session" value={`${profile.minutesPerSession} min`} />
          <ReviewRow label="Equipment" value={profile.equipment} />
          <ReviewRow label="Age" value={`${profile.age} yrs`} />
          <ReviewRow label="Bodyweight" value={profile.weightUnit === "kg" ? `${profile.weightKg} kg` : `${Math.round(profile.weightKg * 2.20462)} lb`} />
          <ReviewRow label="Height" value={profile.heightUnit === "cm" ? `${profile.heightCm} cm` : `${Math.round(profile.heightCm / 2.54)} in`} />
          {profile.limitations && (
            <div className="md:col-span-2">
              <ReviewRow label="Limitations" value={profile.limitations} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...FONT_DISPLAY, fontSize: "18px", color: COLORS.ink, textTransform: "capitalize" }}>
        {value}
      </div>
    </div>
  );
}


// ──────────────────── PLAN VIEW (tabbed) ────────────────────

const PLAN_TABS = [
  { key: "overview",     label: "Overview",     icon: BookOpen },
  { key: "workouts",     label: "Workouts",     icon: Dumbbell },
  { key: "cardio",       label: "Cardio",       icon: Heart },
  { key: "nutrition",    label: "Nutrition",    icon: Apple },
  { key: "supplements",  label: "Supplements",  icon: Pill },
  { key: "progression",  label: "Progression",  icon: TrendingUp },
  { key: "principles",   label: "Principles",   icon: Sparkles },
];

function PlanScreen({ plan, onOpenWorkout, onEditProfile, onResetAll, logs, currentWeek, onChangeWeek, cardioLogs, onSaveCardioLog, checklist, onChecklistChange }) {
  const [tab, setTab] = useState("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const goalLabel = plan.protocol.name;
  const phase = getPhaseForWeek(currentWeek, plan.protocol);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLORS.paper }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${COLORS.hairline}`, background: COLORS.paper, position: "sticky", top: 0, zIndex: 20 }}>
        <div className="px-6 md:px-12 py-4 md:py-5 flex items-center justify-between gap-4 max-w-6xl mx-auto w-full flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "11px", letterSpacing: "0.18em", whiteSpace: "nowrap" }}>
              YOUR PLAN —
            </div>
            <div style={{ ...FONT_DISPLAY, fontSize: "18px", color: COLORS.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{goalLabel}</div>
          </div>
          <div className="flex items-center gap-3">
            <WeekSelector currentWeek={currentWeek} onChange={onChangeWeek} protocol={plan.protocol} compact />
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Settings"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 8, color: COLORS.muted }}>
                <Settings size={18} />
              </button>
              {menuOpen && (
                <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 8, background: COLORS.card, border: `1px solid ${COLORS.hairline}`, borderRadius: "3px", minWidth: 220, zIndex: 30, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
                  <button onClick={() => { setMenuOpen(false); onEditProfile(); }} style={menuItemStyle}>
                    <Edit2 size={14} /> Edit profile / regenerate
                  </button>
                  <HairlineDivider />
                  <button onClick={() => { setMenuOpen(false); if (window.confirm("Reset everything? This will delete your profile, plan, and all logged workouts.")) onResetAll(); }}
                    style={{ ...menuItemStyle, color: COLORS.rust }}>
                    <Trash2 size={14} /> Reset all data
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 md:px-12 max-w-6xl mx-auto w-full overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
          <div className="flex gap-1 pb-0">
            {PLAN_TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  ...FONT_BODY,
                  padding: "12px 18px",
                  border: "none",
                  background: "transparent",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: active ? COLORS.ink : COLORS.muted,
                  borderBottom: `2px solid ${active ? COLORS.ink : "transparent"}`,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  whiteSpace: "nowrap",
                  transition: "all 200ms ease",
                }}>
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 md:px-12 py-10 md:py-16 max-w-6xl mx-auto w-full">
        {tab === "overview"     && <OverviewTab plan={plan} logs={logs} onOpenWorkout={onOpenWorkout} onJumpTab={setTab} phase={phase} currentWeek={currentWeek} checklist={checklist} onChecklistChange={onChecklistChange} />}
        {tab === "workouts"     && <WorkoutsTab plan={plan} logs={logs} onOpenWorkout={onOpenWorkout} phase={phase} currentWeek={currentWeek} onJumpTab={setTab} />}
        {tab === "cardio"       && <CardioTab plan={plan} cardioLogs={cardioLogs} onSaveCardioLog={onSaveCardioLog} currentWeek={currentWeek} />}
        {tab === "nutrition"    && <NutritionTab plan={plan} />}
        {tab === "supplements"  && <SupplementsTab plan={plan} />}
        {tab === "progression"  && <ProgressionTab plan={plan} currentWeek={currentWeek} onChangeWeek={onChangeWeek} />}
        {tab === "principles"   && <PrinciplesTab plan={plan} />}
      </main>
    </div>
  );
}

const menuItemStyle = {
  ...FONT_BODY,
  width: "100%",
  padding: "12px 16px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "13px",
  color: COLORS.ink,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

// ── OVERVIEW TAB ──

function OverviewTab({ plan, logs, onOpenWorkout, onJumpTab, phase, currentWeek, checklist, onChecklistChange }) {
  const totalSetsPerWeek = plan.resistanceWorkouts.reduce((sum, w) => sum + w.exercises.reduce((s, e) => s + e.sets, 0), 0);
  const cardioMinutes = plan.cardioSessions
    .filter(c => typeof c.instances === "number")
    .reduce((sum, c) => sum + (c.duration * c.instances), 0);

  return (
    <div>
      <SectionLabel num={1}>Your Weekly Architecture</SectionLabel>
      <Heading size="lg" className="mb-3">{plan.protocol.name}</Heading>
      <Body muted className="max-w-2xl mb-12">{plan.protocol.blurb}</Body>

      {/* Daily Checklist — most actionable thing to put first */}
      <div className="mb-12">
        <DailyChecklist
          profile={plan.profile}
          checklist={checklist}
          onChange={onChecklistChange}
        />
      </div>

      {/* Phase context for current week */}
      <div className="mb-12">
        <PhaseContextCard phase={phase} onJumpProgression={() => onJumpTab("progression")} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12 mb-16" style={{ borderTop: `1px solid ${COLORS.hairline}`, borderBottom: `1px solid ${COLORS.hairline}`, padding: "32px 0" }}>
        <StatBlock label="Resistance" value={plan.resistanceWorkouts.length} unit="/wk" accent />
        <StatBlock label="Cardio" value={plan.cardioSessions.filter(c => typeof c.instances === "number").reduce((s,c) => s + c.instances, 0)} unit="/wk" accent />
        <StatBlock label="Total Sets" value={totalSetsPerWeek} unit="/wk" />
        <StatBlock label="Cardio Min" value={cardioMinutes} unit="/wk" />
      </div>

      {/* Warnings */}
      {plan.warnings.length > 0 && (
        <Card className="mb-12">
          <div className="p-6">
            <div style={{ ...FONT_TABULAR, fontSize: "11px", color: COLORS.rust, letterSpacing: "0.18em", marginBottom: 12, textTransform: "uppercase" }}>
              Notes for you
            </div>
            <ul className="space-y-3">
              {plan.warnings.map((w, i) => (
                <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Info size={14} style={{ color: COLORS.rust, marginTop: 4, flexShrink: 0 }} />
                  <Body className="text-sm">{w}</Body>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Quick links */}
      <SectionLabel num={2}>This Week At A Glance</SectionLabel>
      <div className="grid md:grid-cols-2 gap-3 mb-16">
        <Card interactive onClick={() => onJumpTab("workouts")}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <Dumbbell size={18} style={{ color: COLORS.rust }} />
              <div style={{ ...FONT_DISPLAY, fontSize: "20px" }}>Resistance Workouts</div>
            </div>
            <Body muted className="text-sm mb-4">{plan.resistanceWorkouts.length} sessions to complete this week, in any order.</Body>
            <div className="space-y-1">
              {plan.resistanceWorkouts.map(w => {
                const completed = logs.filter(l => l.workoutId === w.id && isThisWeek(l.date)).length;
                return (
                  <div key={w.id} className="flex items-center justify-between" style={{ padding: "8px 0", borderTop: `1px dashed ${COLORS.hairline}` }}>
                    <span style={{ fontSize: "14px" }}>{w.name}</span>
                    <span style={{ ...FONT_TABULAR, fontSize: "13px", color: completed > 0 ? COLORS.forest : COLORS.muted }}>
                      {completed > 0 ? `✓ ${completed}` : `${w.exercises.length} exercises · ~${w.estimatedMinutes} min`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <span style={{ fontSize: "11px", color: COLORS.rust, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
                Open workouts →
              </span>
            </div>
          </div>
        </Card>

        <Card interactive onClick={() => onJumpTab("cardio")}>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <Heart size={18} style={{ color: COLORS.rust }} />
              <div style={{ ...FONT_DISPLAY, fontSize: "20px" }}>Cardio Sessions</div>
            </div>
            <Body muted className="text-sm mb-4">Mix of intensities tuned to your goal.</Body>
            <div className="space-y-1">
              {plan.cardioSessions.filter(c => typeof c.instances === "number").map(c => (
                <div key={c.id} className="flex items-center justify-between" style={{ padding: "8px 0", borderTop: `1px dashed ${COLORS.hairline}` }}>
                  <span style={{ fontSize: "14px" }}>{c.name}</span>
                  <span style={{ ...FONT_TABULAR, fontSize: "13px", color: COLORS.muted }}>
                    {c.instances}× · {c.duration} min
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <span style={{ fontSize: "11px", color: COLORS.rust, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
                Open cardio →
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6">
          <div style={{ ...FONT_TABULAR, fontSize: "11px", color: COLORS.rust, letterSpacing: "0.18em", marginBottom: 12, textTransform: "uppercase" }}>
            One thing to remember
          </div>
          <Body className="text-base italic" style={FONT_DISPLAY}>
            "Consistency is the biggest lever you have. It's not about being perfect — it's about showing up and doing the work."
          </Body>
          <Body muted className="text-sm mt-3">— Dr. Layne Norton</Body>
        </div>
      </Card>
    </div>
  );
}

function isThisWeek(isoDate) {
  const d = new Date(isoDate);
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return d >= sevenDaysAgo && d <= now;
}

// ── WORKOUTS TAB ──

function WorkoutsTab({ plan, logs, onOpenWorkout, phase, currentWeek, onJumpTab }) {
  return (
    <div>
      <SectionLabel num={1}>Resistance Workouts</SectionLabel>
      <Heading size="lg" className="mb-3">Week {String(currentWeek).padStart(2, "0")}</Heading>
      <Body muted className="max-w-2xl mb-8">
        Tap any workout to open it. Log sets and weights as you go — past performance shows up next time so you can progress.
      </Body>

      <div className="mb-10">
        <PhaseContextCard phase={phase} onJumpProgression={onJumpTab ? () => onJumpTab("progression") : null} />
      </div>

      {/* Protocol summary card */}
      <Card className="mb-10">
        <div className="p-6 grid md:grid-cols-4 gap-6">
          <ProtocolStat label="Load" value={`${plan.protocol.loadPctRange[0]}–${plan.protocol.loadPctRange[1]}%`} unit="of 1RM" />
          <ProtocolStat label="Reps" value={`${plan.protocol.repRange[0]}–${plan.protocol.repRange[1]}`} unit="per set" />
          <ProtocolStat label="Rest" value={`${Math.round(plan.protocol.restSec[0]/60)}–${Math.round(plan.protocol.restSec[1]/60)}`} unit="min" />
          <ProtocolStat label="Volume" value={`${plan.protocol.weeklySetsPerMuscle[0]}–${plan.protocol.weeklySetsPerMuscle[1]}`} unit="sets/muscle/wk" />
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.hairline}`, padding: "16px 24px" }}>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Tempo</div>
              <Body className="text-sm">{plan.protocol.tempo}</Body>
            </div>
            <div>
              <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Effort</div>
              <Body className="text-sm">{plan.protocol.proximity}</Body>
            </div>
          </div>
        </div>
      </Card>

      {/* Workout cards */}
      <div className="space-y-4">
        {plan.resistanceWorkouts.map((w, i) => {
          const completedThisWeek = logs.filter(l => l.workoutId === w.id && isThisWeek(l.date));
          const lastLog = logs.filter(l => l.workoutId === w.id).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
          return (
            <Card key={w.id} interactive onClick={() => onOpenWorkout(w.id)}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div style={{ ...FONT_TABULAR, fontSize: "12px", color: COLORS.rust, letterSpacing: "0.12em", marginBottom: 6 }}>
                      Workout {String.fromCharCode(65 + i)}
                    </div>
                    <div style={{ ...FONT_DISPLAY, fontSize: "26px", color: COLORS.ink, marginBottom: 6 }}>{w.name}</div>
                    {w.note && <Body muted className="text-sm mb-2">{w.note}</Body>}
                    <div className="flex flex-wrap gap-3 text-sm" style={{ color: COLORS.muted }}>
                      <span><Clock size={12} style={{ display: "inline", marginRight: 4 }} />~{w.estimatedMinutes} min</span>
                      <span>·</span>
                      <span>{w.exercises.length} exercises</span>
                      <span>·</span>
                      <span>{w.exercises.reduce((s,e) => s + e.sets, 0)} sets total</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {completedThisWeek.length > 0 ? (
                      <Badge color={COLORS.forest}>✓ {completedThisWeek.length} this week</Badge>
                    ) : (
                      <Badge>Not started</Badge>
                    )}
                    <div className="mt-2" style={{ fontSize: "11px", color: COLORS.muted }}>
                      {lastLog ? `Last: ${new Date(lastLog.date).toLocaleDateString()}` : "Never done"}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 16 }}>
                  <ul className="space-y-1">
                    {w.exercises.map((ex, j) => (
                      <li key={ex.id} className="flex items-center justify-between text-sm" style={{ padding: "4px 0" }}>
                        <span style={{ color: COLORS.ink }}>
                          <span style={{ ...FONT_TABULAR, color: COLORS.muted, marginRight: 12 }}>{String(j+1).padStart(2,"0")}</span>
                          {ex.name}
                        </span>
                        <span style={{ ...FONT_TABULAR, color: COLORS.muted, fontSize: "13px" }}>
                          {ex.sets} × {ex.repRange[0]}–{ex.repRange[1]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 flex items-center justify-end" style={{ color: COLORS.rust, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
                  Open <ChevronRight size={14} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ProtocolStat({ label, value, unit }) {
  return (
    <div>
      <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ ...FONT_TABULAR, fontSize: "26px", color: COLORS.ink, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: "11px", color: COLORS.muted, marginTop: 2 }}>{unit}</div>
    </div>
  );
}

// ── CARDIO TAB ──

function CardioTab({ plan, cardioLogs = [], onSaveCardioLog, currentWeek }) {
  const weekly = plan.cardioSessions.filter(c => typeof c.instances === "number");
  const daily = plan.cardioSessions.filter(c => typeof c.instances !== "number");
  const totalMin = weekly.reduce((s, c) => s + c.duration * c.instances, 0);

  // Count cardio sessions logged this week
  const completedThisWeek = cardioLogs.filter(l => isThisWeek(l.date)).length;
  const targetThisWeek = weekly.reduce((s, c) => s + c.instances, 0);

  return (
    <div>
      <SectionLabel num={1}>Cardio Architecture</SectionLabel>
      <Heading size="lg" className="mb-3">Conditioning, by design</Heading>
      <Body muted className="max-w-2xl mb-12">
        Cardiorespiratory fitness is one of the strongest predictors of all-cause mortality. The mix below
        is calibrated to your goal — HIIT raises VO₂ max, zone 2 builds the aerobic base, recovery work keeps everything moving.
      </Body>

      <div className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-12" style={{ borderTop: `1px solid ${COLORS.hairline}`, borderBottom: `1px solid ${COLORS.hairline}`, padding: "32px 0" }}>
        <StatBlock label="Sessions" value={targetThisWeek} unit="/wk" accent />
        <StatBlock label="This Week" value={`${completedThisWeek}/${targetThisWeek}`} unit="logged" />
        <StatBlock label="Minutes" value={totalMin} unit="/wk" />
        <StatBlock label="HIIT" value={weekly.filter(c => c.category === "HIIT").reduce((s,c) => s + c.instances, 0)} unit="/wk" />
      </div>

      {/* Weekly sessions */}
      <SectionLabel num={2}>Weekly Sessions</SectionLabel>
      <div className="space-y-4 mb-16">
        {weekly.map((c) => (
          <CardioCard key={c.id} c={c} cardioLogs={cardioLogs} onSaveLog={onSaveCardioLog} currentWeek={currentWeek} />
        ))}
      </div>

      {/* Daily / VILPA */}
      {daily.length > 0 && (
        <>
          <SectionLabel num={3}>Daily Background Movement</SectionLabel>
          <Heading size="md" className="mb-3">Exercise snacks & VILPA</Heading>
          <Body muted className="max-w-2xl mb-8">
            Brief vigorous bouts spread across the day — as little as 4 minutes daily reduces cardiovascular and
            cancer mortality by ~30% in observational data. Track these on the Overview tab's daily checklist.
          </Body>
          <div className="space-y-4 mb-16">
            {daily.map((c) => (
              <CardioCard key={c.id} c={c} />
            ))}
          </div>
        </>
      )}

      {/* Add-ons */}
      {plan.addOns.length > 0 && (
        <>
          <SectionLabel num={4}>Optional Add-Ons</SectionLabel>
          <div className="space-y-4">
            {plan.addOns.map((a, i) => (
              <Card key={i}>
                <div className="p-6">
                  <div style={{ ...FONT_DISPLAY, fontSize: "22px", marginBottom: 6 }}>{a.name}</div>
                  <Body muted className="text-sm mb-4">{a.blurb}</Body>
                  <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 14 }}>
                    <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Protocol</div>
                    <ul className="space-y-2">
                      {a.protocol.map((p, j) => (
                        <li key={j} className="flex gap-3 text-sm">
                          <span style={{ ...FONT_TABULAR, color: COLORS.rust, minWidth: 22 }}>{String(j+1).padStart(2,"0")}</span>
                          <span style={{ color: COLORS.inkSoft }}>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {a.caution && (
                    <div className="mt-4 p-3 text-sm" style={{ background: COLORS.paperDeep, borderLeft: `3px solid ${COLORS.rust}`, color: COLORS.inkSoft }}>
                      <strong style={{ color: COLORS.rust, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Caution</strong>
                      {a.caution}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardioCard({ c, cardioLogs = [], onSaveLog, currentWeek }) {
  const [logging, setLogging] = useState(false);
  const isDaily = typeof c.instances !== "number";
  const canLog = !!onSaveLog && !isDaily; // daily snacks/VILPA logged via checklist instead

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge color={c.category === "HIIT" ? COLORS.rust : c.category === "Endurance" ? COLORS.forest : COLORS.muted}>
                {c.category}
              </Badge>
              {!isDaily && <span style={{ ...FONT_TABULAR, fontSize: "12px", color: COLORS.muted }}>{c.instances}× per week</span>}
              {isDaily && <span style={{ ...FONT_TABULAR, fontSize: "12px", color: COLORS.muted }}>{c.instances}</span>}
            </div>
            <div style={{ ...FONT_DISPLAY, fontSize: "24px", marginBottom: 4, letterSpacing: "-0.01em" }}>{c.name}</div>
            <Body muted className="text-sm">{c.blurb}</Body>
          </div>
          {!isDaily && (
            <div className="text-right flex-shrink-0">
              <div style={{ ...FONT_TABULAR, fontSize: "30px", color: COLORS.ink, lineHeight: 1 }}>{c.duration}</div>
              <div style={{ fontSize: "11px", color: COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>min</div>
            </div>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 14, marginTop: 14 }}>
          <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>How to do it</div>
          <ul className="space-y-2">
            {c.structure.map((line, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span style={{ ...FONT_TABULAR, color: COLORS.rust, minWidth: 22 }}>{String(i+1).padStart(2,"0")}</span>
                <span style={{ color: COLORS.inkSoft }}>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" style={{ color: COLORS.muted }}>
            <span><strong style={{ color: COLORS.ink }}>RPE:</strong> {c.rpe}</span>
            {c.equipmentSuggestions && c.equipmentSuggestions.length > 0 && (
              <span><strong style={{ color: COLORS.ink }}>Modes:</strong> {c.equipmentSuggestions.join(", ")}</span>
            )}
          </div>
          {canLog && <CardioHistoryStrip logs={cardioLogs} sessionId={c.id} />}
        </div>

        {/* Log button + inline form */}
        {canLog && !logging && (
          <div className="mt-4">
            <Button onClick={() => setLogging(true)} variant="ghost" icon={<Check size={14} />}>
              Log this session
            </Button>
          </div>
        )}
        {canLog && logging && (
          <CardioLogForm
            session={c}
            week={currentWeek}
            onSave={(log) => { onSaveLog(log); setLogging(false); }}
            onCancel={() => setLogging(false)}
          />
        )}
      </div>
    </Card>
  );
}

// ── NUTRITION TAB ──

function NutritionTab({ plan }) {
  const n = plan.nutrition;
  return (
    <div>
      <SectionLabel num={1}>Nutrition</SectionLabel>
      <Heading size="lg" className="mb-3">Protein, calories, and timing</Heading>
      <Body muted className="max-w-2xl mb-12">
        Total daily protein matters most. Distribution across meals matters second. Timing around workouts matters last —
        the "anabolic window" is much wider than fitness culture suggests.
      </Body>

      {/* Big protein number */}
      <Card className="mb-10">
        <div className="p-8 md:p-10">
          <div style={{ fontSize: "10px", color: COLORS.rust, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Daily Protein Target
          </div>
          <div className="flex items-baseline gap-6 mb-6">
            <div style={{ ...FONT_TABULAR, fontSize: "84px", color: COLORS.ink, lineHeight: 0.9, fontWeight: 300 }}>{n.proteinG}</div>
            <div style={{ ...FONT_BODY, fontSize: "16px", color: COLORS.muted }}>grams / day</div>
          </div>
          <div style={{ fontSize: "13px", color: COLORS.muted, marginBottom: 16 }}>
            ({n.dosePerKg}g per kg of bodyweight, calibrated to your goal)
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 16 }}>
            <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
              Distributed across {n.meals} meals
            </div>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: n.meals }).map((_, i) => (
                <div key={i} style={{ flex: "1 1 140px", padding: "16px 20px", background: COLORS.paper, borderRadius: "3px", border: `1px solid ${COLORS.hairline}` }}>
                  <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                    Meal {i + 1}
                  </div>
                  <div style={{ ...FONT_TABULAR, fontSize: "26px", color: COLORS.ink }}>~{n.perMealG}<span style={{ fontSize: "13px", color: COLORS.muted, marginLeft: 4 }}>g</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Calorie target */}
      <Card className="mb-10">
        <div className="p-6 md:p-8">
          <div style={{ fontSize: "10px", color: COLORS.rust, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Calorie Target
          </div>
          <div className="grid md:grid-cols-2 gap-6 items-baseline mb-4">
            <div>
              <div style={{ ...FONT_TABULAR, fontSize: "48px", color: COLORS.ink, lineHeight: 1, fontWeight: 300 }}>
                {n.target.toLocaleString()}<span style={{ fontSize: "16px", color: COLORS.muted, marginLeft: 6 }}>kcal/day</span>
              </div>
              <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: 8 }}>
                Maintenance estimate: {n.maintenance.toLocaleString()} kcal/day
              </div>
            </div>
          </div>
          <Body className="text-sm">{n.calorieNote}</Body>
          <Body muted className="text-xs mt-3">
            Calorie estimates are rough — Mifflin–St Jeor BMR × an activity multiplier. Track and adjust based on the scale and the mirror over 2–3 weeks.
          </Body>
        </div>
      </Card>

      {/* Principles */}
      <SectionLabel num={2}>Principles</SectionLabel>
      <Card>
        <div className="p-6 md:p-8">
          <ol className="space-y-5">
            {n.principles.map((p, i) => (
              <li key={i} className="flex gap-4">
                <span style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "18px", minWidth: 32 }}>{String(i+1).padStart(2,"0")}</span>
                <Body className="text-sm">{p}</Body>
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}

// ── SUPPLEMENTS TAB ──

function SupplementsTab({ plan }) {
  return (
    <div>
      <SectionLabel num={1}>Supplements</SectionLabel>
      <Heading size="lg" className="mb-3">What's worth taking</Heading>
      <Body muted className="max-w-2xl mb-12">
        A short list. Most supplements don't survive a careful evidence review — these do. Order matters: creatine
        first, omega-3 second, then everything below them is convenience.
      </Body>

      <div className="space-y-4">
        {plan.supplements.map((s, i) => (
          <Card key={i}>
            <div className="p-6 md:p-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div style={{ ...FONT_TABULAR, fontSize: "11px", color: COLORS.rust, letterSpacing: "0.16em", marginBottom: 4 }}>
                    {String(i+1).padStart(2,"0")} —
                  </div>
                  <div style={{ ...FONT_DISPLAY, fontSize: "26px", color: COLORS.ink, letterSpacing: "-0.01em" }}>{s.name}</div>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mb-5" style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 16 }}>
                <div>
                  <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Dose</div>
                  <Body className="text-sm">{s.dose}</Body>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Timing</div>
                  <Body className="text-sm">{s.timing}</Body>
                </div>
              </div>
              {s.note && (
                <Body className="text-sm mb-4" muted>{s.note}</Body>
              )}
              <div style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 14 }}>
                <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Why</div>
                <Body className="text-sm">{s.rationale}</Body>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── PROGRESSION TAB ──

function ProgressionTab({ plan, currentWeek, onChangeWeek }) {
  const activePhase = getPhaseForWeek(currentWeek, plan.protocol);

  // Map progression phases to their starting weeks for jumpable navigation.
  const phaseStartWeeks = [1, 3, 7, 10];

  return (
    <div>
      <SectionLabel num={1}>Progression</SectionLabel>
      <Heading size="lg" className="mb-3">A 12-week scaffold</Heading>
      <Body muted className="max-w-2xl mb-8">
        Your weekly workouts stay structurally the same — but how you load them changes. Here's the arc to think about.
        Click a phase to jump there.
      </Body>

      {/* Week selector */}
      <div className="mb-10 flex items-center gap-4 flex-wrap">
        <WeekSelector currentWeek={currentWeek} onChange={onChangeWeek} protocol={plan.protocol} />
        <Body muted className="text-sm">Currently in <strong style={{ color: activePhase.color }}>{activePhase.label}</strong> phase.</Body>
      </div>

      <div className="space-y-0">
        {plan.progression.map((p, i) => {
          const startWeek = phaseStartWeeks[i];
          const isActive = activePhase.number === i + 1;
          return (
            <div key={i}
              onClick={() => onChangeWeek(startWeek)}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 24,
                padding: "32px 24px",
                cursor: "pointer",
                background: isActive ? COLORS.card : "transparent",
                border: isActive ? `1px solid ${COLORS.ink}` : "none",
                borderTop: !isActive && i === 0 ? `1px solid ${COLORS.hairline}` : (isActive ? `1px solid ${COLORS.ink}` : "none"),
                borderBottom: isActive ? `1px solid ${COLORS.ink}` : `1px solid ${COLORS.hairline}`,
                borderRadius: isActive ? "3px" : "0",
                marginTop: isActive && i > 0 ? "-1px" : "0",
                transition: "all 200ms ease",
              }}
            >
              <div style={{ minWidth: 110 }}>
                <div style={{ ...FONT_TABULAR, fontSize: "44px", color: isActive ? COLORS.rust : COLORS.muted, fontWeight: 300, lineHeight: 1 }}>
                  {String(i+1).padStart(2,"0")}
                </div>
                <div style={{ ...FONT_BODY, fontSize: "11px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginTop: 8 }}>
                  {p.range}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <div style={{ ...FONT_DISPLAY, fontSize: "22px", color: COLORS.ink }}>{p.focus}</div>
                  {isActive && <Badge color={COLORS.rust}>You are here</Badge>}
                </div>
                <Body className="text-sm max-w-2xl">{p.prescription}</Body>
              </div>
              <div className="flex items-center text-sm" style={{ color: COLORS.muted, fontWeight: 500 }}>
                {!isActive && <ChevronRight size={16} />}
              </div>
            </div>
          );
        })}
      </div>

      <Card className="mt-12">
        <div className="p-6">
          <div style={{ ...FONT_TABULAR, fontSize: "11px", color: COLORS.rust, letterSpacing: "0.18em", marginBottom: 10, textTransform: "uppercase" }}>
            Auto-regulation note
          </div>
          <Body className="text-sm">
            Don't follow this scaffold on rails. If you're recovering well and lifts are moving, push harder.
            If you're sleeping poorly, work is stressful, or you're getting sick — pull back. Listen to bar speed,
            not to a calendar.
          </Body>
        </div>
      </Card>
    </div>
  );
}

// ── PRINCIPLES TAB ──

function PrinciplesTab({ plan }) {
  return (
    <div>
      <SectionLabel num={1}>Training Principles</SectionLabel>
      <Heading size="lg" className="mb-3">The rules behind your plan</Heading>
      <Body muted className="max-w-2xl mb-12">
        Programs change. Principles don't. These are the load-bearing ideas distilled from the experts in the source guide.
      </Body>

      <div className="space-y-0">
        {plan.principles.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 16, padding: "20px 0", borderTop: i === 0 ? `1px solid ${COLORS.hairline}` : "none", borderBottom: `1px solid ${COLORS.hairline}` }}>
            <div style={{ ...FONT_TABULAR, fontSize: "20px", color: COLORS.rust, fontWeight: 400, lineHeight: 1.2 }}>
              {String(i+1).padStart(2,"0")}
            </div>
            <Body className="text-base" style={{ fontSize: "16px", lineHeight: 1.55 }}>{p}</Body>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────── WORKOUT DETAIL — interactive logging ────────────────────

function WorkoutDetailScreen({ plan, workoutId, logs, currentWeek, onBack, onComplete }) {
  const workout = plan.resistanceWorkouts.find(w => w.id === workoutId);
  const phase = getPhaseForWeek(currentWeek || 1, plan.protocol);
  if (!workout) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.paper }}>
        <Body>Workout not found.</Body>
      </div>
    );
  }

  // Find last completed log for this workout for showing previous performance.
  const lastLog = useMemo(() => {
    return logs
      .filter(l => l.workoutId === workoutId && l.completed)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  }, [logs, workoutId]);

  // Initialize set state. Each exercise has an array of {reps, weight, completed}.
  const [setState, setSetState] = useState(() => {
    const initial = {};
    for (const ex of workout.exercises) {
      initial[ex.id] = Array.from({ length: ex.sets }).map(() => ({
        reps: "",
        weight: "",
        completed: false,
      }));
    }
    return initial;
  });

  const updateSet = (exId, setIdx, patch) => {
    setSetState(prev => ({
      ...prev,
      [exId]: prev[exId].map((s, i) => i === setIdx ? { ...s, ...patch } : s),
    }));
  };

  const totalSets = workout.exercises.reduce((s, e) => s + e.sets, 0);
  const completedSets = Object.values(setState).flat().filter(s => s.completed).length;
  const progress = totalSets === 0 ? 0 : Math.round((completedSets / totalSets) * 100);

  const handleComplete = () => {
    const log = {
      workoutId: workout.id,
      workoutName: workout.name,
      week: currentWeek,
      date: new Date().toISOString(),
      completed: true,
      exercises: workout.exercises.map(ex => ({
        exerciseId: ex.id,
        exerciseName: ex.name,
        prescribed: { sets: ex.sets, repRange: ex.repRange },
        sets: setState[ex.id],
      })),
    };
    onComplete(log);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COLORS.paper }}>
      {/* Header */}
      <header style={{ borderBottom: `1px solid ${COLORS.hairline}`, background: COLORS.paper, position: "sticky", top: 0, zIndex: 20 }}>
        <div className="px-6 md:px-12 py-5 flex items-center justify-between max-w-4xl mx-auto w-full">
          <button onClick={onBack} style={{ ...FONT_BODY, fontSize: "12px", letterSpacing: "0.1em", color: COLORS.muted, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", border: "none", background: "transparent" }}>
            <ChevronLeft size={14} /> Back to plan
          </button>
          <div style={{ ...FONT_TABULAR, fontSize: "12px", color: COLORS.muted, letterSpacing: "0.05em" }}>
            {completedSets} <span style={{ color: COLORS.hairline }}>/</span> {totalSets} sets
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: "2px", background: COLORS.hairline, position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            background: progress === 100 ? COLORS.forest : COLORS.rust,
            width: `${progress}%`,
            transition: "width 320ms ease",
          }} />
        </div>
      </header>

      <main className="flex-1 px-6 md:px-12 py-10 md:py-16 max-w-4xl mx-auto w-full">
        {/* Title */}
        <SectionLabel>Today's session</SectionLabel>
        <div className="flex items-baseline gap-4 flex-wrap mb-3">
          <Heading size="lg">{workout.name}</Heading>
          <span style={{ ...FONT_TABULAR, fontSize: "14px", color: phase.color, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600 }}>
            Week {String(currentWeek || 1).padStart(2, "0")} · {phase.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 mb-8 text-sm" style={{ color: COLORS.muted }}>
          <span><Clock size={12} style={{ display: "inline", marginRight: 4 }} />~{workout.estimatedMinutes} min</span>
          <span>·</span>
          <span>{workout.exercises.length} exercises</span>
          <span>·</span>
          <span>Rest {Math.round(plan.protocol.restSec[0]/60)}–{Math.round(plan.protocol.restSec[1]/60)} min between sets</span>
        </div>

        {/* Phase guidance for this week */}
        <Card className="mb-10">
          <div className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                <div style={{ ...FONT_TABULAR, fontSize: "10px", color: phase.color, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
                  This week's guidance
                </div>
                <div style={{ ...FONT_DISPLAY, fontSize: "20px", color: COLORS.ink }}>{phase.label}</div>
              </div>
            </div>
            <Body className="text-sm mb-4">{phase.blurb}</Body>
            <div className="grid md:grid-cols-3 gap-4" style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 14 }}>
              <PhaseHint label="Load" value={phase.loadHint} />
              <PhaseHint label="Effort" value={phase.rirHint} />
              <PhaseHint label="Volume" value={phase.volumeHint} />
            </div>
          </div>
        </Card>

        {workout.note && (
          <Card className="mb-10">
            <div className="p-5 text-sm" style={{ display: "flex", gap: 12, alignItems: "flex-start", color: COLORS.inkSoft }}>
              <Info size={14} style={{ color: COLORS.rust, marginTop: 4, flexShrink: 0 }} />
              <span>{workout.note}</span>
            </div>
          </Card>
        )}

        {/* Exercises */}
        <div className="space-y-6">
          {workout.exercises.map((ex, exIdx) => {
            const lastEx = lastLog?.exercises?.find(e => e.exerciseId === ex.id);
            return (
              <ExerciseLogCard
                key={ex.id}
                exercise={ex}
                index={exIdx}
                sets={setState[ex.id]}
                onUpdateSet={(setIdx, patch) => updateSet(ex.id, setIdx, patch)}
                lastPerformance={lastEx}
                weightUnit={plan.profile.weightUnit}
              />
            );
          })}
        </div>

        {/* Complete */}
        <div className="mt-12 pt-8" style={{ borderTop: `1px solid ${COLORS.hairline}` }}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div style={{ ...FONT_DISPLAY, fontSize: "20px", marginBottom: 4 }}>
                {progress === 100 ? "Workout complete." : `${completedSets} of ${totalSets} sets done.`}
              </div>
              <Body muted className="text-sm">
                {progress === 100
                  ? "Save this session to your log so next time you can see how you progressed."
                  : "Mark sets done as you go, then save when you're finished. You can save partial sessions too."}
              </Body>
            </div>
            <Button onClick={handleComplete} variant="accent" icon={<Check size={16} />}>
              Save & finish
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ExerciseLogCard({ exercise, index, sets, onUpdateSet, lastPerformance, weightUnit }) {
  const [expanded, setExpanded] = useState(true);
  const ex = exercise;

  // Format last performance summary
  const lastSummary = useMemo(() => {
    if (!lastPerformance) return null;
    const sets = lastPerformance.sets.filter(s => s.completed);
    if (sets.length === 0) return null;
    return sets.map(s => `${s.reps || "—"}${s.weight ? ` × ${s.weight}${weightUnit}` : ""}`).join(", ");
  }, [lastPerformance, weightUnit]);

  return (
    <Card>
      <div className="p-5 md:p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex gap-4 flex-1">
            <div style={{ ...FONT_TABULAR, fontSize: "30px", color: COLORS.rust, fontWeight: 300, lineHeight: 1, minWidth: 40 }}>
              {String(index+1).padStart(2,"0")}
            </div>
            <div className="flex-1">
              <div style={{ ...FONT_DISPLAY, fontSize: "22px", color: COLORS.ink, letterSpacing: "-0.01em", marginBottom: 4 }}>{ex.name}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: COLORS.muted }}>
                <span><strong style={{ color: COLORS.ink, ...FONT_TABULAR }}>{ex.sets}</strong> sets</span>
                <span>×</span>
                <span><strong style={{ color: COLORS.ink, ...FONT_TABULAR }}>{ex.repRange[0]}–{ex.repRange[1]}</strong> reps</span>
                <span>·</span>
                <span>{Math.round(ex.restSec / 60 * 10) / 10} min rest</span>
                <span>·</span>
                <span>{ex.loadPctRange[0]}–{ex.loadPctRange[1]}% 1RM</span>
              </div>
            </div>
          </div>
          <ChevronDown size={18} style={{ color: COLORS.muted, transition: "transform 200ms", transform: expanded ? "rotate(180deg)" : "rotate(0)" }} />
        </div>

        {expanded && (
          <div style={{ borderTop: `1px solid ${COLORS.hairline}`, marginTop: 16, paddingTop: 16 }}>
            {/* Coaching note */}
            {ex.note && (
              <div className="mb-4 text-sm" style={{ color: COLORS.inkSoft, lineHeight: 1.55 }}>
                <span style={{ ...FONT_TABULAR, color: COLORS.rust, fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", marginRight: 8 }}>Cue</span>
                {ex.note}
              </div>
            )}

            {/* Last performance */}
            {lastSummary && (
              <div className="mb-4 text-sm" style={{ background: COLORS.paperDeep, padding: "10px 14px", borderRadius: "3px", display: "flex", alignItems: "center", gap: 10 }}>
                <ListChecks size={14} style={{ color: COLORS.forest, flexShrink: 0 }} />
                <span style={{ color: COLORS.muted, fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Last time:</span>
                <span style={{ ...FONT_TABULAR, color: COLORS.inkSoft, fontSize: "13px" }}>{lastSummary}</span>
              </div>
            )}

            {/* Set rows */}
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs items-center pb-2" style={{ color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>
                <div className="col-span-2">Set</div>
                <div className="col-span-4">Reps</div>
                <div className="col-span-4">Weight ({weightUnit})</div>
                <div className="col-span-2 text-center">Done</div>
              </div>
              {sets.map((s, i) => (
                <SetRow
                  key={i}
                  index={i}
                  reps={s.reps}
                  weight={s.weight}
                  completed={s.completed}
                  onUpdate={(patch) => onUpdateSet(i, patch)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SetRow({ index, reps, weight, completed, onUpdate }) {
  const handleToggle = () => {
    onUpdate({ completed: !completed });
  };
  return (
    <div className="grid grid-cols-12 gap-2 items-center" style={{
      background: completed ? COLORS.paperDeep : "transparent",
      padding: "8px 8px",
      borderRadius: "3px",
      transition: "background 180ms ease",
    }}>
      <div className="col-span-2">
        <span style={{ ...FONT_TABULAR, fontSize: "16px", color: completed ? COLORS.forest : COLORS.muted, fontWeight: 400 }}>
          {String(index+1).padStart(2,"0")}
        </span>
      </div>
      <div className="col-span-4">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={reps}
          onChange={(e) => onUpdate({ reps: e.target.value.replace(/[^0-9]/g, '') })}
          placeholder="—"
          style={setInputStyle(completed)}
        />
      </div>
      <div className="col-span-4">
        <input
          type="text"
          inputMode="decimal"
          value={weight}
          onChange={(e) => onUpdate({ weight: e.target.value.replace(/[^0-9.]/g, '') })}
          placeholder="—"
          style={setInputStyle(completed)}
        />
      </div>
      <div className="col-span-2 flex justify-center">
        <button
          onClick={handleToggle}
          style={{
            width: 32, height: 32, borderRadius: "3px", cursor: "pointer",
            border: `1px solid ${completed ? COLORS.forest : COLORS.hairline}`,
            background: completed ? COLORS.forest : COLORS.card,
            color: completed ? "#fff" : COLORS.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 160ms ease",
          }}
        >
          <Check size={14} />
        </button>
      </div>
    </div>
  );
}

function setInputStyle(completed) {
  return {
    ...FONT_TABULAR,
    width: "100%",
    background: completed ? COLORS.card : COLORS.paper,
    border: `1px solid ${COLORS.hairline}`,
    borderRadius: "3px",
    padding: "8px 10px",
    fontSize: "16px",
    color: COLORS.ink,
    outline: "none",
    textAlign: "center",
  };
}

/* ============================================================================
   9b. CARDIO LOGGING + DAILY CHECKLIST
   ============================================================================ */

// Date helper — returns "YYYY-MM-DD" in user's local timezone, used as checklist key.
function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Inline cardio logging form (collapses into the cardio card) ──

function CardioLogForm({ session, week, onSave, onCancel }) {
  const [duration, setDuration] = useState(session.duration || 30);
  const [intensity, setIntensity] = useState("as prescribed"); // as prescribed | easier | harder
  const [mode, setMode] = useState(session.equipmentSuggestions?.[0] || "");
  const [notes, setNotes] = useState("");

  const handleSave = () => {
    onSave({
      sessionId: session.id,
      sessionName: session.name,
      category: session.category,
      week,
      date: new Date().toISOString(),
      duration,
      intensity,
      mode,
      notes,
    });
  };

  return (
    <div style={{ borderTop: `1px solid ${COLORS.hairline}`, marginTop: 16, paddingTop: 16 }}>
      <div style={{ ...FONT_TABULAR, fontSize: "10px", color: COLORS.rust, letterSpacing: "0.18em", marginBottom: 12, textTransform: "uppercase", fontWeight: 600 }}>
        Log this session
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Duration
          </div>
          <NumberInput value={duration} onChange={setDuration} min={1} max={300} suffix="min" />
        </div>
        <div>
          <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Effort
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: "easier",          label: "Easier" },
              { id: "as prescribed",   label: "On target" },
              { id: "harder",          label: "Harder" },
            ].map(opt => (
              <button key={opt.id} onClick={() => setIntensity(opt.id)} type="button"
                style={{
                  ...FONT_BODY, padding: "10px 14px",
                  background: intensity === opt.id ? COLORS.ink : COLORS.card,
                  color: intensity === opt.id ? COLORS.paper : COLORS.ink,
                  border: `1px solid ${intensity === opt.id ? COLORS.ink : COLORS.hairline}`,
                  borderRadius: "3px", cursor: "pointer", fontSize: "13px",
                }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {session.equipmentSuggestions && session.equipmentSuggestions.length > 0 && (
        <div className="mb-4">
          <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
            Mode
          </div>
          <div className="flex gap-2 flex-wrap">
            {session.equipmentSuggestions.map(m => (
              <button key={m} onClick={() => setMode(m)} type="button"
                style={{
                  ...FONT_BODY, padding: "8px 12px",
                  background: mode === m ? COLORS.ink : COLORS.card,
                  color: mode === m ? COLORS.paper : COLORS.inkSoft,
                  border: `1px solid ${mode === m ? COLORS.ink : COLORS.hairline}`,
                  borderRadius: "3px", cursor: "pointer", fontSize: "12px",
                }}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mb-4">
        <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>
          Notes (optional)
        </div>
        <TextInput value={notes} onChange={setNotes} placeholder="Distance, pace, how it felt…" />
      </div>
      <div className="flex gap-3">
        <Button onClick={handleSave} variant="accent" icon={<Check size={14} />}>Save session</Button>
        <Button onClick={onCancel} variant="quiet">Cancel</Button>
      </div>
    </div>
  );
}

// ── Cardio history strip (shown when there are recent logs for this session) ──

function CardioHistoryStrip({ logs, sessionId }) {
  const sessionLogs = logs
    .filter(l => l.sessionId === sessionId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);
  if (sessionLogs.length === 0) return null;
  return (
    <div style={{ background: COLORS.paperDeep, padding: "10px 14px", borderRadius: "3px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
      <ListChecks size={14} style={{ color: COLORS.forest, flexShrink: 0 }} />
      <span style={{ color: COLORS.muted, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Recent:</span>
      {sessionLogs.map((l, i) => (
        <span key={i} style={{ ...FONT_TABULAR, color: COLORS.inkSoft, fontSize: "12px" }}>
          {new Date(l.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {l.duration}min{l.intensity !== "as prescribed" ? ` (${l.intensity})` : ""}
          {i < sessionLogs.length - 1 && <span style={{ color: COLORS.hairline, marginLeft: 8 }}>·</span>}
        </span>
      ))}
    </div>
  );
}

// ── Daily checklist ──
//
// The checklist surfaces the daily-practice items from the guide.
// Storage shape: { "YYYY-MM-DD": { snacks: bool, vilpa: bool, hydration: int (cups),
//                                  protein: bool, sleep: bool, stretch: bool? }, ... }
//
// hydrationTarget defaults to 8 cups but bumps up by training load.

function getHydrationTarget(profile) {
  // Rough rule: ~30 ml/kg/day baseline + 500 ml per training hour. Convert to cups (1 cup = 240 ml).
  const baselineMl = (profile?.weightKg || 75) * 30;
  const trainingHours = ((profile?.sessionsPerWeek || 3) * (profile?.minutesPerSession || 60) / 60) / 7;
  const totalMl = baselineMl + trainingHours * 500;
  return Math.max(6, Math.round(totalMl / 240));
}

const CHECKLIST_ITEMS = [
  {
    id: "snacks",
    label: "Exercise snacks",
    detail: "3–4 brief vigorous bursts (60s or less) spread through the day. Stairs, sprints, fast walk with a bag.",
    type: "boolean",
    icon: Zap,
  },
  {
    id: "vilpa",
    label: "VILPA — vigorous bursts in daily life",
    detail: "Aim to accumulate 4+ minutes of huffing-and-puffing intensity from regular activity.",
    type: "boolean",
    icon: Activity,
  },
  {
    id: "hydration",
    label: "Hydration",
    detail: "Cups of water (and other non-caffeinated, non-alcoholic fluids).",
    type: "counter",
    icon: Flame,
  },
  {
    id: "protein",
    label: "Protein target",
    detail: "Hit your daily total — see Nutrition tab for exact grams.",
    type: "boolean",
    icon: Apple,
  },
  {
    id: "sleep",
    label: "Sleep — 7+ hours last night",
    detail: "Mechanically when growth and recovery happen. Non-negotiable.",
    type: "boolean",
    icon: Moon,
  },
];

function DailyChecklist({ profile, checklist, onChange }) {
  const today = todayKey();
  const todayState = checklist[today] || {};
  const hydrationTarget = getHydrationTarget(profile);

  const toggle = (id) => {
    onChange({ ...checklist, [today]: { ...todayState, [id]: !todayState[id] } });
  };
  const incrementCounter = (id, delta) => {
    const current = todayState[id] || 0;
    const next = Math.max(0, Math.min(20, current + delta));
    onChange({ ...checklist, [today]: { ...todayState, [id]: next } });
  };

  // Count completed items (boolean true OR counter >= target for hydration)
  const completed = CHECKLIST_ITEMS.reduce((count, item) => {
    if (item.type === "boolean") return count + (todayState[item.id] ? 1 : 0);
    if (item.id === "hydration") return count + ((todayState.hydration || 0) >= hydrationTarget ? 1 : 0);
    return count;
  }, 0);
  const total = CHECKLIST_ITEMS.length;

  // Streak: consecutive days where all items were completed
  const streak = useMemo(() => {
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayKey(d);
      const state = checklist[key];
      if (!state) break;
      const allDone = CHECKLIST_ITEMS.every(item => {
        if (item.type === "boolean") return state[item.id] === true;
        if (item.id === "hydration") return (state.hydration || 0) >= hydrationTarget;
        return false;
      });
      if (!allDone) break;
      s++;
    }
    return s;
  }, [checklist, hydrationTarget]);

  return (
    <Card>
      <div className="p-6 md:p-7">
        <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
          <div>
            <div style={{ ...FONT_TABULAR, fontSize: "11px", color: COLORS.rust, letterSpacing: "0.18em", marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>
              Daily Checklist
            </div>
            <div style={{ ...FONT_DISPLAY, fontSize: "22px", color: COLORS.ink }}>
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Today</div>
              <div style={{ ...FONT_TABULAR, fontSize: "28px", color: completed === total ? COLORS.forest : COLORS.ink, lineHeight: 1 }}>
                {completed}<span style={{ fontSize: "16px", color: COLORS.muted }}>/{total}</span>
              </div>
            </div>
            {streak > 0 && (
              <div className="text-right">
                <div style={{ fontSize: "10px", color: COLORS.muted, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 600 }}>Streak</div>
                <div style={{ ...FONT_TABULAR, fontSize: "28px", color: COLORS.rust, lineHeight: 1 }}>
                  {streak}<span style={{ fontSize: "16px", color: COLORS.muted, marginLeft: 2 }}>d</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2" style={{ borderTop: `1px solid ${COLORS.hairline}`, paddingTop: 16 }}>
          {CHECKLIST_ITEMS.map(item => (
            <ChecklistRow
              key={item.id}
              item={item}
              value={todayState[item.id]}
              hydrationTarget={item.id === "hydration" ? hydrationTarget : null}
              onToggle={() => toggle(item.id)}
              onIncrement={(delta) => incrementCounter(item.id, delta)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

function ChecklistRow({ item, value, hydrationTarget, onToggle, onIncrement }) {
  const Icon = item.icon;

  if (item.type === "counter") {
    const current = value || 0;
    const target = hydrationTarget || 8;
    const done = current >= target;
    return (
      <div style={{
        padding: "12px 14px",
        background: done ? COLORS.paperDeep : "transparent",
        borderRadius: "3px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        transition: "background 180ms ease",
      }}>
        <Icon size={16} style={{ color: done ? COLORS.forest : COLORS.muted, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div style={{ ...FONT_BODY, fontSize: "14px", color: COLORS.ink, fontWeight: 500 }}>
            {item.label}
          </div>
          <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: 2 }}>{item.detail}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onIncrement(-1)} aria-label="Decrease" style={counterBtn}>
            <Minus size={12} />
          </button>
          <div style={{ ...FONT_TABULAR, fontSize: "16px", color: done ? COLORS.forest : COLORS.ink, minWidth: 50, textAlign: "center" }}>
            {current}<span style={{ fontSize: "11px", color: COLORS.muted }}>/{target}</span>
          </div>
          <button onClick={() => onIncrement(1)} aria-label="Increase" style={counterBtn}>
            <Plus size={12} />
          </button>
        </div>
      </div>
    );
  }

  // Boolean item
  return (
    <div onClick={onToggle} style={{
      padding: "12px 14px",
      background: value ? COLORS.paperDeep : "transparent",
      borderRadius: "3px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      cursor: "pointer",
      transition: "background 180ms ease",
    }}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-label={value ? "Mark incomplete" : "Mark complete"}
        style={{
          width: 26, height: 26, borderRadius: "3px", cursor: "pointer",
          border: `1px solid ${value ? COLORS.forest : COLORS.hairline}`,
          background: value ? COLORS.forest : COLORS.card,
          color: value ? "#fff" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 160ms ease", flexShrink: 0,
        }}
      >
        <Check size={14} />
      </button>
      <Icon size={16} style={{ color: value ? COLORS.forest : COLORS.muted, flexShrink: 0 }} />
      <div className="flex-1 min-w-0">
        <div style={{ ...FONT_BODY, fontSize: "14px", color: COLORS.ink, fontWeight: 500 }}>
          {item.label}
        </div>
        <div style={{ fontSize: "12px", color: COLORS.muted, marginTop: 2 }}>{item.detail}</div>
      </div>
    </div>
  );
}

const counterBtn = {
  width: 26, height: 26, borderRadius: "3px", background: COLORS.card,
  border: `1px solid ${COLORS.hairline}`, cursor: "pointer", color: COLORS.muted,
  display: "flex", alignItems: "center", justifyContent: "center",
};

/* ============================================================================
   10. APP ROOT — state machine + storage hydration
   ============================================================================ */

export default function HowToTrainApp() {
  useGoogleFonts();

  const [hydrated, setHydrated] = useState(false);
  const [screen, setScreen] = useState("welcome"); // welcome | setup | plan | workout
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [logs, setLogs] = useState([]);
  const [cardioLogs, setCardioLogs] = useState([]);
  const [checklist, setChecklist] = useState({});
  const [currentWeek, setCurrentWeek] = useState(1);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);

  // Hydrate from storage on mount
  useEffect(() => {
    (async () => {
      const [p, pl, lg, cl, ch, cw] = await Promise.all([
        storage.get(STORAGE_KEYS.PROFILE),
        storage.get(STORAGE_KEYS.PLAN),
        storage.get(STORAGE_KEYS.LOGS),
        storage.get(STORAGE_KEYS.CARDIO_LOGS),
        storage.get(STORAGE_KEYS.CHECKLIST),
        storage.get(STORAGE_KEYS.CURRENT_WEEK),
      ]);
      if (p) setProfile(p);
      if (pl) setPlan(pl);
      if (Array.isArray(lg)) setLogs(lg);
      if (Array.isArray(cl)) setCardioLogs(cl);
      if (ch && typeof ch === "object") setChecklist(ch);
      if (typeof cw === "number" && cw >= 1) setCurrentWeek(cw);
      if (pl) setScreen("plan");
      setHydrated(true);
    })();
  }, []);

  // Handlers
  const handleStart = useCallback(() => {
    setEditingProfile(false);
    setScreen("setup");
  }, []);

  const handleResume = useCallback(() => {
    if (plan) setScreen("plan");
  }, [plan]);

  const handleSetupComplete = useCallback(async (newProfile) => {
    const newPlan = generatePlan(newProfile);
    setProfile(newProfile);
    setPlan(newPlan);
    setCurrentWeek(1);
    await Promise.all([
      storage.set(STORAGE_KEYS.PROFILE, newProfile),
      storage.set(STORAGE_KEYS.PLAN, newPlan),
      storage.set(STORAGE_KEYS.CURRENT_WEEK, 1),
    ]);
    setScreen("plan");
  }, []);

  const handleSetupCancel = useCallback(() => {
    if (plan) setScreen("plan");
    else setScreen("welcome");
  }, [plan]);

  const handleEditProfile = useCallback(() => {
    setEditingProfile(true);
    setScreen("setup");
  }, []);

  const handleResetAll = useCallback(async () => {
    await Promise.all([
      storage.remove(STORAGE_KEYS.PROFILE),
      storage.remove(STORAGE_KEYS.PLAN),
      storage.remove(STORAGE_KEYS.LOGS),
      storage.remove(STORAGE_KEYS.CARDIO_LOGS),
      storage.remove(STORAGE_KEYS.CHECKLIST),
      storage.remove(STORAGE_KEYS.CURRENT_WEEK),
    ]);
    setProfile(null);
    setPlan(null);
    setLogs([]);
    setCardioLogs([]);
    setChecklist({});
    setCurrentWeek(1);
    setActiveWorkoutId(null);
    setScreen("welcome");
  }, []);

  const handleOpenWorkout = useCallback((workoutId) => {
    setActiveWorkoutId(workoutId);
    setScreen("workout");
  }, []);

  const handleBackToPlan = useCallback(() => {
    setActiveWorkoutId(null);
    setScreen("plan");
  }, []);

  const handleWorkoutComplete = useCallback(async (log) => {
    const newLogs = [...logs, log];
    setLogs(newLogs);
    await storage.set(STORAGE_KEYS.LOGS, newLogs);
    setActiveWorkoutId(null);
    setScreen("plan");
  }, [logs]);

  const handleSaveCardioLog = useCallback(async (log) => {
    const newLogs = [...cardioLogs, log];
    setCardioLogs(newLogs);
    await storage.set(STORAGE_KEYS.CARDIO_LOGS, newLogs);
  }, [cardioLogs]);

  const handleChecklistChange = useCallback(async (newChecklist) => {
    setChecklist(newChecklist);
    await storage.set(STORAGE_KEYS.CHECKLIST, newChecklist);
  }, []);

  const handleChangeWeek = useCallback(async (week) => {
    setCurrentWeek(week);
    await storage.set(STORAGE_KEYS.CURRENT_WEEK, week);
  }, []);

  // Loading skeleton while we hydrate from storage
  if (!hydrated) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...FONT_DISPLAY, fontSize: "18px", color: COLORS.muted, letterSpacing: "0.05em" }}>
          Loading…
        </div>
      </div>
    );
  }

  return (
    <PaperFrame>
      {screen === "welcome" && (
        <WelcomeScreen
          onStart={handleStart}
          hasExistingPlan={!!plan}
          onResume={handleResume}
        />
      )}
      {screen === "setup" && (
        <SetupScreen
          initialProfile={editingProfile ? profile : null}
          onComplete={handleSetupComplete}
          onCancel={handleSetupCancel}
        />
      )}
      {screen === "plan" && plan && (
        <PlanScreen
          plan={plan}
          logs={logs}
          cardioLogs={cardioLogs}
          checklist={checklist}
          currentWeek={currentWeek}
          onChangeWeek={handleChangeWeek}
          onOpenWorkout={handleOpenWorkout}
          onSaveCardioLog={handleSaveCardioLog}
          onChecklistChange={handleChecklistChange}
          onEditProfile={handleEditProfile}
          onResetAll={handleResetAll}
        />
      )}
      {screen === "workout" && plan && activeWorkoutId && (
        <WorkoutDetailScreen
          plan={plan}
          workoutId={activeWorkoutId}
          logs={logs}
          currentWeek={currentWeek}
          onBack={handleBackToPlan}
          onComplete={handleWorkoutComplete}
        />
      )}
    </PaperFrame>
  );
}
