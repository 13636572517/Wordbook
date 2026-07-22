"""
paramiko SSH 客户端 —— 用于连接阿里云后端服务器。

凭证从仓库根目录的 server-credentials.json 读取（该文件已被 .gitignore 忽略，
绝不进 git）。本模块只做 SSH 连接与命令执行，不持有任何明文密码。

用法（只读探测，安全）:
    from ssh_client import SSHClient
    with SSHClient() as c:
        print(c.run("whoami && uname -a"))

写操作（migrate / 重启 / 部署）务必在调用方显式确认后再执行。
"""
import json
import os
from pathlib import Path

import paramiko

REPO_ROOT = Path(__file__).resolve().parent.parent
CREDS_PATH = REPO_ROOT / "server-credentials.json"


def load_creds() -> dict:
    if not CREDS_PATH.exists():
        raise FileNotFoundError(
            f"缺少凭证文件 {CREDS_PATH}（应已被 .gitignore 忽略，请勿提交）"
        )
    return json.loads(CREDS_PATH.read_text(encoding="utf-8"))


class SSHClient:
    def __init__(self, timeout: int = 15):
        self._creds = load_creds()
        self._timeout = timeout
        self._client: paramiko.SSHClient | None = None

    def connect(self) -> "SSHClient":
        creds = self._creds
        client = paramiko.SSHClient()
        # 自动接受主机密钥（内网固定服务器，首次连接免手动 yes）
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=creds["host"],
            port=int(creds.get("port", 22)),
            username=creds["user"],
            password=creds["password"],
            timeout=self._timeout,
            look_for_keys=False,
            allow_agent=False,
        )
        self._client = client
        return self

    def run(self, cmd: str, timeout: int = 60) -> tuple[int, str, str]:
        """执行命令，返回 (exit_status, stdout, stderr)。"""
        if self._client is None:
            self.connect()
        assert self._client is not None
        stdin, stdout, stderr = self._client.exec_command(cmd, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return code, out, err

    def read_file(self, remote_path: str) -> str:
        """通过 SFTP 读取远程文件内容（只读）。"""
        if self._client is None:
            self.connect()
        assert self._client is not None
        sftp = self._client.open_sftp()
        try:
            with sftp.open(remote_path, "r") as f:
                return f.read().decode("utf-8", "replace")
        finally:
            sftp.close()

    def sudo_run(self, cmd: str, timeout: int = 120) -> tuple[int, str, str]:
        """以 sudo 执行命令（密码经 pty 从 stdin 喂入，不进命令行、不打印）。"""
        import select

        if self._client is None:
            self.connect()
        assert self._client is not None
        session = self._client.get_transport().open_session()
        session.get_pty()
        session.exec_command(f"sudo -S {cmd}")
        session.send(self._creds["password"] + "\n")
        out_b, err_b = b"", b""
        while True:
            r, _, _ = select.select([session], [], [], timeout)
            if r:
                if session.recv_ready():
                    out_b += session.recv(4096)
                if session.recv_stderr_ready():
                    err_b += session.recv_stderr(4096)
            if session.exit_status_ready():
                while session.recv_ready():
                    out_b += session.recv(4096)
                while session.recv_stderr_ready():
                    err_b += session.recv_stderr(4096)
                break
        code = session.recv_exit_status()
        session.close()
        return code, out_b.decode("utf-8", "replace"), err_b.decode("utf-8", "replace")

    def __enter__(self) -> "SSHClient":
        return self.connect()

    def __exit__(self, *exc) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None


if __name__ == "__main__":
    # 直接运行 = 只读连通性探测
    with SSHClient() as c:
        code, out, err = c.run("whoami && uname -a && date")
        print(f"[exit={code}]\n{out}{err}")
