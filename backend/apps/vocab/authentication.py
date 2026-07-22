"""
GESP SSO JWT 校验。

不建 users 表、不存密码。
校验 GESP 签发的 JWT，从 payload 中提取 user_id 注入 request。
"""

from rest_framework import authentication, exceptions
from rest_framework_simplejwt.tokens import AccessToken


class GespUser:
    """轻量用户对象，仅携带 user_id（来自 GESP JWT payload）。"""

    is_authenticated = True
    is_active = True
    is_anonymous = False

    def __init__(self, user_id: int):
        self.id = user_id
        self.pk = user_id

    def __str__(self):
        return f"GespUser({self.id})"


class GespJWTAuthentication(authentication.BaseAuthentication):
    """
    解析 Authorization: Bearer <token>，
    使用 GESP 共享密钥校验签名，提取 user_id。
    """

    def authenticate(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None  # 交给下一个 authenticator

        token_str = auth_header[7:]
        try:
            token = AccessToken(token_str)
        except Exception as exc:
            raise exceptions.AuthenticationFailed(f"Token 无效: {exc}")

        # GESP SimpleJWT payload 中 user_id 字段
        user_id = token.get("user_id") or token.get("id")
        if user_id is None:
            raise exceptions.AuthenticationFailed("Token 中缺少 user_id")

        return (GespUser(int(user_id)), token)

    def authenticate_header(self, request):
        return "Bearer"
