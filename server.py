import http.server
import json
import os
import threading
import time
import urllib.request
import urllib.error
from datetime import datetime, date, timedelta

PORT = 8000
DATA_FILE = 'data.json'

# Discord Webhookへメッセージを送信する関数
def send_discord_message(webhook_url, message):
    if not webhook_url:
        return False
    
    headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    payload = json.dumps({"content": message}).encode('utf-8')
    req = urllib.request.Request(webhook_url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return response.status in [200, 204]
    except urllib.error.URLError as e:
        print(f"Discord send failed: {e}")
        return False

# 180日リミットまでの残り日数を計算する関数
def calculate_remaining_days(last_topping_date_str):
    try:
        last_date = datetime.strptime(last_topping_date_str, "%Y-%m-%d").date()
        expiry_date = last_date + timedelta(days=180)
        today = date.today()
        diff = expiry_date - today
        return diff.days
    except Exception as e:
        print(f"Date parsing error: {e}")
        return 999

# バックグラウンドで定期的に期限をチェックしてDiscordに通知するスレッド用関数
def check_deadlines_loop():
    print("Background deadline check thread started.")
    # 起動直後にチェックする前に少し待つ
    time.sleep(10)
    while True:
        try:
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                if isinstance(data, dict):
                    webhook_url = data.get('discordWebhookUrl', '')
                    lines = data.get('lines', [])
                    
                    if webhook_url and lines:
                        warnings = []
                        for line in lines:
                            days = calculate_remaining_days(line.get('lastToppingDate', ''))
                            if days in [30, 7, 1, 0]:
                                if days == 0:
                                    warnings.append(f"⚠️ **【POVO期限当日】** `{line['name']}` の有料トッピング購入期限が当日、または過ぎています！至急トッピングを購入してください。")
                                else:
                                    warnings.append(f"⏰ **【POVO期限警告】** `{line['name']}` の有料トッピング購入期限まで **残り {days} 日** です。")
                        
                        if warnings:
                            full_msg = "\n".join(warnings)
                            send_discord_message(webhook_url, f"📢 **POVO期限自動チェック通知**\n{full_msg}")
        except Exception as e:
            print(f"Error in background check loop: {e}")
        
        # 24時間待機 (86400秒)
        time.sleep(86400)

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def read_data_file(self):
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    # 以前の配列のみの形式だった場合の自動互換変換
                    if isinstance(data, list):
                        data = {"lines": data, "discordWebhookUrl": ""}
                    return data
                except Exception:
                    return {"lines": [], "discordWebhookUrl": ""}
        return {"lines": [], "discordWebhookUrl": ""}

    def write_data_file(self, data):
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def do_GET(self):
        if self.path == '/api/lines':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            data = self.read_data_file()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        else:
            super().do_GET()

    def do_POST(self):
        # データの保存API
        if self.path == '/api/lines':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                # データ形式のバリデーション・整形
                if not isinstance(data, dict):
                    # 配列のみ送られてきた場合のハンドリング
                    current_data = self.read_data_file()
                    current_data['lines'] = data
                    data = current_data
                
                self.write_data_file(data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success"}')
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))

        # Discordのテスト送信API
        elif self.path == '/api/test-discord':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                webhook_url = payload.get('discordWebhookUrl', '')
                
                success = send_discord_message(webhook_url, "✅ **POVO期限マネージャー: Discord連携テスト通知**\nこのメッセージが表示されていれば、連携はバッチリ成功しています！")
                
                self.send_response(200 if success else 400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                if success:
                    self.wfile.write(b'{"status": "success"}')
                else:
                    self.wfile.write('{"status": "failed", "error": "Webhook送信エラー"}'.encode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # 定期チェック監視スレッドの開始 (daemon=Trueでメイン終了時に道連れ停止)
    check_thread = threading.Thread(target=check_deadlines_loop, daemon=True)
    check_thread.start()
    
    print(f"Starting server on port {PORT}...")
    server = http.server.HTTPServer(('0.0.0.0', PORT), CustomHandler)
    server.serve_forever()
