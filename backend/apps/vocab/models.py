"""
词汇学习数据模型。

user_id 为 BigIntegerField，无外键（跨库引用 yusuan 用户）。
"""

from django.db import models


class Wordbook(models.Model):
    """词本：系统词本(owner=NULL) 或 用户自定义词本。"""

    class Type(models.TextChoices):
        SYSTEM = "system", "系统词本"
        CUSTOM = "custom", "自定义词本"

    owner_id = models.BigIntegerField(
        null=True, blank=True, db_index=True,
        help_text="NULL=系统词本；否则为 yusuan user_id",
    )
    name = models.CharField(max_length=120)
    level = models.CharField(
        max_length=40, null=True, blank=True,
        help_text="highschool / cet4 / cet6 / NULL(自定义)",
    )
    type = models.CharField(
        max_length=10, choices=Type.choices, default=Type.SYSTEM,
    )
    source = models.CharField(
        max_length=120, null=True, blank=True,
        help_text="内置词表来源标识，如 PEPGaoZhong",
    )
    created_at = models.BigIntegerField(help_text="Unix ms 时间戳")

    class Meta:
        db_table = "wordbooks"
        constraints = [
            models.UniqueConstraint(
                fields=["owner_id", "name"],
                name="uq_owner_name",
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.type})"


class Word(models.Model):
    """单词条目（全局唯一）。"""

    word = models.CharField(max_length=120, unique=True)
    translation = models.TextField()
    pronunciation = models.CharField(max_length=120, null=True, blank=True)

    class Meta:
        db_table = "words"

    def __str__(self):
        return self.word


class WordbookWord(models.Model):
    """词本-单词 多对多关联。"""

    wordbook = models.ForeignKey(
        Wordbook, on_delete=models.CASCADE, related_name="word_links",
    )
    word = models.ForeignKey(
        Word, on_delete=models.CASCADE, related_name="wordbook_links",
    )

    class Meta:
        db_table = "wordbook_words"
        constraints = [
            models.UniqueConstraint(
                fields=["wordbook", "word"],
                name="uq_wordbook_word",
            ),
        ]

    def __str__(self):
        return f"{self.wordbook.name} -> {self.word.word}"


class UserWordProgress(models.Model):
    """用户单词学习进度（SM-2 算法字段）。"""

    user_id = models.BigIntegerField(db_index=True)
    wordbook = models.ForeignKey(
        Wordbook, on_delete=models.CASCADE, related_name="progress_records",
    )
    word = models.ForeignKey(
        Word, on_delete=models.CASCADE, related_name="progress_records",
    )
    ef = models.FloatField(default=2.5, help_text="SM-2 ease factor")
    interval = models.IntegerField(default=0, help_text="SM-2 间隔(天)")
    repetitions = models.IntegerField(default=0)
    due = models.BigIntegerField(default=0, help_text="下次复习 Unix ms")
    correct = models.IntegerField(default=0)
    wrong = models.IntegerField(default=0)

    class Meta:
        db_table = "user_word_progress"
        constraints = [
            models.UniqueConstraint(
                fields=["user_id", "wordbook", "word"],
                name="uq_user_wordbook_word",
            ),
        ]
        indexes = [
            models.Index(
                fields=["user_id", "wordbook", "due"],
                name="idx_progress_due",
            ),
        ]

    def __str__(self):
        return f"user={self.user_id} word={self.word.word} due={self.due}"


class StudyLog(models.Model):
    """学习日志（每次复习记录）。"""

    user_id = models.BigIntegerField(db_index=True)
    wordbook = models.ForeignKey(
        Wordbook, on_delete=models.CASCADE, related_name="study_logs",
    )
    word = models.ForeignKey(
        Word, on_delete=models.CASCADE, related_name="study_logs",
    )
    grade = models.SmallIntegerField(help_text="SM-2 评分 0-5")
    ts = models.BigIntegerField(help_text="Unix ms 时间戳")

    class Meta:
        db_table = "study_logs"
        indexes = [
            models.Index(fields=["user_id", "ts"], name="idx_log_user_ts"),
        ]

    def __str__(self):
        return f"user={self.user_id} word={self.word.word} grade={self.grade}"
