#!/usr/bin/env bash
# プロジェクトをローカルで配信する（Playwright MCP やブラウザで見るため）。
#   tools/serve.sh        … http://127.0.0.1:8766/ で配信（既定ポート 8766）
#   tools/serve.sh stop   … 止める
# 注意: pkill -f "http.server" は実行したシェル自身にもマッチして落ちるので、stop を使う。
# 返すファイルには Cache-Control: no-cache を付ける（共通ファイルを直したとき、ブラウザが古い写しを使わない）。
set -euo pipefail
PORT="${2:-8766}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${XDG_CACHE_HOME:-$HOME/.cache}/youtube-ga-mieru-made"
PIDFILE="$WORK/serve-$PORT.pid"
mkdir -p "$WORK"
running() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
if [ "${1:-}" = "stop" ]; then
  if running; then kill "$(cat "$PIDFILE")"; rm -f "$PIDFILE"; echo "stopped: port $PORT"; else rm -f "$PIDFILE"; echo "not running: port $PORT"; fi
  exit 0
fi
if running; then echo "already serving: http://127.0.0.1:$PORT/"; exit 0; fi
# Cache-Control: no-cache を付けて返す（engine.js や base.css を直したとき、ブラウザが古い写しを使い続けないように）
nohup python3 -c '
import functools, http.server, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
port, root = int(sys.argv[1]), sys.argv[2]
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=root)).serve_forever()
' "$PORT" "$ROOT" > "$WORK/serve-$PORT.log" 2>&1 &
echo $! > "$PIDFILE"
sleep 0.5
if running; then echo "serving: http://127.0.0.1:$PORT/"; else echo "failed: $(tail -3 "$WORK/serve-$PORT.log")" >&2; exit 1; fi
