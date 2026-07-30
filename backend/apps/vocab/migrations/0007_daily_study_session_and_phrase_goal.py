# Generated manually to keep the deployment migration reviewable.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("vocab", "0006_studylog_activity_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="usersettings",
            name="daily_phrase_goal",
            field=models.IntegerField(default=10, help_text="每日词组学习与复习总数"),
        ),
        migrations.CreateModel(
            name="DailyStudySession",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_id", models.BigIntegerField(db_index=True)),
                ("study_date", models.DateField()),
                ("status", models.CharField(choices=[("active", "进行中"), ("completed", "已完成")], default="active", max_length=16)),
                ("current_position", models.PositiveIntegerField(default=0)),
                ("created_at", models.BigIntegerField(default=0)),
                ("updated_at", models.BigIntegerField(default=0)),
                ("wordbook", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="daily_study_sessions", to="vocab.wordbook")),
            ],
            options={"db_table": "daily_study_sessions"},
        ),
        migrations.CreateModel(
            name="DailyStudySessionItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("position", models.PositiveIntegerField()),
                ("kind", models.CharField(choices=[("word_review", "单词复习"), ("word_new", "学习新词"), ("phrase", "词组学习或复习")], max_length=16)),
                ("status", models.CharField(choices=[("pending", "待学习"), ("completed", "已完成")], default="pending", max_length=16)),
                ("phrase_key", models.CharField(blank=True, default="", max_length=64)),
                ("phrase", models.CharField(blank=True, default="", max_length=255)),
                ("meaning", models.TextField(blank=True, default="")),
                ("grade", models.SmallIntegerField(blank=True, null=True)),
                ("completed_at", models.BigIntegerField(blank=True, null=True)),
                ("retry_of", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="retry_items", to="vocab.dailystudysessionitem")),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="vocab.dailystudysession")),
                ("word", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="daily_session_items", to="vocab.word")),
            ],
            options={"db_table": "daily_study_session_items"},
        ),
        migrations.AddConstraint(
            model_name="dailystudysession",
            constraint=models.UniqueConstraint(fields=("user_id", "wordbook", "study_date"), name="uq_daily_session_user_wordbook_date"),
        ),
        migrations.AddIndex(
            model_name="dailystudysession",
            index=models.Index(fields=["user_id", "study_date"], name="idx_daily_session_user_date"),
        ),
        migrations.AddConstraint(
            model_name="dailystudysessionitem",
            constraint=models.UniqueConstraint(fields=("session", "position"), name="uq_daily_session_item_position"),
        ),
        migrations.AddIndex(
            model_name="dailystudysessionitem",
            index=models.Index(fields=["session", "status", "position"], name="idx_daily_session_item_status"),
        ),
    ]
