# Student Daily Learning Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers open a student's date-level progress record and inspect per-word aggregates plus practice-type performance.

**Architecture:** Persist an optional `activity_type` on new quiz logs while preserving historic null values. Add a teacher-only daily-detail aggregation API, map it through the HTTP repository, and route existing daily cards to a compact detail screen.

**Tech Stack:** Django REST Framework, MySQL migrations, Expo Router, React Native, TypeScript.

## Global Constraints

- Correct means `grade >= 1`; only `grade = 0` is wrong.
- Activity types: `dictation`, `choice`, `phrase`, `phrase-blank`, `sentence-choice`.
- Historic quiz logs without an activity type are returned as `unknown`.
- Teacher endpoints require teacher/admin authorization and honour optional wordbook filtering.
- Day bounds use local calendar `[00:00, next 00:00)` timestamps.

---

### Task 1: Persist Quiz Activity Type

**Files:** `backend/apps/vocab/models.py`, `serializers.py`, `views.py`, migration `0006_studylog_activity_type.py`, `backend/apps/vocab/tests.py`, `lib/data/types.ts`, `lib/data/httpRepo.ts`, `components/QuizRunner.tsx`.

**Produces:** nullable `StudyLog.activity_type`, client `PracticeActivityType`, and log payload field `activity_type`.

- [ ] Write a failing `StudyLogListAPITest` that posts a quiz log with `activity_type='dictation'` and asserts it persists and is returned by the list endpoint.
- [ ] Run the targeted test and confirm it fails because the model/serializer has no field.
- [ ] Add the nullable model field, migration, serializer/list mapping, and `StudyLogView` persistence.
- [ ] Add `activityType` to client types and `postStudyLogs`; have `QuizRunner.recordGrade` send `q.type`.
- [ ] Run targeted Django test and `tsc --noEmit`.
- [ ] Commit `feat: record quiz activity types`.

### Task 2: Add Teacher Daily Detail Aggregation

**Files:** `backend/apps/vocab/views.py`, `urls.py`, `tests.py`, `lib/data/httpRepo.ts`.

**Produces:** `GET /api/teacher/students/<user_id>/daily/<YYYY-MM-DD>/detail/?wordbook_id=` returning `{ date, summary, practice_types, words }` per the approved spec.

- [ ] Write failing teacher API tests covering authorization, date validation, wordbook filtering, `grade >= 1` correctness, same-word aggregation, final event, and null activity type mapped to `unknown`.
- [ ] Run tests and confirm the endpoint is absent.
- [ ] Parse the date into start/end millisecond bounds; aggregate summary, practice types, and words with final-log fields.
- [ ] Change existing daily aggregate correctness from `grade >= 3` to `grade >= 1`.
- [ ] Add TypeScript interfaces and `fetchStudentDailyDetail`.
- [ ] Run targeted Django tests and `tsc --noEmit`.
- [ ] Commit `feat: add teacher daily learning detail API`.

### Task 3: Route Daily Cards To Detail UI

**Files:** `app/teacher/students/[id].tsx`, new `app/teacher/students/[id]/daily/[date].tsx`.

**Consumes:** `fetchStudentDailyDetail(userId, date, wordbookId?)`.

- [ ] Make each daily card a `TouchableOpacity` that routes selected student, date, and optional current wordbook id.
- [ ] Build the detail page with back navigation, daily summary, per-type practice statistics, and per-word aggregate cards ordered by final activity time.
- [ ] Display no-record, loading, error, and forbidden states.
- [ ] Run `tsc --noEmit` and `npm run build:web:cloud`.
- [ ] Commit `feat: show student daily learning detail`.

### Task 4: Verify And Deploy

**Files:** `HANDOFF.md`.

- [ ] Run targeted backend/TypeScript tests and cloud bundle build.
- [ ] Apply `vocab.0006_studylog_activity_type` using `DJANGO_SETTINGS_MODULE=config.settings.prod` on production MySQL.
- [ ] Record endpoint, migration, historical unknown-type behaviour, and verification in handoff.
- [ ] Commit, push main, fast-forward `/opt/learning`, deploy, and verify remote HEAD.
