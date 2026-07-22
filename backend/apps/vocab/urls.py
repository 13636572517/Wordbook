from django.urls import path

from . import views

urlpatterns = [
    # 用户信息
    path("me/", views.MeView.as_view()),
    # 词本
    path("wordbooks/", views.WordbookViewSet.as_view({"get": "list", "post": "create"})),
    path("wordbooks/<int:pk>/", views.WordbookViewSet.as_view({"delete": "destroy"})),
    path("wordbooks/<int:pk>/words/", views.WordbookViewSet.as_view({"get": "words", "post": "words", "delete": "words"})),
    # 进度
    path("progress/", views.ProgressView.as_view()),
    path("progress/due/", views.DueWordsView.as_view()),
    # 统计
    path("stats/", views.StatsView.as_view()),
    # 学习日志
    path("study-logs/", views.StudyLogView.as_view()),
    path("study-logs/list/", views.StudyLogListView.as_view()),
    # 用户设置（每日新词上限）
    path("settings/", views.UserSettingsView.as_view()),
    # 单词搜索
    path("words/search/", views.WordSearchView.as_view()),
    path("words/", views.WordViewSet.as_view({"post": "create"})),
    path("words/<int:pk>/", views.WordViewSet.as_view({"get": "retrieve"})),
    # 一键补全释义（管理员）
    path("enrich/", views.EnrichView.as_view()),
    path("enrich/stop/", views.EnrichStopView.as_view()),
]
