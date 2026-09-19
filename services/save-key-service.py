#!/usr/bin/env python3
"""Accept a new OpenRouter API key from the Help page and apply it.

The request arrives from Caddy, which adds the instance name and a shared
secret. The key is written into that app's own .env file (OPENAI_API_KEY) and
the app is restarted so the bots pick it up.
"""
import json
import os
import re
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# One entry per deployment: instance name -> (env file, container name, model file).
# The instance name is what Caddy passes in the X-Instance header.
INSTANCES = {
    "mybots": ("/home/youruser/mybots/.env", "mybots",
               "/home/youruser/mybots/tenant/model.yaml"),
}
SECRET_FILE = Path.home() / ".config/openbot-save-key.secret"  # shared with Caddy
KEY_RE = re.compile(r"^sk-or-v1-[A-Za-z0-9]{16,}$")
MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._:-]*$")


def secret() -> str:
    try:
        return SECRET_FILE.read_text().strip()
    except OSError:
        return ""


def write_key(env_path: str, key: str) -> None:
    """Replace OPENAI_API_KEY in the env file, keeping everything else."""
    lines = Path(env_path).read_text().splitlines()
    replaced = False
    for i, line in enumerate(lines):
        if line.startswith("OPENAI_API_KEY="):
            lines[i] = f"OPENAI_API_KEY={key}"
            replaced = True
    if not replaced:
        lines.append(f"OPENAI_API_KEY={key}")
    Path(env_path).write_text("\n".join(lines) + "\n")


def current_model(env_path: str, model_yaml: str) -> tuple[str, str]:
    """The model the agents run on, and the model the deployment env names."""
    from_yaml = ""
    try:
        for line in Path(model_yaml).read_text().splitlines():
            if line.strip().startswith("default_model:"):
                from_yaml = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    from_env = ""
    try:
        for line in Path(env_path).read_text().splitlines():
            if line.startswith("BOT_MODEL="):
                from_env = line.split("=", 1)[1].strip()
                break
    except OSError:
        pass
    return from_yaml or from_env, from_env


def write_model(env_path: str, model_yaml: str, model: str) -> None:
    """Set the model the agents run on, in the env file and the tenant model file."""
    lines = Path(env_path).read_text().splitlines()
    for var in ("BOT_MODEL", "AGENT_BOT_MODEL"):
        replaced = False
        for i, line in enumerate(lines):
            if line.startswith(var + "="):
                lines[i] = f"{var}={model}"
                replaced = True
        if not replaced:
            lines.append(f"{var}={model}")
    Path(env_path).write_text("\n".join(lines) + "\n")
    try:
        text = Path(model_yaml).read_text()
    except OSError:
        return
    updated = re.sub(r"(?m)^(\s*default_model:\s*).*$", rf"\g<1>{model}", text, count=1)
    if updated != text:
        Path(model_yaml).write_text(updated)


def key_state(env_path: str) -> str:
    try:
        for line in Path(env_path).read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                value = line.split("=", 1)[1].strip()
                return f"set (ends ...{value[-4:]})" if len(value) > 8 else "not set"
    except OSError:
        pass
    return "not set"


def restart(container: str) -> None:
    # The service runs without the docker group; newgrp re-reads membership.
    subprocess.run(
        ["bash", "-c", f"echo 'docker restart {container}' | newgrp docker"],
        capture_output=True, text=True, timeout=180, check=False,
    )


class Handler(BaseHTTPRequestHandler):
    server_version = "openbot-save-key"

    def log_message(self, fmt, *args):  # quieter logs
        pass

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.rstrip("/") != "/info":
            self._json(404, {"error": "Not found."})
            return
        offered = self.headers.get("X-Save-Secret", "")
        if not secret() or offered != secret():
            self._json(403, {"error": "Not authorised."})
            return
        instance = self.headers.get("X-Instance", "").strip()
        target = INSTANCES.get(instance)
        if not target:
            self._json(400, {"error": "Unknown app."})
            return
        env_path, _container, model_yaml = target
        agents_model, env_model = current_model(env_path, model_yaml)
        self._json(200, {
            "model": agents_model,
            "env_model": env_model,
            "key": key_state(env_path),
        })

    def do_POST(self) -> None:
        route = self.path.rstrip("/")
        if route not in ("/save-key", "/save-model"):
            self._json(404, {"error": "Not found."})
            return

        offered = self.headers.get("X-Save-Secret", "")
        if not secret() or offered != secret():
            self._json(403, {"error": "Not authorised."})
            return

        instance = self.headers.get("X-Instance", "").strip()
        target = INSTANCES.get(instance)
        if not target:
            self._json(400, {"error": "Unknown app."})
            return
        env_path, container, model_yaml = target

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._json(400, {"error": "Could not read the request."})
            return

        if route == "/save-model":
            model = str(payload.get("model", "")).strip()
            if not MODEL_RE.match(model):
                self._json(400, {"error": "That does not look like an OpenRouter model id (it should look like vendor/model)."})
                return
            try:
                write_model(env_path, model_yaml, model)
            except OSError as error:
                self._json(500, {"error": f"Could not write the model: {error}"})
                return
            restart(container)
            self._json(200, {"ok": True, "message": "Saved. The app is restarting with the new model - give it about 30 seconds."})
            return

        key = str(payload.get("key", "")).strip()
        if not KEY_RE.match(key):
            self._json(400, {"error": "That does not look like an OpenRouter key (it should start with sk-or-v1-)."})
            return

        try:
            write_key(env_path, key)
        except OSError as error:
            self._json(500, {"error": f"Could not write the key: {error}"})
            return

        restart(container)
        self._json(200, {"ok": True, "message": "Saved to this app's .env. The app is restarting with the new key - give it about 30 seconds."})


if __name__ == "__main__":
    os.makedirs(SECRET_FILE.parent, exist_ok=True)
    if not SECRET_FILE.exists():
        SECRET_FILE.write_text(os.urandom(24).hex())
        os.chmod(SECRET_FILE, 0o600)
    server = ThreadingHTTPServer(("127.0.0.1", 9090), Handler)
    print("save-key service on 127.0.0.1:9090")
    server.serve_forever()