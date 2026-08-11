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
    # 词典补全字段（一键补全释义写入）
    definitions = models.JSONField(
        null=True, blank=True,
        help_text='[{"pos": "n.", "definition": "..."}]',
    )
    phrases = models.JSONField(
        null=True, blank=True,
        help_text='[{"phrase": "...", "meaning": "..."}]',
    )
    examples = models.JSONField(
        null=True, blank=True,
        help_text='[{"en": "...", "zh": "..."}]',
    )

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


class UserPhraseProgress(models.Model):
    """用户在词本内对单词词组的独立 SM-2 进度。"""

    user_id = models.BigIntegerField(db_index=True)
    wordbook = models.ForeignKey(Wordbook, on_delete=models.CASCADE, related_name="phrase_progress_records")
    word = models.ForeignKey(Word, on_delete=models.CASCADE, related_name="phrase_progress_records")
    phrase_key = models.CharField(max_length=64)
    phrase = models.CharField(max_length=255)
    meaning = models.TextField(blank=True, default="")
    ef = models.FloatField(default=2.5)
    interval = models.IntegerField(default=0)
    repetitions = models.IntegerField(default=0)
    due = models.BigIntegerField(default=0)
    correct = models.IntegerField(default=0)
    wrong = models.IntegerField(default=0)

    class Meta:
        db_table = "user_phrase_progress"
        constraints = [models.UniqueConstraint(fields=["user_id", "wordbook", "phrase_key"], name="uq_user_wordbook_phrase")]
        indexes = [models.Index(fields=["user_id", "wordbook", "due"], name="idx_phrase_progress_due")]


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
    source = models.CharField(
        max_length=20, default="study",
        help_text="记录来源: study(学习)/quiz(测试)/review(复习)",
    )
    is_new = models.BooleanField(
        default=False, db_index=True,
        help_text="本次是否为新学单词(用于每日新词上限统计)",
    )
    activity_type = models.CharField(
        max_length=32, null=True, blank=True,
        help_text="练习题型；历史记录为空",
    )

    class Meta:
        db_table = "study_logs"
        indexes = [
            models.Index(fields=["user_id", "ts"], name="idx_log_user_ts"),
            models.Index(fields=["user_id", "source"], name="idx_log_user_source"),
        ]

    def __str__(self):
        return f"user={self.user_id} word={self.word.word} grade={self.grade}"


class UserSettings(models.Model):
    """每用户全局学习设置。"""

    user_id = models.BigIntegerField(db_index=True, unique=True)
    daily_new_word_goal = models.IntegerField(default=20, help_text="每日新学单词数上限")
    daily_quiz_goal = models.IntegerField(default=20, help_text="每日智能练习题数目标")
    daily_phrase_goal = models.IntegerField(default=10, help_text="每日词组学习与复习总数")
    show_daily_plan = models.BooleanField(default=True, help_text="是否显示每日学习计划")
    target_finish_date = models.DateField(null=True, blank=True, help_text="目标完成词本日期")

    class Meta:
        db_table = "user_settings"

    def __str__(self):
        return f"user={self.user_id} goal={self.daily_new_word_goal}"


class DailyStudySession(models.Model):
    """用户某词本在某日唯一且固定的学习队列。"""

    class Status(models.TextChoices):
        ACTIVE = "active", "进行中"
        COMPLETED = "completed", "已完成"

    user_id = models.BigIntegerField(db_index=True)
    wordbook = models.ForeignKey(
        Wordbook, on_delete=models.CASCADE, related_name="daily_study_sessions",
    )
    study_date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    current_position = models.PositiveIntegerField(default=0)
    created_at = models.BigIntegerField(default=0)
    updated_at = models.BigIntegerField(default=0)

    class Meta:
        db_table = "daily_study_sessions"
        constraints = [
            models.UniqueConstraint(
                fields=["user_id", "wordbook", "study_date"],
                name="uq_daily_session_user_wordbook_date",
            ),
        ]
        indexes = [
            models.Index(fields=["user_id", "study_date"], name="idx_daily_session_user_date"),
        ]


class DailyStudySessionItem(models.Model):
    """每日学习会话中的不可变题目快照。"""

    class Kind(models.TextChoices):
        WORD_REVIEW = "word_review", "单词复习"
        WORD_NEW = "word_new", "学习新词"
        PHRASE = "phrase", "词组学习或复习"

    class Status(models.TextChoices):
        PENDING = "pending", "待学习"
        COMPLETED = "completed", "已完成"

    session = models.ForeignKey(
        DailyStudySession, on_delete=models.CASCADE, related_name="items",
    )
    position = models.PositiveIntegerField()
    kind = models.CharField(max_length=16, choices=Kind.choices)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    word = models.ForeignKey(Word, on_delete=models.CASCADE, related_name="daily_session_items")
    phrase_key = models.CharField(max_length=64, blank=True, default="")
    phrase = models.CharField(max_length=255, blank=True, default="")
    meaning = models.TextField(blank=True, default="")
    retry_of = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="retry_items",
    )
    grade = models.SmallIntegerField(null=True, blank=True)
    completed_at = models.BigIntegerField(null=True, blank=True)

    class Meta:
        db_table = "daily_study_session_items"
        constraints = [
            models.UniqueConstraint(fields=["session", "position"], name="uq_daily_session_item_position"),
        ]
        indexes = [
            models.Index(fields=["session", "status", "position"], name="idx_daily_session_item_status"),
        ]

    @property
    def is_retry(self):
        return self.retry_of_id is not None

    @property
    def can_retry(self):
        return not self.is_retry


class DailyStudyConsolidation(models.Model):
    """每日学习完成后的可恢复巩固流程快照。"""

    class Phase(models.TextChoices):
        FLASHCARDS = "flashcards", "新词闪卡"
        CHOICE = "choice", "选择释义"
        DICTATION = "dictation", "单词默写"
        COMPLETED = "completed", "已完成"

    session = models.OneToOneField(
        DailyStudySession, on_delete=models.CASCADE, related_name="consolidation",
    )
    phase = models.CharField(max_length=16, choices=Phase.choices, default=Phase.FLASHCARDS)
    flashcard_word_ids = models.JSONField(default=list)
    flashcard_queue = models.JSONField(default=list)
    flashcard_pass = models.PositiveSmallIntegerField(default=0)
    flashcard_position = models.PositiveIntegerField(default=0)
    choice_word_ids = models.JSONField(default=list)
    choice_position = models.PositiveIntegerField(default=0)
    dictation_word_ids = models.JSONField(default=list)
    dictation_position = models.PositiveIntegerField(default=0)
    updated_at = models.BigIntegerField(default=0)

    class Meta:
        db_table = "daily_study_consolidations"
