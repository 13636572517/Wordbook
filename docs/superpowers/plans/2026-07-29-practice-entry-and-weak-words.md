# Practice Entry And Weak Words Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the practice tab an explicit configuration screen, and make repeated mistakes across every practice flow contribute to weak-word detection.

**Architecture:** Split smart practice into word selection only, leaving the chosen practice card responsible for question type. Persist the practice quantity in the existing daily settings and apply it both to smart and manually selected ranges. Keep SM-2 progress, but remove the separate review UI from the practice tab.

**Tech Stack:** Expo Router, React Native, TypeScript, existing repository and HTTP APIs.

## Global Constraints

- Practice quantity is a positive multiple of 10 and defaults to the existing daily quiz goal.
- Smart selection priority is: today's newly learned but unpractised words, due words, weak words, then other learned words.
- Frequent-error weak-word detection includes both `quiz` and `review` study-log sources in the last 30 days.
- No practice session begins merely from opening or focusing the tab.

---

### Task 1: Isolate Smart Word Selection

**Files:**
- Modify: `lib/smartPick.ts`
- Test: `lib/__tests__/smartPick.test.ts`

- [ ] Add a failing assertion that selection returns unique word ids in the documented priority order and caps at the configured quantity.
- [ ] Implement `selectSmartPracticeWordIds(input): string[]` using the existing priority construction without assigning question types or repeating words.
- [ ] Run the smart-pick test and confirm it passes.

### Task 2: Include All Practice Errors In Weak Detection

**Files:**
- Modify: `lib/data/weak.ts`
- Test: `lib/data/__tests__/weak.test.ts`

- [ ] Change the existing review-source assertion so two recent `review` errors are expected to make a word weak.
- [ ] Run the weak test and confirm it fails under the quiz-only implementation.
- [ ] Count grade-zero logs from both `quiz` and `review`, then rerun the test.

### Task 3: Rebuild The Practice Entry Screen

**Files:**
- Modify: `app/(tabs)/practice.tsx`
- Modify: `components/QuizRunner.tsx`

- [ ] Remove focus-driven automatic smart-plan startup and the independent review state/UI.
- [ ] Add the default `smart` scope, an in-page quantity menu with 10-word options, and a deliberate start action from each practice type.
- [ ] For smart scope, select word ids immediately before launch; for other scopes, pass the configured word limit to the runner.
- [ ] Limit non-smart ranges before question generation so every practice type honours the selected quantity.

### Task 4: Move The Practice Goal Setting

**Files:**
- Modify: `app/(tabs)/profile.tsx`

- [ ] Remove the daily-practice input and its state/update handler from the profile screen.
- [ ] Retain daily new-word and daily-plan settings unchanged.

### Task 5: Verify And Deploy

**Files:**
- Modify: `HANDOFF.md`

- [ ] Run targeted TypeScript tests, `tsc --noEmit`, and the cloud web build.
- [ ] Record the behavior and deployment in the handoff.
- [ ] Commit, push `main`, run `/opt/learning/deploy.sh`, and inspect its successful output.
