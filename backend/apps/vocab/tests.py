"""
词汇学习 API 测试。
"""

import time
from datetime import date, datetime
from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import (
    DailyStudySession,
    DailyStudySessionItem,
    StudyLog,
    UserPhraseProgress,
    UserSettings,
    UserWordProgress,
    Word,
    Wordbook,
    WordbookWord,
)


def make_test_token(user_id: int) -> str:
    """生成测试用 JWT token。"""
    from rest_framework_simplejwt.tokens import AccessToken
    token = AccessToken()
    token["user_id"] = user_id
    return str(token)


class DailyStudySessionModelTest(TestCase):
    def setUp(self):
        self.wordbook = Wordbook.objects.create(
            owner_id=None,
            name="每日队列测试词本",
            level="junior",
            type="system",
            created_at=int(time.time() * 1000),
        )
        self.word = Word.objects.create(word="queue", translation="n. 队列")

    def test_user_has_at_most_one_session_per_wordbook_per_day(self):
        DailyStudySession.objects.create(
            user_id=1, wordbook=self.wordbook, study_date=date.today(),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DailyStudySession.objects.create(
                    user_id=1, wordbook=self.wordbook, study_date=date.today(),
                )

    def test_retry_item_cannot_create_another_retry(self):
        session = DailyStudySession.objects.create(
            user_id=1, wordbook=self.wordbook, study_date=date.today(),
        )
        original = DailyStudySessionItem.objects.create(
            session=session,
            position=0,
            kind=DailyStudySessionItem.Kind.WORD_NEW,
            word=self.word,
        )
        retry = DailyStudySessionItem.objects.create(
            session=session,
            position=1,
            kind=DailyStudySessionItem.Kind.WORD_NEW,
            word=self.word,
            retry_of=original,
        )
        self.assertTrue(retry.is_retry)
        self.assertFalse(retry.can_retry)


class DailyStudySessionAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(1)}")
        self.wordbook = Wordbook.objects.create(
            owner_id=None, name="每日会话 API 测试", level="junior", type="system", created_at=0,
        )
        self.due_word = Word.objects.create(word="due", translation="到期词")
        self.new_word = Word.objects.create(
            word="new", translation="新词", phrases=[{"phrase": "new phrase", "meaning": "新词组"}],
        )
        WordbookWord.objects.create(wordbook=self.wordbook, word=self.due_word)
        WordbookWord.objects.create(wordbook=self.wordbook, word=self.new_word)
        UserWordProgress.objects.create(
            user_id=1, wordbook=self.wordbook, word=self.due_word, due=0,
        )
        UserSettings.objects.create(user_id=1, daily_new_word_goal=1, daily_phrase_goal=1)

    def test_creates_fixed_queue_and_grades_idempotently(self):
        resp = self.client.get(f"/api/sessions/today/?wordbook_id={self.wordbook.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(
            list(DailyStudySessionItem.objects.filter(session_id=data["id"]).values_list("kind", flat=True)),
            ["word_review", "word_new", "phrase"],
        )
        self.assertEqual(DailyStudySessionItem.objects.get(session_id=data["id"], position=2).phrase, "new phrase")

        session_id = data["id"]
        resp = self.client.post(f"/api/sessions/{session_id}/items/0/grade/", {"grade": 0}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["current_position"], 1)
        self.assertEqual(StudyLog.objects.count(), 1)

        # 同一位置重复提交只返回既有会话状态，不重复计分或追加重试。
        resp = self.client.post(f"/api/sessions/{session_id}/items/0/grade/", {"grade": 0}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(StudyLog.objects.count(), 1)
        self.assertEqual(DailyStudySessionItem.objects.filter(session_id=session_id).count(), 4)

        # 原始错误题在尾部只追加一次；重试题再错不会再生一题。
        retry = DailyStudySessionItem.objects.get(session_id=session_id, retry_of__isnull=False)
        DailyStudySessionItem.objects.filter(session_id=session_id).update(status="completed")
        DailyStudySessionItem.objects.filter(pk=retry.pk).update(status="pending")
        DailyStudySession.objects.filter(pk=session_id).update(current_position=retry.position)
        resp = self.client.post(f"/api/sessions/{session_id}/items/{retry.position}/grade/", {"grade": 0}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(DailyStudySessionItem.objects.filter(session_id=session_id).count(), 4)

    def test_returns_only_current_item_and_summary_for_large_queues(self):
        resp = self.client.get(f"/api/sessions/today/?wordbook_id={self.wordbook.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertNotIn("items", data)
        self.assertEqual(data["current_item"]["kind"], "word_review")
        self.assertEqual(data["summary"], {"total": 3, "completed": 0, "remaining": 3})


class WordbookAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(1)}")
        self.wb = Wordbook.objects.create(
            owner_id=None,
            name="高中英语",
            level="highschool",
            type="system",
            source="PEPGaoZhong",
            created_at=int(time.time() * 1000),
        )
        self.word = Word.objects.create(
            word="abandon",
            translation="v. 放弃，抛弃",
            pronunciation="/əˈbændən/",
        )
        WordbookWord.objects.create(wordbook=self.wb, word=self.word)

    def test_list_wordbooks(self):
        resp = self.client.get("/api/wordbooks/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "高中英语")
        self.assertEqual(data[0]["word_count"], 1)

    def test_create_custom_wordbook(self):
        resp = self.client.post("/api/wordbooks/", {"name": "我的词本"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["type"], "custom")
        self.assertEqual(resp.json()["owner_id"], 1)

    def test_create_duplicate_name(self):
        self.client.post("/api/wordbooks/", {"name": "测试"})
        resp = self.client.post("/api/wordbooks/", {"name": "测试"})
        self.assertEqual(resp.status_code, 409)

    def test_get_wordbook_words(self):
        resp = self.client.get(f"/api/wordbooks/{self.wb.id}/words/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["word_detail"]["word"], "abandon")

    def test_unauthenticated(self):
        client = APIClient()
        resp = client.get("/api/wordbooks/")
        self.assertEqual(resp.status_code, 401)


class ProgressAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(1)}")
        self.wb = Wordbook.objects.create(
            owner_id=None, name="高中", level="highschool",
            type="system", created_at=int(time.time() * 1000),
        )
        self.word = Word.objects.create(word="test", translation="n. 测试")
        WordbookWord.objects.create(wordbook=self.wb, word=self.word)

    def test_update_and_get_progress(self):
        # 更新进度
        resp = self.client.put("/api/progress/", {
            "items": [{
                "wordbook_id": self.wb.id,
                "word_id": self.word.id,
                "ef": 2.8,
                "interval": 3,
                "repetitions": 2,
                "due": int(time.time() * 1000) + 86400000,
                "correct": 5,
                "wrong": 1,
            }]
        }, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["updated"], 1)

        # 获取进度
        resp = self.client.get(f"/api/progress/?wordbook_id={self.wb.id}")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["ef"], 2.8)
        self.assertEqual(data[0]["correct"], 5)

    def test_due_words(self):
        # 创建一个已过期的进度
        UserWordProgress.objects.create(
            user_id=1, wordbook=self.wb, word=self.word,
            due=int(time.time() * 1000) - 1000,
        )
        resp = self.client.get(f"/api/progress/due/?wordbook_id={self.wb.id}")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)


class StatsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(1)}")
        self.wb = Wordbook.objects.create(
            owner_id=None, name="高中", level="highschool",
            type="system", created_at=int(time.time() * 1000),
        )
        self.word = Word.objects.create(word="hello", translation="int. 你好")

    def test_stats_empty(self):
        resp = self.client.get("/api/stats/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_words"], 0)
        self.assertEqual(data["streak"], 0)

    def test_study_log_and_stats(self):
        now_ms = int(time.time() * 1000)
        # 上报学习日志
        resp = self.client.post("/api/study-logs/", {
            "logs": [
                {"wordbook_id": self.wb.id, "word_id": self.word.id, "grade": 4, "ts": now_ms},
            ]
        }, format="json")
        self.assertEqual(resp.status_code, 201)

        # 创建进度记录
        UserWordProgress.objects.create(
            user_id=1, wordbook=self.wb, word=self.word,
            correct=3, wrong=1,
        )
        resp = self.client.get("/api/stats/")
        data = resp.json()
        self.assertEqual(data["total_reviews"], 4)
        self.assertEqual(data["accuracy"], 75.0)
        self.assertEqual(data["today_count"], 1)


class StudyLogListAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(1)}")
        self.wb = Wordbook.objects.create(
            owner_id=None, name="高中", level="highschool",
            type="system", created_at=int(time.time() * 1000),
        )
        self.word = Word.objects.create(word="hello", translation="int. 你好")

    def test_post_stores_source_is_new_and_activity_type(self):
        now_ms = int(time.time() * 1000)
        resp = self.client.post("/api/study-logs/", {
            "logs": [
                {"wordbook_id": self.wb.id, "word_id": self.word.id, "grade": 4,
                 "ts": now_ms, "source": "quiz", "is_new": True,
                 "activity_type": "dictation"},
            ]
        }, format="json")
        self.assertEqual(resp.status_code, 201)
        log = StudyLog.objects.get()
        self.assertEqual(log.source, "quiz")
        self.assertTrue(log.is_new)
        self.assertEqual(log.activity_type, "dictation")
        listed = self.client.get("/api/study-logs/list/").json()
        self.assertEqual(listed[0]["activity_type"], "dictation")

    def test_list_filter_by_source_and_is_new(self):
        now_ms = int(time.time() * 1000)
        StudyLog.objects.create(user_id=1, wordbook=self.wb, word=self.word,
                                 grade=4, ts=now_ms, source="study", is_new=False)
        StudyLog.objects.create(user_id=1, wordbook=self.wb, word=self.word,
                                 grade=2, ts=now_ms, source="quiz", is_new=True)
        # 另一用户的记录不应泄露
        StudyLog.objects.create(user_id=2, wordbook=self.wb, word=self.word,
                                 grade=3, ts=now_ms, source="quiz", is_new=True)

        # 全量
        resp = self.client.get("/api/study-logs/list/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 2)

        # 按 source 过滤
        resp = self.client.get("/api/study-logs/list/?source=quiz")
        self.assertEqual(len(resp.json()), 1)
        self.assertEqual(resp.json()[0]["source"], "quiz")

        # 按 is_new 过滤
        resp = self.client.get("/api/study-logs/list/?is_new=1")
        self.assertEqual(len(resp.json()), 1)
        self.assertTrue(resp.json()[0]["is_new"])


class UserSettingsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(7)}")

    def test_get_default_and_update(self):
        # 默认值
        resp = self.client.get("/api/settings/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["daily_new_word_goal"], 20)
        self.assertEqual(resp.json()["daily_quiz_goal"], 20)
        self.assertEqual(resp.json()["daily_phrase_goal"], 10)
        self.assertTrue(resp.json()["show_daily_plan"])

        # 只更新新词目标不应覆盖新增设置
        resp = self.client.post("/api/settings/", {"daily_new_word_goal": 35}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["daily_new_word_goal"], 35)
        self.assertEqual(resp.json()["daily_quiz_goal"], 20)
        self.assertTrue(resp.json()["show_daily_plan"])

        # 可独立更新练习目标和每日计划开关
        resp = self.client.post(
            "/api/settings/",
            {"daily_quiz_goal": 12, "daily_phrase_goal": 8, "show_daily_plan": False},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["daily_new_word_goal"], 35)
        self.assertEqual(resp.json()["daily_quiz_goal"], 12)
        self.assertEqual(resp.json()["daily_phrase_goal"], 8)
        self.assertFalse(resp.json()["show_daily_plan"])

        # 再读应持久化
        resp = self.client.get("/api/settings/")
        self.assertEqual(resp.json()["daily_new_word_goal"], 35)
        self.assertEqual(resp.json()["daily_quiz_goal"], 12)
        self.assertEqual(resp.json()["daily_phrase_goal"], 8)
        self.assertFalse(resp.json()["show_daily_plan"])

        # 隔离：另一用户仍是默认
        other = APIClient()
        other.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(8)}")
        resp = other.get("/api/settings/")
        self.assertEqual(resp.json()["daily_new_word_goal"], 20)
        self.assertEqual(resp.json()["daily_quiz_goal"], 20)
        self.assertEqual(resp.json()["daily_phrase_goal"], 10)
        self.assertTrue(resp.json()["show_daily_plan"])

    def test_invalid_goal_rejected(self):
        resp = self.client.post("/api/settings/", {"daily_new_word_goal": 0}, format="json")
        self.assertEqual(resp.status_code, 400)


class TeacherStudentDailyDetailAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {make_test_token(99)}")
        self.wb = Wordbook.objects.create(owner_id=None, name="高中", level="highschool", type="system", created_at=0)
        self.first = Word.objects.create(word="alpha", translation="阿尔法")
        self.second = Word.objects.create(word="beta", translation="贝塔")
        day = int(datetime(2026, 7, 29, 9, 0).timestamp() * 1000)
        StudyLog.objects.create(user_id=7, wordbook=self.wb, word=self.first, grade=2, ts=day, source="study", is_new=True)
        StudyLog.objects.create(user_id=7, wordbook=self.wb, word=self.first, grade=0, ts=day + 1, source="quiz", activity_type="dictation")
        StudyLog.objects.create(user_id=7, wordbook=self.wb, word=self.first, grade=2, ts=day + 2, source="quiz", activity_type="dictation")
        StudyLog.objects.create(user_id=7, wordbook=self.wb, word=self.second, grade=1, ts=day + 3, source="quiz")

    @patch("apps.vocab.views.is_teacher_or_admin", return_value=True)
    def test_returns_word_and_practice_type_aggregates(self, _teacher):
        resp = self.client.get(f"/api/teacher/students/7/daily/2026-07-29/detail/?wordbook_id={self.wb.id}")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["summary"]["correct_attempts"], 3)
        self.assertEqual(body["words"][0]["word"], "beta")
        alpha = next(item for item in body["words"] if item["word"] == "alpha")
        self.assertEqual(alpha["total"], 3)
        self.assertEqual(alpha["correct_count"], 2)
        self.assertEqual(alpha["wrong_count"], 1)
        types = {item["activity_type"]: item for item in body["practice_types"]}
        self.assertEqual(types["dictation"]["total"], 2)
        self.assertEqual(types["unknown"]["total"], 1)
        resp = self.client.post("/api/settings/", {"daily_quiz_goal": 0}, format="json")
        self.assertEqual(resp.status_code, 400)
