# Generated manually for phrase-card progress.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("vocab", "0003_usersettings_studylog_is_new_studylog_source_and_more")]

    operations = [
        migrations.CreateModel(
            name="UserPhraseProgress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("user_id", models.BigIntegerField(db_index=True)), ("phrase_key", models.CharField(max_length=64)),
                ("phrase", models.CharField(max_length=255)), ("meaning", models.TextField(blank=True, default="")),
                ("ef", models.FloatField(default=2.5)), ("interval", models.IntegerField(default=0)),
                ("repetitions", models.IntegerField(default=0)), ("due", models.BigIntegerField(default=0)),
                ("correct", models.IntegerField(default=0)), ("wrong", models.IntegerField(default=0)),
                ("word", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="phrase_progress_records", to="vocab.word")),
                ("wordbook", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="phrase_progress_records", to="vocab.wordbook")),
            ],
            options={"db_table": "user_phrase_progress"},
        ),
        migrations.AddConstraint(model_name="userphraseprogress", constraint=models.UniqueConstraint(fields=("user_id", "wordbook", "phrase_key"), name="uq_user_wordbook_phrase")),
        migrations.AddIndex(model_name="userphraseprogress", index=models.Index(fields=["user_id", "wordbook", "due"], name="idx_phrase_progress_due")),
    ]
