"""
词汇学习 API 测试。
"""

import time

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import UserWordProgress, Word, Wordbook, WordbookWord


def make_test_token(user_id: int) -> str:
    """生成测试用 JWT token。"""
    from rest_framework_simplejwt.tokens import AccessToken
    token = AccessToken()
    token["user_id"] = user_id
    return str(token)


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
