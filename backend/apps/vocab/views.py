"""
词汇学习 API 视图。

所有视图通过 GespJWTAuthentication 获取 request.user.id (yusuan user_id)。
"""

import time

from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StudyLog, UserWordProgress, Word, Wordbook, WordbookWord
from .serializers import (
    ProgressUpdateItem,
    StudyLogSerializer,
    UserWordProgressSerializer,
    WordbookSerializer,
    WordbookWordSerializer,
    WordSerializer,
)


class WordbookViewSet(viewsets.ViewSet):
    """词本 CRUD。"""

    permission_classes = [IsAuthenticated]

    def list(self, request):
        """列出系统词本 + 用户自己的词本。"""
        user_id = request.user.id
        qs = Wordbook.objects.filter(
            Q(owner_id__isnull=True) | Q(owner_id=user_id)
        ).order_by("type", "-created_at")
        serializer = WordbookSerializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request):
        """创建自定义词本。"""
        user_id = request.user.id
        name = request.data.get("name", "").strip()
        if not name:
            return Response({"error": "name 不能为空"}, status=400)

        # 检查重名
        exists = Wordbook.objects.filter(owner_id=user_id, name=name).exists()
        if exists:
            return Response({"error": "词本名已存在"}, status=409)

        wb = Wordbook.objects.create(
            owner_id=user_id,
            name=name,
            level=request.data.get("level"),
            type=Wordbook.Type.CUSTOM,
            created_at=int(time.time() * 1000),
        )
        return Response(WordbookSerializer(wb).data, status=201)

    def destroy(self, request, pk=None):
        """删除自定义词本（仅允许删自己的）。"""
        user_id = request.user.id
        try:
            wb = Wordbook.objects.get(pk=pk, owner_id=user_id)
        except Wordbook.DoesNotExist:
            return Response({"error": "词本不存在"}, status=404)
        wb.delete()
        return Response(status=204)

    @action(detail=True, methods=["get", "post", "delete"], url_path="words")
    def words(self, request, pk=None):
        """词本内单词操作。"""
        user_id = request.user.id
        try:
            wb = Wordbook.objects.get(
                Q(pk=pk) & (Q(owner_id__isnull=True) | Q(owner_id=user_id))
            )
        except Wordbook.DoesNotExist:
            return Response({"error": "词本不存在"}, status=404)

        if request.method == "GET":
            links = WordbookWord.objects.filter(wordbook=wb).select_related("word")
            serializer = WordbookWordSerializer(links, many=True)
            return Response(serializer.data)

        elif request.method == "POST":
            # 添加单词到词本（支持批量）
            word_ids = request.data.get("word_ids", [])
            if not word_ids:
                # 单个添加
                word_id = request.data.get("word_id")
                if word_id:
                    word_ids = [word_id]
            created = 0
            for wid in word_ids:
                _, was_created = WordbookWord.objects.get_or_create(
                    wordbook=wb, word_id=wid
                )
                if was_created:
                    created += 1
            return Response({"added": created}, status=201)

        elif request.method == "DELETE":
            word_id = request.data.get("word_id")
            if not word_id:
                return Response({"error": "需要 word_id"}, status=400)
            deleted, _ = WordbookWord.objects.filter(
                wordbook=wb, word_id=word_id
            ).delete()
            return Response({"removed": deleted})


class ProgressView(APIView):
    """用户学习进度。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """获取用户在某词本的全部进度。"""
        user_id = request.user.id
        wordbook_id = request.query_params.get("wordbook_id")
        qs = UserWordProgress.objects.filter(user_id=user_id)
        if wordbook_id:
            qs = qs.filter(wordbook_id=wordbook_id)
        qs = qs.select_related("word")
        serializer = UserWordProgressSerializer(qs, many=True)
        return Response(serializer.data)

    def put(self, request):
        """批量更新进度（upsert）。"""
        user_id = request.user.id
        items = request.data.get("items", [])
        if not items:
            return Response({"error": "items 不能为空"}, status=400)

        updated = 0
        for item in items:
            wordbook_id = item.get("wordbook_id")
            word_id = item.get("word_id")
            if not wordbook_id or not word_id:
                continue

            defaults = {}
            for field in ("ef", "interval", "repetitions", "due", "correct", "wrong"):
                if field in item and item[field] is not None:
                    defaults[field] = item[field]

            obj, created = UserWordProgress.objects.update_or_create(
                user_id=user_id,
                wordbook_id=wordbook_id,
                word_id=word_id,
                defaults=defaults,
            )
            updated += 1

        return Response({"updated": updated})


class DueWordsView(APIView):
    """获取到期复习词。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.id
        wordbook_id = request.query_params.get("wordbook_id")
        now_ms = int(time.time() * 1000)
        limit = int(request.query_params.get("limit", 50))

        qs = UserWordProgress.objects.filter(
            user_id=user_id, due__lte=now_ms
        )
        if wordbook_id:
            qs = qs.filter(wordbook_id=wordbook_id)
        qs = qs.select_related("word").order_by("due")[:limit]

        serializer = UserWordProgressSerializer(qs, many=True)
        return Response(serializer.data)


class StatsView(APIView):
    """学习统计。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.id
        wordbook_id = request.query_params.get("wordbook_id")

        progress_qs = UserWordProgress.objects.filter(user_id=user_id)
        logs_qs = StudyLog.objects.filter(user_id=user_id)
        if wordbook_id:
            progress_qs = progress_qs.filter(wordbook_id=wordbook_id)
            logs_qs = logs_qs.filter(wordbook_id=wordbook_id)

        total_words = progress_qs.count()
        agg = progress_qs.aggregate(
            total_correct=Sum("correct"),
            total_wrong=Sum("wrong"),
        )
        total_correct = agg["total_correct"] or 0
        total_wrong = agg["total_wrong"] or 0
        total_reviews = total_correct + total_wrong
        accuracy = round(total_correct / total_reviews * 100, 1) if total_reviews > 0 else 0

        # 计算连续学习天数 (streak)
        now_ms = int(time.time() * 1000)
        day_ms = 86400 * 1000
        streak = 0
        check_day = now_ms - (now_ms % day_ms)  # 今天 0 点
        while True:
            day_start = check_day
            day_end = check_day + day_ms
            has_log = logs_qs.filter(ts__gte=day_start, ts__lt=day_end).exists()
            if has_log:
                streak += 1
                check_day -= day_ms
            else:
                # 今天还没学不算断（从今天往前找）
                if check_day == now_ms - (now_ms % day_ms):
                    check_day -= day_ms
                    continue
                break

        # 今日学习量
        today_start = now_ms - (now_ms % day_ms)
        today_count = logs_qs.filter(ts__gte=today_start).count()

        return Response({
            "total_words": total_words,
            "total_reviews": total_reviews,
            "accuracy": accuracy,
            "streak": streak,
            "today_count": today_count,
        })


class StudyLogView(APIView):
    """学习日志上报。"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """批量上报学习记录。"""
        user_id = request.user.id
        logs = request.data.get("logs", [])
        if not logs:
            return Response({"error": "logs 不能为空"}, status=400)

        objs = []
        for log in logs:
            objs.append(StudyLog(
                user_id=user_id,
                wordbook_id=log["wordbook_id"],
                word_id=log["word_id"],
                grade=log["grade"],
                ts=log["ts"],
            ))
        StudyLog.objects.bulk_create(objs)
        return Response({"created": len(objs)}, status=201)


class WordSearchView(APIView):
    """跨词本搜索单词。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response([])
        words = Word.objects.filter(word__icontains=q)[:50]
        serializer = WordSerializer(words, many=True)
        return Response(serializer.data)


class WordViewSet(viewsets.ViewSet):
    """单词查询（按 ID）。"""

    permission_classes = [IsAuthenticated]

    def retrieve(self, request, pk=None):
        try:
            word = Word.objects.get(pk=pk)
        except Word.DoesNotExist:
            return Response({"error": "单词不存在"}, status=404)
        return Response(WordSerializer(word).data)
