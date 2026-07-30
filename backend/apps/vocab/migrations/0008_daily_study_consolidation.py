from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [("vocab", "0007_daily_study_session_and_phrase_goal")]

    operations = [
        migrations.CreateModel(
            name="DailyStudyConsolidation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("phase", models.CharField(choices=[("flashcards", "新词闪卡"), ("choice", "选择释义"), ("dictation", "单词默写"), ("completed", "已完成")], default="flashcards", max_length=16)),
                ("flashcard_word_ids", models.JSONField(default=list)),
                ("flashcard_queue", models.JSONField(default=list)),
                ("flashcard_pass", models.PositiveSmallIntegerField(default=0)),
                ("flashcard_position", models.PositiveIntegerField(default=0)),
                ("choice_word_ids", models.JSONField(default=list)),
                ("choice_position", models.PositiveIntegerField(default=0)),
                ("dictation_word_ids", models.JSONField(default=list)),
                ("dictation_position", models.PositiveIntegerField(default=0)),
                ("updated_at", models.BigIntegerField(default=0)),
                ("session", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="consolidation", to="vocab.dailystudysession")),
            ],
            options={"db_table": "daily_study_consolidations"},
        ),
    ]
