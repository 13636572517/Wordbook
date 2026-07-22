from rest_framework import serializers

from .models import StudyLog, UserSettings, UserWordProgress, Word, Wordbook, WordbookWord


class WordbookSerializer(serializers.ModelSerializer):
    word_count = serializers.SerializerMethodField()

    class Meta:
        model = Wordbook
        fields = ["id", "owner_id", "name", "level", "type", "source", "created_at", "word_count"]
        read_only_fields = ["id", "created_at"]

    def get_word_count(self, obj):
        return obj.word_links.count()


class WordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Word
        fields = ["id", "word", "translation", "pronunciation", "definitions", "phrases", "examples"]


class WordbookWordSerializer(serializers.ModelSerializer):
    word_detail = WordSerializer(source="word", read_only=True)

    class Meta:
        model = WordbookWord
        fields = ["wordbook_id", "word_id", "word_detail"]


class UserWordProgressSerializer(serializers.ModelSerializer):
    word_text = serializers.CharField(source="word.word", read_only=True)
    translation = serializers.CharField(source="word.translation", read_only=True)

    class Meta:
        model = UserWordProgress
        fields = [
            "user_id", "wordbook_id", "word_id",
            "word_text", "translation",
            "ef", "interval", "repetitions", "due", "correct", "wrong",
        ]
        read_only_fields = ["user_id"]


class ProgressUpdateItem(serializers.Serializer):
    """批量更新进度的单条数据。"""
    wordbook_id = serializers.IntegerField()
    word_id = serializers.IntegerField()
    ef = serializers.FloatField(required=False)
    interval = serializers.IntegerField(required=False)
    repetitions = serializers.IntegerField(required=False)
    due = serializers.BigIntegerField(required=False)
    correct = serializers.IntegerField(required=False)
    wrong = serializers.IntegerField(required=False)


class StudyLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudyLog
        fields = ["id", "user_id", "wordbook_id", "word_id", "grade", "ts", "source", "is_new"]
        read_only_fields = ["id", "user_id"]


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ["user_id", "daily_new_word_goal"]
        read_only_fields = ["user_id"]


class StudyLogBatchSerializer(serializers.Serializer):
    """批量上报学习记录。"""
    logs = StudyLogSerializer(many=True)
