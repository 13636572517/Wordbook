from django.urls import path

from . import views

urlpatterns = [
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
    # 单词搜索
    path("words/search/", views.WordSearchView.as_view()),
    path("words/<int:pk>/", views.WordViewSet.as_view({"get": "retrieve"})),
]
