# 每日固定学习队列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用服务端每日会话固定学习顺序，并在队尾完成可翻转的词组学习阶段。

**Architecture:** `DailyStudySession` 和 `DailyStudySessionItem` 在首次进入学习时持久化当天项目；评分 API 在事务中只推进当前项目。学习页读取会话而非逐张卡重新选词，设置页维护每日词组总量。

**Tech Stack:** Django/DRF/MySQL、React Native/Expo Router、TypeScript、现有 SM-2 进度表。

## Global Constraints

- 唯一会话键为用户、词本、自然日；当天不会重新生成。
- 队列固定为到期复习单词、当日新词、词组阶段。
- 每日词组目标默认 10；优先当天新词每词最多 1 个词组，再补到期词组。
- “不会”最多在队尾追加一次，评分 API 必须幂等。
- 词组正面只有英文，翻面才展示中文与评分控件。

---

### Task 1: 持久化会话模型与设置字段

**Files:**
- Modify: `backend/apps/vocab/models.py`
- Modify: `backend/apps/vocab/serializers.py`
- Create: `backend/apps/vocab/migrations/0007_daily_study_session.py`
- Modify: `backend/apps/vocab/tests.py`

**Interfaces:**
- Produces `DailyStudySession(user_id, wordbook, study_date, current_position, status, created_at, completed_at)`.
- Produces `DailyStudySessionItem(session, position, kind, word, phrase_key, phrase, meaning, status, grade, retry_of, completed_at)`.
- Extends `UserSettings` / `UserSettingsSerializer` with `daily_phrase_goal` default `10`.

- [ ] **Step 1: Write failing tests**

```python
def test_session_unique_for_user_wordbook_date(self):
    DailyStudySession.objects.create(user_id=7, wordbook=self.wb, study_date=date(2026, 7, 30))
    with self.assertRaises(IntegrityError):
        DailyStudySession.objects.create(user_id=7, wordbook=self.wb, study_date=date(2026, 7, 30))

def test_settings_default_phrase_goal(self):
    self.assertEqual(self.client.get('/api/settings/').data['daily_phrase_goal'], 10)
```

- [ ] **Step 2: Verify red**

Run: `cd backend && ./venv/bin/python manage.py test apps.vocab.tests.DailyStudySessionModelTest apps.vocab.tests.UserSettingsAPITest`

Expected: FAIL because the model and field do not exist.

- [ ] **Step 3: Add the model, constraints, migration and serializer**

Use `DateField` for `study_date`; add unique constraints `(user_id, wordbook, study_date)` and `(session, position)`. Store phrase text and meaning directly on every phrase item so the plan is stable after dictionary edits.

- [ ] **Step 4: Verify green**

Run: `cd backend && ./venv/bin/python manage.py test apps.vocab.tests.DailyStudySessionModelTest apps.vocab.tests.UserSettingsAPITest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/vocab/models.py backend/apps/vocab/serializers.py backend/apps/vocab/migrations/0007_daily_study_session.py backend/apps/vocab/tests.py
git commit -m "feat: add daily learning session models"
```

### Task 2: 生成固定队列和原子评分 API

**Files:**
- Modify: `backend/apps/vocab/views.py`
- Modify: `backend/apps/vocab/urls.py`
- Modify: `backend/apps/vocab/tests.py`

**Interfaces:**
- `GET /sessions/today/?wordbook_id=` creates or returns `{id, current_position, status, items, current_item, summary}`.
- `POST /sessions/<id>/items/<position>/grade/` consumes `{grade}` and returns `{session, current_item, completed, idempotent}`.

- [ ] **Step 1: Write failing endpoint tests**

```python
def test_create_returns_review_new_then_phrase_items(self):
    data = self.client.get(f'/api/sessions/today/?wordbook_id={self.wb.id}').data
    self.assertEqual([item['kind'] for item in data['items']], ['word_review', 'word_new', 'phrase'])

def test_second_read_keeps_same_items_after_another_word_becomes_due(self):
    first = self.client.get(f'/api/sessions/today/?wordbook_id={self.wb.id}').data
    self.make_word_due_after_first_read()
    second = self.client.get(f'/api/sessions/today/?wordbook_id={self.wb.id}').data
    self.assertEqual(first['items'], second['items'])

def test_again_adds_only_one_retry_and_repeat_post_is_idempotent(self):
    url = f'/api/sessions/{self.session.id}/items/0/grade/'
    self.client.post(url, {'grade': 0}, format='json')
    self.assertTrue(self.client.post(url, {'grade': 0}, format='json').data['idempotent'])
```

- [ ] **Step 2: Verify red**

Run: `cd backend && ./venv/bin/python manage.py test apps.vocab.tests.DailyStudySessionAPITest`

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement the builder and endpoints**

Within `transaction.atomic()`, lock the session with `select_for_update()`. Build due `UserWordProgress` first, current-rule new words second, then phrase snapshots capped by `daily_phrase_goal`. Grade only the item at `current_position`; write existing word or phrase SM-2 progress and one study log for words. Completed repeated requests return stored progress without another write.

- [ ] **Step 4: Verify green**

Run: `cd backend && ./venv/bin/python manage.py test apps.vocab.tests.DailyStudySessionAPITest apps.vocab.tests.StudyLogListAPITest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/vocab/views.py backend/apps/vocab/urls.py backend/apps/vocab/tests.py
git commit -m "feat: add fixed daily learning session api"
```

### Task 3: 前端契约与每日词组目标

**Files:**
- Modify: `lib/data/settings.ts`
- Modify: `lib/data/httpRepo.ts`
- Modify: `app/(tabs)/profile.tsx`
- Modify: `lib/data/__tests__/settings.test.ts`

**Interfaces:**
- Extends `DailySettings` with `dailyPhraseGoal` default `10`.
- Exports `StudySession`, `StudySessionItem`, `fetchTodayStudySession`, and `gradeStudySessionItem`.

- [ ] **Step 1: Write failing settings test**

```typescript
assert.equal(normalizeSettings({}).dailyPhraseGoal, 10);
assert.equal(normalizeSettings({ dailyPhraseGoal: 6 }).dailyPhraseGoal, 6);
```

- [ ] **Step 2: Verify red**

Run: `npx tsx lib/data/__tests__/settings.test.ts`

Expected: FAIL because `dailyPhraseGoal` is absent.

- [ ] **Step 3: Implement settings mapping, session mapping and settings input**

Map the server's snake-case fields to camel-case TypeScript fields. Add a numeric `每日词组目标` input in the existing learning-settings block and persist it through `setDailySettings`.

- [ ] **Step 4: Verify green**

Run: `npx tsx lib/data/__tests__/settings.test.ts && ./node_modules/.bin/tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/settings.ts lib/data/httpRepo.ts app/(tabs)/profile.tsx lib/data/__tests__/settings.test.ts
git commit -m "feat: add daily phrase goal setting"
```

### Task 4: 会话学习页与词组翻卡

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Create: `components/PhraseFlashCard.tsx`
- Create: `lib/__tests__/studySession.test.ts`

**Interfaces:**
- `PhraseFlashCard({ phrase, meaning, saving, onGrade })` hides answer and grade controls until card flip.
- Normal learning uses the current session item and grades it once through the session API.

- [ ] **Step 1: Write failing transition tests**

```typescript
assert.equal(nextSessionKind([{ kind: 'word_review' }, { kind: 'phrase' }], 0), 'word_review');
assert.equal(nextSessionKind([{ kind: 'word_review' }, { kind: 'phrase' }], 1), 'phrase');
assert.equal(isPhraseAnswerVisible(false), false);
assert.equal(isPhraseAnswerVisible(true), true);
```

- [ ] **Step 2: Verify red**

Run: `npx tsx lib/__tests__/studySession.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Render and advance session items**

Replace normal-mode `getNextQuizWord` and `fetchDuePhraseCards` calls with session loading. Preserve separate extra-practice and review-test flows. Render phrase items with `PhraseFlashCard`; lock buttons while saving and leave the current item intact on an API error.

- [ ] **Step 4: Verify green**

Run: `npx tsx lib/__tests__/studySession.test.ts && ./node_modules/.bin/tsc --noEmit && npm run build:web:cloud`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx components/PhraseFlashCard.tsx lib/__tests__/studySession.test.ts
git commit -m "feat: drive learning with fixed daily sessions"
```

### Task 5: 全量验证与生产部署

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Run full verification**

Run: `cd backend && ./venv/bin/python manage.py test apps.vocab.tests && cd ../.. && ./node_modules/.bin/tsc --noEmit && npm run build:web:cloud`

Expected: all commands exit 0.

- [ ] **Step 2: Deploy migration and backend**

Run: `git push origin main && python3 -m scripts.deploy_restart`

Expected: migration applies and `learning.service` is active.

- [ ] **Step 3: Deploy frontend and verify**

Run: `python3 -m scripts.deploy_frontend && curl -sS https://learning.yusuan.xyz/ | rg -o 'entry-[a-f0-9]+\\.js' | head -1`

Expected: upload succeeds and production references a new entry bundle.

- [ ] **Step 4: Record handoff and commit**

```bash
git add HANDOFF.md
git commit -m "docs: hand off daily learning session queue"
git push origin main
```
