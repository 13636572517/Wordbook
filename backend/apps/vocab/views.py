"""
词汇学习 API 视图。

所有视图通过 GespJWTAuthentication 获取 request.user.id (yusuan user_id)。
"""

import json
import time
import urllib.parse
import urllib.request

from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .admin_check import is_admin_user
from .models import StudyLog, UserSettings, UserWordProgress, Word, Wordbook, WordbookWord
from .serializers import (
    ProgressUpdateItem,
    StudyLogSerializer,
    UserSettingsSerializer,
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
        """创建词本（仅管理员）。"""
        user_id = request.user.id
        if not is_admin_user(user_id):
            return Response({"error": "仅管理员可以创建词本"}, status=403)
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
            links = WordbookWord.objects.filter(wordbook=wb).select_related("word").order_by("id")
            # slim=1: 省略 definitions/phrases/examples 大字段（测验流程用，大幅减小响应）
            if request.query_params.get("slim") == "1":
                data = [
                    {
                        "wordbook_id": link.wordbook_id,
                        "word_id": link.word_id,
                        "word_detail": {
                            "id": link.word.id,
                            "word": link.word.word,
                            "translation": link.word.translation,
                            "pronunciation": link.word.pronunciation,
                        },
                    }
                    for link in links
                ]
                return Response(data)
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
                source=log.get("source", "study"),
                is_new=bool(log.get("is_new", False)),
            ))
        StudyLog.objects.bulk_create(objs)
        return Response({"created": len(objs)}, status=201)


class StudyLogListView(APIView):
    """查询学习日志（今日报告 / 每日新词上限统计用）。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.id
        qs = StudyLog.objects.filter(user_id=user_id)

        wordbook_id = request.query_params.get("wordbook_id")
        if wordbook_id:
            qs = qs.filter(wordbook_id=wordbook_id)

        since_ts = request.query_params.get("since_ts")
        if since_ts:
            qs = qs.filter(ts__gte=int(since_ts))

        source = request.query_params.get("source")
        if source:
            qs = qs.filter(source=source)

        is_new = request.query_params.get("is_new")
        if is_new is not None and is_new != "":
            qs = qs.filter(is_new=bool(int(is_new)))

        qs = qs.order_by("ts")
        serializer = StudyLogSerializer(qs, many=True)
        return Response(serializer.data)


class UserSettingsView(APIView):
    """每用户设置：每日新词上限。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.id
        obj, _ = UserSettings.objects.get_or_create(
            user_id=user_id, defaults={"daily_new_word_goal": 20}
        )
        return Response(UserSettingsSerializer(obj).data)

    def post(self, request):
        user_id = request.user.id
        goal = request.data.get("daily_new_word_goal")
        if goal is None:
            return Response({"error": "daily_new_word_goal 不能为空"}, status=400)
        try:
            goal = int(goal)
        except (TypeError, ValueError):
            return Response({"error": "daily_new_word_goal 必须为整数"}, status=400)
        if goal <= 0:
            return Response({"error": "daily_new_word_goal 必须大于 0"}, status=400)

        obj, _ = UserSettings.objects.update_or_create(
            user_id=user_id,
            defaults={"daily_new_word_goal": goal},
        )
        return Response(UserSettingsSerializer(obj).data)


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
    """单词查询（按 ID）/ 创建或获取（手动添加单词时自动入库）。"""

    permission_classes = [IsAuthenticated]

    def retrieve(self, request, pk=None):
        try:
            word = Word.objects.get(pk=pk)
        except Word.DoesNotExist:
            return Response({"error": "单词不存在"}, status=404)
        return Response(WordSerializer(word).data)

    def create(self, request):
        """创建或获取单词（word 唯一）。手动添加单词时调用：

        - 已存在：直接返回已有记录（不覆盖其丰富释义）。
        - 不存在：用提交字段创建新单词（自动补充释义）。
        """
        word = (request.data.get("word") or "").strip().lower()
        if not word:
            return Response({"error": "word 不能为空"}, status=400)
        translation = (request.data.get("translation") or "").strip()
        pronunciation = request.data.get("pronunciation") or request.data.get("phonetic") or None
        definitions = request.data.get("definitions")
        phrases = request.data.get("phrases")
        examples = request.data.get("examples")

        obj, created = Word.objects.get_or_create(word=word)
        if created:
            if translation:
                obj.translation = translation
            if pronunciation:
                obj.pronunciation = pronunciation
            if definitions is not None:
                obj.definitions = definitions
            if phrases is not None:
                obj.phrases = phrases
            if examples is not None:
                obj.examples = examples
            obj.save()
        return Response(WordSerializer(obj).data, status=201 if created else 200)


class TtsProxyView(APIView):
    """真人发音代理：服务端拉取有道 dictvoice 音频并同源回传。

    前端（尤其华为 HarmonyOS 的 webview）直接用跨域 Audio() 播放
    dict.youdao.com 会因 CORS / 自动播放策略静默失败，且无英文 TTS 引擎。
    改为同源 /api/tts/ 拉流，规避跨域，所有手机浏览器/PWA 均可可靠播放。
    公开接口（仅代理单个单词发音，低风险）。
    """

    permission_classes = [AllowAny]

    def get(self, request):
        word = (request.query_params.get("word") or "").strip()
        if not word:
            return Response({"error": "word 不能为空"}, status=400)
        # 仅允许单词/短语，防滥用
        if len(word) > 60 or not all(
            c.isalnum() or c in " -'" for c in word
        ):
            return Response({"error": "非法 word"}, status=400)
        ttype = request.query_params.get("type", "1")  # 1=美音 0=英音
        if ttype not in ("0", "1"):
            ttype = "1"
        url = (
            "https://dict.youdao.com/dictvoice?audio="
            + urllib.parse.quote(word)
            + "&type="
            + ttype
        )
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36"
                    ),
                    "Referer": "https://dict.youdao.com/",
                },
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
                ctype = resp.headers.get("Content-Type", "audio/mpeg")
            return HttpResponse(data, content_type=ctype)
        except Exception as e:  # noqa: BLE001
            return Response({"error": f"TTS 代理失败: {e}"}, status=502)


class DictProxyView(APIView):
    """词典查询代理：服务端拉取有道 jsonapi_s 并同源回传原始 JSON。

    前端（尤其华为 HarmonyOS / 浏览器 web）直接请求 dict.youdao.com 会被
    CORS 拦截，导致自动匹配释义失败 → 释义无法自动填充 → 单词无法保存。
    改为同源 /api/dict/?q=word 由后端代理，前端复用现有 parseYoudao 解析。
    公开接口（仅代理单词查询，低风险）。
    """

    permission_classes = [AllowAny]

    def get(self, request):
        q = (request.query_params.get("q") or request.query_params.get("word") or "").strip()
        if not q:
            return Response({"error": "q 不能为空"}, status=400)
        # 仅允许单词/短语，防滥用
        if len(q) > 60 or not all(c.isalnum() or c in " -'" for c in q):
            return Response({"error": "非法查询词"}, status=400)
        params = urllib.parse.urlencode(
            {"doctype": "json", "jsonversion": "4", "q": q, "le": "en"}
        )
        url = "https://dict.youdao.com/jsonapi_s?" + params
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36"
                    ),
                    "Referer": "https://dict.youdao.com/",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = resp.read()
            # 校验是合法 JSON 再回传（有道偶尔返回非 JSON 错误页）
            parsed = json.loads(data.decode("utf-8"))
            return Response(parsed)
        except Exception as e:  # noqa: BLE001
            return Response({"error": f"词典代理失败: {e}"}, status=502)


class MeView(APIView):
    """当前用户信息（含管理员状态）。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_id = request.user.id
        return Response({
            "user_id": user_id,
            "is_admin": is_admin_user(user_id),
        })


class EnrichView(APIView):
    """一键补全释义（仅管理员，仅网页版调用）。"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """获取补全进度。"""
        if not is_admin_user(request.user.id):
            return Response({"error": "仅管理员可查看"}, status=403)
        from .enrich_service import get_progress
        return Response(get_progress())

    def post(self, request):
        """启动补全任务。"""
        if not is_admin_user(request.user.id):
            return Response({"error": "仅管理员可以运行补全"}, status=403)
        from .enrich_service import start_task
        result = start_task()
        if not result["started"]:
            return Response(result, status=409)
        return Response(result, status=202)


class EnrichStopView(APIView):
    """停止补全任务（仅管理员）。"""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not is_admin_user(request.user.id):
            return Response({"error": "仅管理员可以操作"}, status=403)
        from .enrich_service import stop_task
        return Response(stop_task())
