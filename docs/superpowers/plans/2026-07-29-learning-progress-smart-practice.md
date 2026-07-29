# 学习进度面板与智能练习 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a consistent daily progress experience and a goal-driven smart practice session without changing the established learning and phrase-review flows.

**Architecture:** The backend owns user-wide daily quiz preferences. Frontend settings adapters normalize cloud and local persistence. A pure daily-progress aggregator and pure smart-session planner sit beneath UI components, so the dashboard and practice screen share identical facts and can be tested without React Native rendering.

**Tech Stack:** Django REST Framework, Django migrations, Expo Router, React Native Web, AsyncStorage, TypeScript strict mode, existing Node assertion tests.

## Global Constraints

- Use the existing `UserSettings` endpoint and preserve backward compatibility with clients that only post `daily_new_word_goal`.
- Scope logs and progress to the selected user and wordbook; use local-day timestamps through `startOfDayTs`.
- Retain existing phrase learning, learning-page scheduling, custom practice, and review behavior.
- Do not add dependencies solely for effects or charts.
- PWA/mobile and desktop web progress surfaces must be mutually exclusive.
- Use `EXPO_PUBLIC_USE_CLOUD=true` for the production web build validation.

---

## File Structure

- `backend/apps/vocab/models.py`, `serializers.py`, `views.py`, migration `0005_*`: user setting fields and partial update behavior.
- `lib/data/settings.ts`, `lib/data/httpRepo.ts`: typed daily settings access for local and cloud modes.
- `lib/dailyProgress.ts`, `lib/smartPick.ts`: deterministic aggregation and smart-session planning.
- `components/ProgressWidget.tsx`, `components/MarqueeBar.tsx`, `components/Confetti.tsx`, `components/DailyPlanModal.tsx`: focused presentation components.
- `app/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/practice.tsx`, `app/(tabs)/profile.tsx`: composition, lifecycle and controls.
- `lib/__tests__/dailyProgress.test.ts`, `lib/__tests__/smartPick.test.ts`, `backend/apps/vocab/tests.py`: behavioral coverage.

### Task 1: Persist daily practice preferences

**Files:**
- Modify: `backend/apps/vocab/models.py`, `backend/apps/vocab/serializers.py`, `backend/apps/vocab/views.py`
- Create: `backend/apps/vocab/migrations/0005_usersettings_daily_quiz_goal_and_show_daily_plan.py`
- Modify: `backend/apps/vocab/tests.py`, `lib/data/settings.ts`, `lib/data/httpRepo.ts`

- [ ] Write API and local settings tests for default values, partial updates and invalid quiz goal.
- [ ] Extend the Django model, migration, serializer and settings view so each supplied field validates independently and omitted fields persist.
- [ ] Add typed local/cloud daily settings adapters while retaining the old new-word-goal wrappers.
- [ ] Run backend and settings tests.
- [ ] Commit: `feat: add daily practice settings`.

### Task 2: Build shared daily progress and intelligent session selection

**Files:**
- Create: `lib/dailyProgress.ts`, `lib/smartPick.ts`
- Create: `lib/__tests__/dailyProgress.test.ts`, `lib/__tests__/smartPick.test.ts`

- [ ] Write failing tests for same-day counts, due count, quiz count, priority order, quota distribution and missing-content fallback.
- [ ] Implement a repository-backed daily aggregation function and a pure word/question session planner.
- [ ] Run the new logic tests plus existing quiz-generation tests.
- [ ] Commit: `feat: add daily progress and smart practice selection`.

### Task 3: Implement progress UI primitives

**Files:**
- Create: `components/ProgressWidget.tsx`, `components/MarqueeBar.tsx`, `components/Confetti.tsx`, `components/DailyPlanModal.tsx`
- Modify: `app/_layout.tsx`, `app/(tabs)/index.tsx`

- [ ] Implement presentational components with supplied progress data and no duplicated scheduling logic.
- [ ] Add the daily-plan date guard and PWA/desktop platform checks.
- [ ] Compose the mobile surfaces on the learning screen and desktop widget at the application shell.
- [ ] Run TypeScript validation and a Web build.
- [ ] Commit: `feat: add daily learning progress surfaces`.

### Task 4: Convert default practice to a smart session

**Files:**
- Modify: `components/QuizRunner.tsx`, `app/(tabs)/practice.tsx`, `app/(tabs)/profile.tsx`
- Test: `lib/__tests__/smartPick.test.ts`

- [ ] Extend the runner with an optional precomputed per-question plan, actual question-count progress and a completion callback.
- [ ] Load a smart session when the practice tab receives focus; retain custom range/type controls behind a clear secondary action.
- [ ] Add daily quiz goal and daily-plan toggle controls to the existing settings page.
- [ ] Trigger the completion effect once per smart-session completion.
- [ ] Run type checking, logic tests and cloud Web build.
- [ ] Commit: `feat: add goal-driven smart practice`.

### Task 5: Verify and prepare handoff

**Files:**
- Modify: `HANDOFF.md`

- [ ] Run all existing TypeScript test scripts, Django tests and `npm run build:web:cloud`.
- [ ] Inspect `git diff --check`, record exact verification outcomes and update the handoff with migration/deployment requirements.
- [ ] Commit the final implementation and handoff update.
