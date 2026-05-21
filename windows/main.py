import sys
import os
import requests
from PyQt5.QtWidgets import QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QLineEdit, QPushButton, QMessageBox, QInputDialog, QCheckBox
from PyQt5.QtCore import Qt, QUrl
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtGui import QIcon

class LoginWindow(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle('登录 - 维修工单系统')
        self.setGeometry(400, 200, 400, 400)
        self.setWindowFlags(Qt.WindowStaysOnTopHint)
        
        # 加载保存的服务器地址
        self.server_url = self.load_server_url()
        
        # 加载保存的用户名和密码
        saved_creds = self.load_saved_credentials()
        self.saved_username = saved_creds.get('username', '')
        self.saved_password = saved_creds.get('password', '')
        self.saved_remember = saved_creds.get('remember', False)
        
        layout = QVBoxLayout()
        
        # 标题
        title_label = QLabel('维修工单系统')
        title_label.setAlignment(Qt.AlignCenter)
        title_label.setStyleSheet('font-size: 24px; font-weight: bold; margin-bottom: 30px;')
        layout.addWidget(title_label)
        
        # 服务器地址设置
        server_layout = QHBoxLayout()
        server_label = QLabel('服务器地址:')
        self.server_input = QLineEdit(self.server_url)
        self.server_input.setPlaceholderText('请输入服务器地址，如 http://localhost')
        server_button = QPushButton('设置')
        server_button.clicked.connect(self.set_server_url)
        server_layout.addWidget(server_label)
        server_layout.addWidget(self.server_input)
        server_layout.addWidget(server_button)
        layout.addLayout(server_layout)
        
        # 用户名输入
        user_layout = QHBoxLayout()
        user_label = QLabel('用户名:')
        self.user_input = QLineEdit()
        self.user_input.setText(self.saved_username)
        self.user_input.setPlaceholderText('请输入用户名')
        user_layout.addWidget(user_label)
        user_layout.addWidget(self.user_input)
        layout.addLayout(user_layout)
        
        # 密码输入
        password_layout = QHBoxLayout()
        password_label = QLabel('密码:')
        self.password_input = QLineEdit()
        self.password_input.setText(self.saved_password)
        self.password_input.setPlaceholderText('请输入密码')
        self.password_input.setEchoMode(QLineEdit.Password)
        password_layout.addWidget(password_label)
        password_layout.addWidget(self.password_input)
        layout.addLayout(password_layout)
        
        # 记住密码选项
        remember_layout = QHBoxLayout()
        self.remember_checkbox = QCheckBox('记住密码')
        self.remember_checkbox.setChecked(self.saved_remember)
        remember_layout.addWidget(self.remember_checkbox)
        layout.addLayout(remember_layout)
        
        # 登录按钮
        self.login_button = QPushButton('登录')
        self.login_button.setStyleSheet('font-size: 16px; padding: 10px;')
        self.login_button.clicked.connect(self.login)
        layout.addWidget(self.login_button)
        
        # 状态栏
        self.status_label = QLabel('就绪')
        self.status_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(self.status_label)
        
        self.setLayout(layout)
    
    def load_server_url(self):
        """加载保存的服务器地址"""
        config_file = 'server_config.txt'
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    return f.read().strip()
            except:
                return 'http://localhost'
        return 'http://localhost'
    
    def save_server_url(self, url):
        """保存服务器地址"""
        config_file = 'server_config.txt'
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                f.write(url)
            return True
        except:
            return False
    
    def set_server_url(self):
        """设置服务器地址"""
        url, ok = QInputDialog.getText(self, '设置服务器地址', '请输入服务器地址:', text=self.server_input.text())
        if ok and url:
            self.server_input.setText(url)
            if self.save_server_url(url):
                QMessageBox.information(self, '成功', '服务器地址已保存')
            else:
                QMessageBox.warning(self, '错误', '保存服务器地址失败')
    
    def load_saved_credentials(self):
        """加载保存的用户名和密码"""
        config_file = 'credentials.json'
        if os.path.exists(config_file):
            try:
                import json
                with open(config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {'username': '', 'password': '', 'remember': False}
        return {'username': '', 'password': '', 'remember': False}
    
    def save_credentials(self, username, password, remember):
        """保存用户名和密码"""
        config_file = 'credentials.json'
        try:
            import json
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump({'username': username, 'password': password, 'remember': remember}, f)
            return True
        except:
            return False
    
    def login(self):
        """登录操作"""
        server_url = self.server_input.text().strip()
        if not server_url:
            QMessageBox.warning(self, '错误', '请输入服务器地址')
            return
        
        # 验证服务器地址格式
        if not (server_url.startswith('http://') or server_url.startswith('https://')):
            server_url = 'http://' + server_url
        
        # 获取用户名和密码
        username = self.user_input.text().strip()
        password = self.password_input.text().strip()
        
        if not username or not password:
            QMessageBox.warning(self, '错误', '请输入用户名和密码')
            return
        
        # 更新状态栏
        self.status_label.setText('正在登录...')
        
        try:
            # 构建登录API URL (使用正确的路径 /api/auth/login)
            login_url = f'{server_url}/api/auth/login'
            
            # 发送登录请求
            response = requests.post(
                login_url,
                json={'username': username, 'password': password},
                timeout=10
            )
            
            # 检查响应状态
            if response.status_code == 200:
                # 登录成功
                data = response.json()
                
                # 检查响应格式（后端返回token和user信息）
                if 'token' in data and 'user' in data:
                    # 保存服务器地址
                    self.save_server_url(server_url)
                    
                    # 保存用户名和密码（如果选择了记住密码）
                    remember = self.remember_checkbox.isChecked()
                    if remember:
                        self.save_credentials(username, password, remember)
                    else:
                        # 如果取消记住密码，清除保存的凭证
                        self.save_credentials('', '', False)
                    
                    # 保存token信息
                    token = data.get('token')
                    user_info = data.get('user')
                    
                    # 创建并显示浏览器窗口
                    global browser_window
                    browser_window = BrowserWindow()
                    browser_window.token = token
                    browser_window.user_info = user_info
                    
                    # 构建带认证信息的URL（如果需要）
                    # 或者直接加载服务器地址
                    browser_window.load_url(server_url)
                    browser_window.showFullScreen()
                    browser_window.raise_()
                    browser_window.activateWindow()
                    
                    # 关闭登录窗口
                    self.close()
                else:
                    # 处理错误响应
                    error_message = data.get('error', '登录失败')
                    QMessageBox.warning(self, '登录失败', error_message)
            else:
                # 处理非200响应
                try:
                    error_data = response.json()
                    error_message = error_data.get('error', f'服务器响应错误: {response.status_code}')
                except:
                    error_message = f'服务器响应错误: {response.status_code}'
                QMessageBox.warning(self, '登录失败', error_message)
        except requests.exceptions.RequestException as e:
            # 网络错误或服务器未运行
            QMessageBox.warning(self, '登录失败', f'无法连接到服务器: {str(e)}')
        except Exception as e:
            # 其他错误
            QMessageBox.warning(self, '登录失败', f'发生错误: {str(e)}')
        finally:
            # 恢复状态栏
            self.status_label.setText('就绪')

class BrowserWindow(QMainWindow):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle('维修工单系统 - 浏览器')
        self.setWindowState(Qt.WindowFullScreen)
        self.token = None
        self.user_info = None
        
        # 创建主控件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 主布局
        main_layout = QVBoxLayout(central_widget)
        
        # 创建WebView
        self.web_view = QWebEngineView()
        main_layout.addWidget(self.web_view)
        
        # 获取WebEngineProfile
        self.profile = self.web_view.page().profile()
        
        # 连接信号
        self.web_view.loadStarted.connect(self.on_load_started)
        self.web_view.loadFinished.connect(self.on_load_finished)
    
    def load_server_url(self):
        """加载保存的服务器地址"""
        config_file = 'server_config.txt'
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r', encoding='utf-8') as f:
                    return f.read().strip()
            except:
                return 'http://localhost'
        return 'http://localhost'
    
    def save_server_url(self, url):
        """保存服务器地址"""
        config_file = 'server_config.txt'
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                f.write(url)
            return True
        except:
            return False
    
    def load_url(self, url):
        """加载URL"""
        if not (url.startswith('http://') or url.startswith('https://')):
            url = 'http://' + url
        
        # 直接加载URL
        self.web_view.load(QUrl(url))
    
    def on_load_started(self):
        """加载开始"""
        pass
    
    def on_load_finished(self, ok):
        """加载完成"""
        pass
    
    def keyPressEvent(self, event):
        """键盘事件处理"""
        if event.key() == Qt.Key_Escape:
            # 按ESC键退出全屏
            self.showNormal()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    
    # 创建并显示登录窗口
    login_window = LoginWindow()
    login_window.show()
    login_window.raise_()
    login_window.activateWindow()
    
    sys.exit(app.exec_())