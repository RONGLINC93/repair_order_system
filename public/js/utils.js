// 工具函数库

// 自定义错误类，用于处理文件冲突情况
class FileExistsError extends Error {
    constructor(message, data) {
        super(message);
        this.name = 'FileExistsError';
        this.fileExists = data.fileExists;
        this.data = data;
    }
}

class Utils {
    // API基础URL
    static BASE_URL = '/api';

    // 获取token
    static getToken() {
        return localStorage.getItem('token');
    }

    // 设置token
    static setToken(token) {
        localStorage.setItem('token', token);
    }

    // 移除token
    static removeToken() {
        localStorage.removeItem('token');
    }

    // 获取用户信息
    static getUser() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    }

    // 检查是否陷入重定向循环
    static isRedirectLoop() {
        const now = Date.now();
        const lastRedirect = sessionStorage.getItem('lastRedirectTime');
        const redirectCount = parseInt(sessionStorage.getItem('redirectCount') || '0');
        
        // 如果上次重定向在5秒内，增加计数
        if (lastRedirect && (now - parseInt(lastRedirect)) < 5000) {
            sessionStorage.setItem('redirectCount', (redirectCount + 1).toString());
        } else {
            // 超过5秒，重置计数
            sessionStorage.setItem('redirectCount', '1');
        }
        
        sessionStorage.setItem('lastRedirectTime', now.toString());
        
        // 如果5秒内重定向超过3次，认为是循环
        if (parseInt(sessionStorage.getItem('redirectCount')) > 3) {
            console.warn('检测到重定向循环，清除认证信息');
            this.removeToken();
            this.setUser(null);
            sessionStorage.removeItem('redirectCount');
            sessionStorage.removeItem('lastRedirectTime');
            return true;
        }
        
        return false;
    }

    // 重置重定向计数
    static resetRedirectCount() {
        sessionStorage.removeItem('redirectCount');
        sessionStorage.removeItem('lastRedirectTime');
    }

    // 设置用户信息
    static setUser(user) {
        localStorage.setItem('user', JSON.stringify(user));
    }

    // 判断是否为移动端
    static isMobile() {
        // 优先使用服务器端检测的结果
        if (typeof window !== 'undefined' && window.isMobile !== undefined) {
            return window.isMobile;
        }
        
        // 客户端检测作为备选方案
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
        
        // 检测User Agent
        if (mobileRegex.test(userAgent)) {
            return true;
        }
        
        // 检测屏幕尺寸作为备选
        if (window.innerWidth && window.innerWidth <= 768) {
            return true;
        }
        
        return false;
    }

    // 移除用户信息
    static removeUser() {
        localStorage.removeItem('user');
    }

    // 保存记住的用户名和密码
    static saveRememberedCredentials(username, password) {
        localStorage.setItem('rememberedUsername', username);
        localStorage.setItem('rememberedPassword', btoa(password)); // 简单编码存储
    }

    // 获取记住的用户名
    static getRememberedUsername() {
        return localStorage.getItem('rememberedUsername') || '';
    }

    // 获取记住的密码
    static getRememberedPassword() {
        const encodedPassword = localStorage.getItem('rememberedPassword');
        if (encodedPassword) {
            try {
                return atob(encodedPassword); // 解码
            } catch (error) {
                console.error('解码密码失败:', error);
                return '';
            }
        }
        return '';
    }

    // 清除记住的凭据
    static clearRememberedCredentials() {
        localStorage.removeItem('rememberedUsername');
        localStorage.removeItem('rememberedPassword');
    }

    // 退出登录
    static logout() {
        this.removeToken();
        this.removeUser();
        // 询问用户是否清除记住的密码
        if (this.isPasswordRemembered()) {
            this.confirm(
                '清除记住的密码',
                '是否要清除记住的登录密码？下次登录需要重新输入。',
                () => {
                    this.clearRememberedCredentials();
                    this.showSuccess('已清除记住的密码');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 1000);
                },
                () => {
                    // 用户选择不清除，直接跳转
                    window.location.href = '/login.html';
                }
            );
        } else {
            window.location.href = '/login.html';
        }
    }

    // 检查是否记住密码
    static isPasswordRemembered() {
        return !!(localStorage.getItem('rememberedUsername') && localStorage.getItem('rememberedPassword'));
    }

    // API请求封装
    static async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // 添加认证token
        const token = this.getToken();
        if (token) {
            defaultOptions.headers.Authorization = `Bearer ${token}`;
        }

        // 合并选项
        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            },
        };

        try {
            const response = await fetch(this.BASE_URL + url, finalOptions);
            
            // 尝试解析JSON响应，如果失败则返回空对象
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                data = {};
            }

            if (response.status === 401) {
                // token过期，跳转到登录页
                this.removeToken();
                this.setUser(null);
                window.location.href = '/login.html';
                return;
            }

            if (!response.ok) {
                // 根据状态码返回更具体的错误信息
                if (response.status === 400 && data.fileExists) {
                    // 文件冲突特殊情况，返回包含fileExists标志的数据
                    const error = new FileExistsError(data.error || '目标位置已存在同名文件', data);
                    // 确保错误对象具有正确的属性
                    error.fileExists = true;
                    error.data = data;
                    throw error;
                } else if (response.status === 400 && data.errors) {
                    // 验证错误，显示所有错误信息
                    const errorMessages = data.errors.map(err => err.msg).join(', ');
                    throw new Error(errorMessages || data.error || `请求失败 (${response.status})`);
                } else if (response.status === 404) {
                    throw new Error(data.error || '请求的资源不存在');
                } else {
                    throw new Error(data.error || `请求失败 (${response.status})`);
                }
            }

            return data;
        } catch (error) {
            console.error('API请求错误:', error);
            throw error;
        }
    }

    // GET请求
    static async get(url) {
        return this.request(url, { method: 'GET' });
    }

    // POST请求
    static async post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    // PUT请求
    static async put(url, data) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    // DELETE请求
    static async delete(url, data = null) {
        const options = { method: 'DELETE' };
        // 如果有数据，添加到请求体中
        if (data) {
            options.headers = {
                'Content-Type': 'application/json'
            };
            options.body = JSON.stringify(data);
        }
        return this.request(url, options);
    }

    // 表单数据请求（用于文件上传）
    static async postForm(url, formData) {
        const defaultOptions = {
            method: 'POST',
            body: formData,
            // 不设置Content-Type，让浏览器自动设置（包含boundary）
        };

        // 添加认证token
        const token = this.getToken();
        if (token) {
            defaultOptions.headers = {
                Authorization: `Bearer ${token}`,
            };
        }

        try {
            const response = await fetch(this.BASE_URL + url, defaultOptions);
            
            // 尝试解析JSON响应，如果失败则返回空对象
            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                data = {};
            }

            if (response.status === 401) {
                // token过期，跳转到登录页
                this.removeToken();
                this.setUser(null);
                window.location.href = '/login.html';
                return;
            }

            if (!response.ok) {
                // 根据状态码返回更具体的错误信息
                if (response.status === 400 && data.fileExists) {
                    // 文件冲突特殊情况，返回包含fileExists标志的数据
                    const error = new FileExistsError(data.error || '目标位置已存在同名文件', data);
                    // 确保错误对象具有正确的属性
                    error.fileExists = true;
                    error.data = data;
                    throw error;
                } else if (response.status === 400 && data.errors) {
                    // 验证错误，显示所有错误信息
                    const errorMessages = data.errors.map(err => err.msg).join(', ');
                    throw new Error(errorMessages || data.error || `请求失败 (${response.status})`);
                } else if (response.status === 404) {
                    throw new Error(data.error || '请求的资源不存在');
                } else {
                    throw new Error(data.error || `请求失败 (${response.status})`);
                }
            }

            return data;
        } catch (error) {
            console.error('API请求错误:', error);
            throw error;
        }
    }

    // 显示成功消息
    static showSuccess(message, duration = 3000) {
        this.showNotificationToast({
            id: 'success-' + Date.now(),
            title: '成功',
            content: message,
            type: 'success',
            related_id: null
        });
    }

    // 显示错误消息
    static showError(message, duration = 3000) {
        this.showNotificationToast({
            id: 'error-' + Date.now(),
            title: '错误',
            content: message,
            type: 'error',
            related_id: null
        });
    }

    // 显示警告消息
    static showWarning(message, duration = 3000) {
        this.showNotificationToast({
            id: 'warning-' + Date.now(),
            title: '警告',
            content: message,
            type: 'warning',
            related_id: null
        });
    }

    // 显示提示消息
    static showAlert(message, type = 'info', duration = 3000) {
        // 根据type转换为对应的通知类型
        const typeMap = {
            'info': 'info',
            'success': 'success',
            'error': 'error',
            'warning': 'warning'
        };
        
        this.showNotificationToast({
            id: type + '-' + Date.now(),
            title: type === 'info' ? '提示' : typeMap[type] === 'success' ? '成功' : typeMap[type] === 'error' ? '错误' : '警告',
            content: message,
            type: typeMap[type] || 'system',
            related_id: null
        });
    }

    // 显示模态框
    static showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('show');
            modal.style.display = 'flex';
            console.log('显示模态框:', modalId);
        } else {
            console.error('找不到模态框:', modalId);
        }
    }

    // 显示自定义内容模态框
    static showCustomModal(title, content, options = {}) {
        // 移除已存在的自定义模态框
        const existingModal = document.getElementById('customModal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.id = 'customModal';
        
        // 生成唯一ID避免冲突
        const modalId = 'customModal-' + Date.now();
        modal.id = modalId;

        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${title}</h3>
                    <button type="button" class="close-btn" onclick="Utils.hideCustomModal('${modalId}')">
                        <span>&times;</span>
                    </button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${options.showFooter ? `
                <div class="modal-footer">
                    ${options.cancelText ? `<button type="button" class="action-btn secondary" onclick="Utils.hideCustomModal('${modalId}')">${options.cancelText}</button>` : ''}
                    ${options.confirmText ? `<button type="button" class="action-btn primary" onclick="Utils.hideCustomModal('${modalId}')">${options.confirmText}</button>` : ''}
                </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // 如果有确认回调
        if (options.onConfirm) {
            const confirmBtn = modal.querySelector('.action-btn.primary');
            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    options.onConfirm();
                    Utils.hideCustomModal(modalId);
                };
            }
        }

        // 如果有取消回调
        if (options.onCancel) {
            const cancelBtn = modal.querySelector('.action-btn.secondary');
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    options.onCancel();
                    Utils.hideCustomModal(modalId);
                };
            }
        }

        console.log('显示自定义模态框:', title);
        return modalId;
    }

    // 隐藏自定义模态框
    static hideCustomModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.remove();
            }, 300);
            console.log('隐藏自定义模态框:', modalId);
        }
    }

    // 隐藏模态框
    static hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            modal.style.display = 'none';
            console.log('隐藏模态框:', modalId);
        } else {
            console.error('找不到模态框:', modalId);
        }
    }
    
    // 切换用户下拉菜单显示/隐藏
    static toggleUserMenu() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    }

    // 后退并刷新
        static goBackWithRefresh() {
            if (document.referrer) {
                // 简单使用history.back()，然后手动刷新上一页
                window.history.back();
                // 延迟刷新上一页，确保返回操作完成
                setTimeout(() => {
                    if (document.referrer) {
                        window.location.reload();
                    }
                }, 100);
            } else {
                // 没有来源页面时，使用历史后退
                window.history.back();
            }
        }

    // 确认对话框
    static confirm(title, message, onConfirm, onCancel) {
        const modal = document.createElement('div');
        modal.className = 'modal show';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 style="color: white; margin: 0; font-size: 18px; font-weight: 600;">${title}</h3>
                    <button type="button" class="close-btn" onclick="this.closest('.modal').remove()">
                        <span>&times;</span>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="color: #333; margin: 0; font-size: 16px; line-height: 1.5;">${message}</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="action-btn secondary" onclick="this.closest('.modal').remove(); if(window.onCancelCallback) window.onCancelCallback();">取消</button>
                    <button type="button" class="action-btn primary" id="confirmBtn">确认</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 保存 onCancel 回调到全局变量，供取消按钮使用
        window.onCancelCallback = onCancel;

        // 绑定确认事件
        modal.querySelector('#confirmBtn').addEventListener('click', () => {
            modal.remove();
            window.onCancelCallback = null;
            if (onConfirm) onConfirm();
        });

        // 模态框关闭时清理
        const cleanup = () => {
            document.removeEventListener('keydown', handleEsc);
            window.onCancelCallback = null;
        };

        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                cleanup();
                if (onCancel) onCancel();
            }
        };
        document.addEventListener('keydown', handleEsc);

        // 监听模态框移除事件
        const observer = new MutationObserver(() => {
            if (!document.body.contains(modal)) {
                cleanup();
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true });
    }

    // 格式化日期
    static formatDate(dateString) {
        if (!dateString) return '';
        // 处理后端存储的'YYYY-MM-DD HH:MM:SS'格式 - 直接从字符串解析，避免时区转换问题
        if (typeof dateString === 'string' && dateString.includes(' ') && dateString.includes('-') && dateString.includes(':')) {
            return dateString;
        }
        // 处理其他格式的时间字符串
        const date = new Date(dateString);
        // 检查是否为有效日期
        if (isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleString('zh-CN');
    }

    // 格式化日期（只显示日期部分）
    static formatDateOnly(dateString) {
        if (!dateString) return '';
        // 处理后端存储的'YYYY-MM-DD HH:MM:SS'格式 - 直接从字符串解析，避免时区转换问题
        if (typeof dateString === 'string' && dateString.includes(' ') && dateString.includes('-') && dateString.includes(':')) {
            return dateString.split(' ')[0];
        }
        // 处理其他格式的时间字符串
        const date = new Date(dateString);
        // 检查是否为有效日期
        if (isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleDateString('zh-CN');
    }

    // 统一格式化日期时间（处理后端存储的格式）
    static formatDateTime(dateString) {
        if (!dateString) return '';
        // 处理后端存储的'YYYY-MM-DD HH:MM:SS'格式 - 直接从字符串解析，避免时区转换问题
        if (typeof dateString === 'string' && dateString.includes(' ') && dateString.includes('-') && dateString.includes(':')) {
            return dateString;
        }
        // 处理其他格式的时间字符串
        const date = new Date(dateString);
        // 检查是否为有效日期
        if (isNaN(date.getTime())) {
            return '';
        }
        // 获取本地时间的年、月、日、时、分、秒
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // 格式化日期时间为输入框使用的格式 (YYYY-MM-DDTHH:MM)
    static formatDateTimeForInput(dateString) {
        if (!dateString) return '';
        // 处理后端存储的'YYYY-MM-DD HH:MM:SS'格式
        if (typeof dateString === 'string' && dateString.includes(' ') && dateString.includes('-') && dateString.includes(':')) {
            // 直接从字符串解析，避免时区转换问题
            const [datePart, timePart] = dateString.split(' ');
            const [hours, minutes] = timePart.split(':');
            return `${datePart}T${hours}:${minutes}`;
        }
        // 处理其他格式的时间字符串
        const date = new Date(dateString);
        // 检查是否为有效日期
        if (isNaN(date.getTime())) {
            return '';
        }
        // 获取本地时间的年、月、日、时、分
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    // 将时间格式化为后端存储的东八区时间格式 (YYYY-MM-DD HH:MM:SS)
    // 如果不传入参数，则返回当前东八区时间
    static formatDateTimeForBackend(dateString = null) {
        try {
            let date;
            if (!dateString) {
                // 如果没有传入参数，使用当前时间
                date = new Date();
            } else if (typeof dateString === 'string' && dateString.includes('T') && dateString.length === 16) {
                // 直接处理datetime-local输入的'YYYY-MM-DDTHH:MM'格式
                return dateString.replace('T', ' ') + ':00';
            } else {
                // 处理其他日期字符串格式
                date = new Date(dateString);
                // 检查是否为有效日期
                if (isNaN(date.getTime())) {
                    return null;
                }
            }
            
            // 获取东八区时间组件
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            
            // 构建MySQL TIMESTAMP格式：YYYY-MM-DD HH:MM:SS
            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        } catch (error) {
            console.error('日期格式化错误:', error);
            return null;
        }
    }

    // 获取工单类型显示文本
    static getWorkTypeText(type) {
        const types = {
            'repair': '维修',
            'delivery': '送货',
            'other': '其他'
        };
        return types[type] || type;
    }

    // 获取工单类型样式类
    static getWorkTypeClass(type) {
        return `type-${type}`;
    }

    // 获取状态显示文本
    static getStatusText(status) {
        // 对于包含工程师信息的复合状态（如"等待服务-原工程师:xxx"或"派单成功-工程师:李四"），只返回基本状态部分
        let basicStatus = status;
        if (status.includes('-工程师:') || status.includes('-原工程师:')) {
            // 使用正则表达式提取基本状态部分
            const match = status.match(/^([^-]+)/);
            basicStatus = match ? match[1] : status;
        }
        
        const statuses = {
            '等待服务': '等待服务',
            '派单成功': '派单成功',
            '服务中': '服务中',
            '完成': '完成'
        };
        return statuses[basicStatus] || basicStatus;
    }

    // 获取状态样式类
    static getStatusClass(status) {
        // 对于包含工程师信息的复合状态，只返回基本状态对应的样式类
        let basicStatus = status;
        if (status.includes('-工程师:') || status.includes('-原工程师:')) {
            // 使用正则表达式提取基本状态部分
            const match = status.match(/^([^-]+)/);
            basicStatus = match ? match[1] : status;
        }
        
        const classes = {
            '等待服务': 'status-waiting',
            '派单成功': 'status-assigned',
            '服务中': 'status-progress',
            '完成': 'status-completed'
        };
        return classes[basicStatus] || 'status-waiting';
    }

    // 获取账号类型显示文本
    static getAccountTypeText(type) {
        const types = {
            'admin': '管理员',
            'engineer': '工程师',
            'customer_service': '客服',
            'user': '普通用户',
            'warehouse_manager': '仓储管理'
        };
        return types[type] || type;
    }

    // 检查权限
    static hasPermission(permission) {
        const user = this.getUser();
        if (!user) return false;
        
        // 管理员拥有所有权限（检查两种可能的字段名）
        if (user.accountType === 'admin' || user.account_type === 'admin') return true;
        
        let permissions = [];
        if (user.permissions) {
            if (typeof user.permissions === 'string') {
                permissions = user.permissions.split('|').filter(p => p.trim());
            } else if (Array.isArray(user.permissions)) {
                permissions = user.permissions.filter(p => p.trim());
            }
        }
        
        return permissions.includes(permission);
    }

    // 检查账号类型
    static hasAccountType(type) {
        const user = this.getUser();
        return user && (user.accountType === type || user.account_type === type);
    }

    // 验证表单
    static validateForm(formElement) {
        const inputs = formElement.querySelectorAll('input[required], select[required], textarea[required]');
        let isValid = true;
        const errors = [];

        inputs.forEach(input => {
            const value = input.value.trim();
            
            if (!value) {
                isValid = false;
                errors.push(`${input.previousElementSibling.textContent.replace('*', '').trim()} 不能为空`);
                input.classList.add('is-invalid');
            } else {
                input.classList.remove('is-invalid');
            }

            // 邮箱验证
            if (input.type === 'email' && value) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    isValid = false;
                    errors.push('请输入有效的邮箱地址');
                    input.classList.add('is-invalid');
                }
            }

            // 手机号验证 - 允许更多格式
            if (input.type === 'tel' && value) {
                // 更宽松的手机号验证规则，允许国际格式
                const phoneRegex = /^[+]?[0-9\s-]{7,}$/;
                if (!phoneRegex.test(value)) {
                    isValid = false;
                    errors.push('请输入有效的电话号码');
                    input.classList.add('is-invalid');
                }
            }

            // 密码长度验证
            if (input.type === 'password' && value.length < 6) {
                isValid = false;
                errors.push('密码至少需要6位字符');
                input.classList.add('is-invalid');
            }

            // 确认密码验证
            if (input.id === 'confirmPassword' && value) {
                const password = document.getElementById('password')?.value;
                if (password && value !== password) {
                    isValid = false;
                    errors.push('两次输入的密码不一致');
                    input.classList.add('is-invalid');
                }
            }
        });

        return { isValid, errors };
    }

    // 表单序列化
    static serializeForm(formElement) {
        const formData = new FormData(formElement);
        const data = {};

        formData.forEach((value, key) => {
            // 对所有字段都执行 trim，包括密码字段
            // 去除前后空格可以防止密码哈希被截断的问题
            if (key === 'password' || key === 'confirmPassword' ||
                key === 'currentPassword' || key === 'newPassword' ||
                key === 'userPassword') {
                // 密码字段也需要 trim，但添加调试日志以便追踪
                const trimmedValue = value.trim();
                console.log(`[serializeForm] ${key}: 原始长度=${value.length}, 去除空格后长度=${trimmedValue.length}`);
                data[key] = trimmedValue;
            } else {
                data[key] = value.trim();  // 其他字段 trim
            }
        });

        return data;
    }

    // 清空表单
    static clearForm(formElement) {
        formElement.reset();
        const inputs = formElement.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.classList.remove('is-invalid');
        });
    }

    // 生成表格行
    static generateTableRow(data, columns) {
        const row = document.createElement('tr');
        
        columns.forEach(column => {
            const cell = document.createElement('td');
            
            if (typeof column.render === 'function') {
                cell.innerHTML = column.render(data[column.key], data);
            } else {
                cell.textContent = data[column.key] || '';
            }
            
            row.appendChild(cell);
        });
        
        return row;
    }

    // 加载状态管理
    static showLoading(container) {
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.innerHTML = '<div class="spinner"></div>';
        
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }
        
        if (container) {
            container.innerHTML = '';
            container.appendChild(loading);
        }
    }

    static hideLoading(container) {
        const loading = (typeof container === 'string') ? 
            document.querySelector(container + ' .loading') : 
            container?.querySelector('.loading');
        
        if (loading) {
            loading.remove();
        }
    }

    // 分页组件生成
    static generatePagination(currentPage, totalPages, onPageChange) {
        if (totalPages <= 1) return '';
        
        let html = '<div class="pagination">';
        
        // 上一页
        if (currentPage > 1) {
            html += `<a href="#" class="pagination-item" data-page="${currentPage - 1}">上一页</a>`;
        }
        
        // 页码
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        if (startPage > 1) {
            html += `<a href="#" class="pagination-item" data-page="1">1</a>`;
            if (startPage > 2) {
                html += '<span class="pagination-item">...</span>';
            }
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === currentPage ? 'active' : '';
            html += `<a href="#" class="pagination-item ${activeClass}" data-page="${i}">${i}</a>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += '<span class="pagination-item">...</span>';
            }
            html += `<a href="#" class="pagination-item" data-page="${totalPages}">${totalPages}</a>`;
        }
        
        // 下一页
        if (currentPage < totalPages) {
            html += `<a href="#" class="pagination-item" data-page="${currentPage + 1}">下一页</a>`;
        }
        
        html += '</div>';
        
        return html;
    }

    // 初始化分页事件
    static initPagination(container, onPageChange) {
        const paginationElement = (typeof container === 'string') ? 
            document.querySelector(container) : container;
        
        if (paginationElement) {
            paginationElement.addEventListener('click', (e) => {
                if (e.target.classList.contains('pagination-item')) {
                    e.preventDefault();
                    const page = parseInt(e.target.dataset.page);
                    if (page && onPageChange) {
                        onPageChange(page);
                    }
                }
            });
        }
    }
    
    // 加载未读通知数量并更新通知角标
    static async loadNotificationCount() {
        try {
            // 检查用户是否已登录
            const user = this.getUser();
            if (!user || !user.id) {
                console.log('用户未登录，跳过通知数量加载');
                return;
            }
            
            const response = await this.get('/notifications/unread/count');
            const count = response.unreadCount || 0;
            
            console.log(`通知数量加载成功: ${count} 条未读通知`);
            
            // 安全地更新DOM元素
            this.updateNotificationElements(count);
            
        } catch (error) {
            console.error('加载通知数量失败:', error);
            
            // 出错时隐藏所有通知元素
            this.updateNotificationElements(0);
        }
    }
    
    // 安全地更新通知相关DOM元素
    static updateNotificationElements(count) {
        try {
            // 更新桌面端顶部导航栏的通知角标
            const badge = document.getElementById('notificationBadge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = 'flex';
                } else {
                    badge.style.display = 'none';
                }
            }
            
            // 更新移动端顶部导航栏的通知角标
            const mobileBadge = document.getElementById('mobileNotificationBadge');
            if (mobileBadge) {
                if (count > 0) {
                    mobileBadge.textContent = count > 99 ? '99+' : count;
                    mobileBadge.style.display = 'flex';
                } else {
                    mobileBadge.style.display = 'none';
                }
            }
            
            // 更新下拉菜单中的通知数量
            const notificationCount = document.getElementById('notificationCount');
            if (notificationCount) {
                if (count > 0) {
                    notificationCount.textContent = count > 99 ? '99+' : count;
                    notificationCount.style.display = 'inline';
                } else {
                    notificationCount.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('更新通知DOM元素失败:', error);
        }
    }

 // 加载聊天未读消息数量并更新未读消息角标
    static async loadChatUnreadCount() {
        try {
            console.log('开始加载聊天未读消息数量');
            // 检查用户是否已登录
            const user = this.getUser();
            if (!user || !user.id) {
                console.log('用户未登录，跳过聊天未读数量加载');
                return;
            }
            
            const response = await this.get('/chat/unread-count');
            const count = response.unreadCount || 0;
            
            console.log(`聊天未读消息数量加载成功: ${count} 条未读消息`);
            
            // 安全地更新DOM元素
            this.updateChatUnreadElements(count);
            
            return count;
        } catch (error) {
            console.error('加载聊天未读消息数量失败:', error);
            
            // 出错时隐藏所有未读消息元素
            this.updateChatUnreadElements(0);
            return 0;
        }
    }
    
    // 安全地更新聊天未读消息相关DOM元素
    static updateChatUnreadElements(count) {
        try {
            const unreadCount = count || 0;
            const displayCount = unreadCount > 99 ? '99+' : unreadCount;
            
            // 更新顶部导航栏的未读消息徽章
            const navBadge = document.getElementById('chatUnreadBadge');
            if (navBadge) {
                if (unreadCount > 0) {
                    navBadge.textContent = displayCount;
                    navBadge.style.display = 'inline-block';
                } else {
                    navBadge.style.display = 'none';
                }
            }
            
            // 更新侧边栏的未读消息徽章
            const sidebarBadge = document.getElementById('unreadChatCount');
            if (sidebarBadge) {
                if (unreadCount > 0) {
                    sidebarBadge.textContent = displayCount;
                    sidebarBadge.style.display = 'inline-block';
                } else {
                    sidebarBadge.style.display = 'none';
                }
            }
            
            // 更新menu按钮的未读消息徽章
            const menuBadge = document.getElementById('menuChatBadge');
            if (menuBadge) {
                if (unreadCount > 0) {
                    menuBadge.textContent = displayCount;
                    menuBadge.style.display = 'flex';
                } else {
                    menuBadge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('更新聊天未读消息元素失败:', error);
        }
    }

    // SSE实时通知管理
    static initRealtimeNotifications() {
        const user = this.getUser();
        if (!user || !user.id) {
            return;
        }

        // 避免重复连接
        if (window.sseConnection) {
            window.sseConnection.close();
        }

        // 显示连接中状态
        this.updateConnectionStatus('connecting');

        try {
            const eventSource = new EventSource(`/api/notifications/stream?userId=${user.id}`);
            window.sseConnection = eventSource;

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'notification') {
                        // 接收到新通知
                        this.handleNewNotification(data.data);
                    } else if (data.type === 'connected') {
                        // 连接确认消息，已在onopen中记录日志
                        this.updateConnectionStatus('connected');
                    } else if (data.type === 'heartbeat') {
                        // 心跳，保持连接活跃
                        this.updateConnectionStatus('connected');
                    }
                } catch (error) {
                    console.error('解析通知数据失败:', error);
                }
            };

            eventSource.onerror = (error) => {
                console.error('SSE连接错误:', error);
                this.updateConnectionStatus('disconnected');
                
                // 5秒后重连
                setTimeout(() => {
                    if (window.sseConnection === eventSource) {
                        this.initRealtimeNotifications();
                    }
                }, 5000);
            };

            eventSource.onopen = () => {
                console.log('实时通知连接已建立');
                this.updateConnectionStatus('connected');
            };

        } catch (error) {
            console.error('初始化实时通知失败:', error);
            this.updateConnectionStatus('failed');
            // 降级到轮询模式
            this.startPolling();
        }
    }

    // 更新连接状态显示
    static updateConnectionStatus(status) {
        // 更新桌面端状态指示器
        const desktopIndicator = document.getElementById('notificationStatus');
        // 更新移动端状态指示器
        const mobileIndicator = document.getElementById('mobileNotificationStatus');

        const statusConfig = {
            connecting: {
                text: '连接中...',
                color: '#ffc107',
                icon: '🔄',
                class: 'status-connecting'
            },
            connected: {
                text: '已连接',
                color: '#28a745',
                icon: '🟢',
                class: 'status-connected'
            },
            disconnected: {
                text: '连接断开',
                color: '#dc3545',
                icon: '🔴',
                class: 'status-disconnected'
            },
            failed: {
                text: '连接失败',
                color: '#dc3545',
                icon: '❌',
                class: 'status-failed'
            },
            polling: {
                text: '轮询中',
                color: '#fd7e14',
                icon: '🔄',
                class: 'status-polling'
            }
        };

        const config = statusConfig[status] || statusConfig.disconnected;

        // 更新桌面端状态
        if (desktopIndicator) {
            desktopIndicator.innerHTML = `${config.icon} ${config.text}`;
            desktopIndicator.className = `notification-status ${config.class}`;
            desktopIndicator.title = `实时通知状态: ${config.text}`;
        }

        // 更新移动端状态
        if (mobileIndicator) {
            mobileIndicator.innerHTML = `${config.icon} ${config.text}`;
            mobileIndicator.className = `notification-status ${config.class}`;
            mobileIndicator.title = `实时通知状态: ${config.text}`;
        }

        // 存储连接状态供其他功能使用
        window.notificationConnectionStatus = status;
    }

    // 创建状态指示器样式
    static createStatusIndicatorStyles() {
        if (!document.querySelector('#notification-status-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-status-styles';
            style.textContent = `
                .notification-status {
                    font-size: 12px;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-weight: 500;
                    margin-left: 8px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.3s ease;
                    cursor: pointer;
                }
                
                .status-connecting {
                    background-color: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffeaa7;
                }
                
                .status-connected {
                    background-color: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }
                
                .status-disconnected {
                    background-color: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                
                .status-failed {
                    background-color: #f8d7da;
                    color: #721c24;
                    border: 1px solid #f5c6cb;
                }
                
                .status-polling {
                    background-color: #fff0e6;
                    color: #8b4c00;
                    border: 1px solid #ffd4a3;
                }
                
                .notification-status:hover {
                    transform: scale(1.05);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
                }
                
                /* 移动端适配 */
                @media (max-width: 768px) {
                    .notification-status {
                        font-size: 11px;
                        padding: 3px 6px;
                        margin-left: 6px;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // 处理新通知
    static handleNewNotification(notification) {
        // 更新通知数量
        this.loadNotificationCount();
        this.loadChatUnreadCount();
        
        // 检查是否在通知页面（移动端）
        const isOnNotificationPage = window.location.pathname.includes('mobile-notifications.html');
        
        // 检查是否是新消息通知，并且不是当前聊天用户的消息
        // 对于新消息类型，如果是当前聊天用户的消息，不显示通知
        const isNewMessage = notification.type === 'new_message';
        const isCurrentChatUser = isNewMessage && 
                                 window.currentChatUser && 
                                 notification.senderId === window.currentChatUser.id;
        
        // 如果不在通知页面，并且不是当前聊天用户的消息，或者不是新消息类型，才显示通知
        if (!isOnNotificationPage && !isCurrentChatUser) {
            // 显示通知提示
            this.showNotificationToast(notification);
        }

        // 如果在通知页面，刷新列表
        if (isOnNotificationPage) {
            setTimeout(() => {
                // 移动端通知页面
                if (window.loadChatMessages) {
                    window.loadChatMessages();
                }
            }, 500);
        }
    }

    // 播放通知音效
    static async playNotificationSound(type) {
        try {
            // 获取用户的通知设置
            const currentUser = this.getUser();
            if (!currentUser) {
                console.log('未找到用户信息，跳过声音播放');
                return;
            }

            let soundEnabled = true; // 默认启用声音
            
            try {
                // 从服务器获取用户的通知设置
                const settings = await Utils.request(`/users/notification-settings/${currentUser.id}`);
                soundEnabled = settings.sound_enabled !== false; // 显式检查是否为false
            } catch (error) {
                console.log('获取声音设置失败，使用默认设置:', error);
                // 如果获取设置失败，使用默认值（启用声音）
            }

            // 如果用户禁用了声音，则不播放
            if (!soundEnabled) {
                console.log('用户已禁用通知声音，跳过播放');
                return;
            }

            // 根据通知类型选择不同的音效
            const soundMap = {
                'new_order': '/sounds/notification.mp3',
                'status_change': '/sounds/notification.mp3',
                'system': '/sounds/notification.mp3',
                'warning': '/sounds/warning.mp3',
                'info': '/sounds/info.mp3',
                'error': '/sounds/error.mp3',
                'success': '/sounds/notification.mp3',
                'permission_change': '/sounds/notification.mp3',
                'account_type_change': '/sounds/notification.mp3',
                'return_order': '/sounds/notification.mp3',
                'modify_order': '/sounds/notification.mp3',
                'delete_order': '/sounds/notification.mp3',
                'material_request': '/sounds/notification.mp3',
                'material_status_update': '/sounds/notification.mp3',
                'default': '/sounds/notification.mp3'
            };
            
            // 尝试初始化音频上下文
            this.createAudioContextForInteraction();
            
            // 创建音频对象并播放
            const audio = new Audio(soundMap[type] || soundMap['default']);
            audio.volume = 0.5; // 设置音量为50%
            
            // 添加音频事件监听器，便于调试
            audio.addEventListener('error', (e) => {
                console.error('音频加载错误:', e);
                console.error('音频错误详情:', audio.error);
            });
            
            // 如果有音频上下文，尝试连接到它
            if (this.audioContext && this.audioContext.state === 'running') {
                try {
                    const source = this.audioContext.createMediaElementSource(audio);
                    source.connect(this.audioContext.destination);
                } catch (error) {
                    // 如果无法连接，继续使用默认播放方式
                    console.log('无法连接到音频上下文，使用默认播放');
                }
            }
            
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.log('无法自动播放音效:', error);
                    console.error('播放失败原因:', error.name, error.message);
                    
                    // 根据错误类型提供不同的处理
                    if (error.name === 'NotAllowedError') {
                        console.log('浏览器阻止了自动播放，等待用户交互后播放');
                        // 尝试延迟播放（有时在页面加载后短暂延迟可以绕过一些限制）
                        setTimeout(() => {
                            audio.play().catch(delayedError => {
                                console.log('延迟播放也失败:', delayedError.message);
                            });
                        }, 100);
                    } else if (error.name === 'NotSupportedError') {
                        console.log('音频格式不支持:', soundMap[type] || soundMap['default']);
                    } else if (error.name === 'AbortError') {
                        console.log('音频播放被中止');
                    }
                });
            }
        } catch (error) {
            console.error('播放音效时出错:', error);
        }
    }

    // 创建音频上下文用于处理浏览器自动播放策略
    static createAudioContextForInteraction() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // 如果音频上下文被暂停，尝试恢复
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    console.log('音频上下文已恢复');
                }).catch(error => {
                    console.log('恢复音频上下文失败:', error);
                });
            }
        } catch (error) {
            console.error('创建音频上下文失败:', error);
        }
    }

    // 静默初始化音频上下文（在用户首次交互时调用）
    static initAudioContext() {
        if (!this.audioContextInitialized) {
            this.createAudioContextForInteraction();
            this.audioContextInitialized = true;
        }
    }

    // 显示通知提示
    static showNotificationToast(notification) {
        // 获取通知类型配置
        const getNotificationTypeConfig = (type) => {
            const configs = {
                'new_order': {
                    icon: '/images/notifications/new_order.png',
                    badge: '/images/notifications/new_order_badge.png',
                    tag: 'new_order'
                },
                'status_change': {
                    icon: '/images/notifications/status_change.png',
                    badge: '/images/notifications/status_change_badge.png',
                    tag: 'status_change'
                },
                'material_request': {
                    icon: '/images/notifications/new_order.png',
                    badge: '/images/notifications/new_order_badge.png',
                    tag: 'material_request'
                },
                'material_status_update': {
                    icon: '/images/notifications/status_change.png',
                    badge: '/images/notifications/status_change_badge.png',
                    tag: 'material_status_update'
                },
                'system': {
                    icon: '/images/notifications/system.png',
                    badge: '/images/notifications/system_badge.png',
                    tag: 'system'
                },
                'warning': {
                    icon: '/images/notifications/warning.png',
                    badge: '/images/notifications/warning_badge.png',
                    tag: 'warning'
                },
                'error': {
                    icon: '/images/notifications/error.png',
                    badge: '/images/notifications/error_badge.png',
                    tag: 'error'
                },
                'success': {
                    icon: '/images/notifications/system.png',
                    badge: '/images/notifications/system_badge.png',
                    tag: 'success'
                },
                'info': {
                    icon: '/images/notifications/system.png',
                    badge: '/images/notifications/system_badge.png',
                    tag: 'info'
                },
                'permission_change': {
                    icon: '/images/notifications/system.png',
                    badge: '/images/notifications/system_badge.png',
                    tag: 'permission_change'
                },
                'account_type_change': {
                    icon: '/images/notifications/system.png',
                    badge: '/images/notifications/system_badge.png',
                    tag: 'account_type_change'
                },
                'return_order': {
                    icon: '/images/notifications/warning.png',
                    badge: '/images/notifications/warning_badge.png',
                    tag: 'return_order'
                },
                'modify_order': {
                    icon: '/images/notifications/system.png',
                    badge: '/images/notifications/system_badge.png',
                    tag: 'modify_order'
                },
                'delete_order': {
                    icon: '/images/notifications/error.png',
                    badge: '/images/notifications/error_badge.png',
                    tag: 'delete_order'
                },
                'default': {
                    icon: '/favicon.ico',
                    badge: '/favicon.ico',
                    tag: 'default'
                }
            };
            return configs[type] || configs['default'];
        };
        
        const config = getNotificationTypeConfig(notification.type);
        
        // 播放通知音效（异步）
        this.playNotificationSound(notification.type);
        
        // 检查浏览器是否支持通知API
        if ('Notification' in window && Notification.permission === 'granted') {
            // 准备通知选项
                const notificationOptions = {
                    body: notification.content,
                    icon: config.icon,
                    badge: config.badge,
                    // 确保tag始终非空，优先使用notification.id，否则使用配置中的tag
                    tag: notification.id || config.tag,
                    data: {
                        relatedId: notification.related_id,
                        notificationType: notification.type,
                        timestamp: Date.now()
                    },
                    requireInteraction: notification.type === 'new_order' || notification.type === 'error',
                    vibrate: [200, 100, 200],
                    renotify: true
                };
            
            // 创建通知
            const browserNotification = new Notification(notification.title, notificationOptions);
            
            // 绑定点击事件
            browserNotification.onclick = (event) => {
                event.preventDefault();
                window.focus();
                
                // 根据通知类型跳转到相应页面
                if (notification.related_id) {
                    if (notification.type === 'new_order' || notification.type === 'status_change') {
                        window.location.href = `mobile-work-order-detail.html?id=${notification.related_id}`;
                    } else if (notification.type === 'new_message') {
                        // 新消息通知，跳转到聊天界面
                        window.location.href = `mobile-chat.html?id=${notification.related_id}`;
                    } else {
                        // 其他通知，跳转到通知中心
                        window.location.href = 'mobile-notifications.html';
                    }
                } else {
                    // 没有related_id的通知，跳转到通知中心
                    window.location.href = 'mobile-notifications.html';
                }
                
                browserNotification.close();
            };
            
            // 通知显示后自动关闭（如果不是需要交互的通知）
            if (!notificationOptions.requireInteraction) {
                setTimeout(() => browserNotification.close(), 10000);
            }
            
        } else if ('Notification' in window && Notification.permission !== 'denied') {
            // 请求通知权限
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    // 重新调用显示通知函数
                    this.showNotificationToast(notification);
                } else if (permission === 'denied') {
                    console.log('用户拒绝了通知权限');
                    // 显示一个友好的提示，建议用户在浏览器设置中开启通知
                    if (document.visibilityState === 'visible') {
                        this.showWarning('通知权限被拒绝，您将无法收到实时通知。请在浏览器设置中允许通知。');
                    }
                }
            });
        }

        // 无论如何都显示页面内通知提示
        this.showPageNotification(notification);
    }

    // 页面内通知提示
    static showPageNotification(notification) {
        // 根据通知类型设置不同的样式和图标
        const getNotificationTypeConfig = (type) => {
            const configs = {
                'new_order': {
                    borderColor: '#28a745',
                    icon: '📋',
                    bgColor: '#f8fff8',
                    iconBg: '#28a745',
                    iconColor: 'white'
                },
                'status_change': {
                    borderColor: '#007bff',
                    icon: '🔄',
                    bgColor: '#f8f9ff',
                    iconBg: '#007bff',
                    iconColor: 'white'
                },
                'material_request': {
                    borderColor: '#28a745',
                    icon: '📦',
                    bgColor: '#f8fff8',
                    iconBg: '#28a745',
                    iconColor: 'white'
                },
                'material_status_update': {
                    borderColor: '#007bff',
                    icon: '🔄',
                    bgColor: '#f8f9ff',
                    iconBg: '#007bff',
                    iconColor: 'white'
                },
                'system': {
                    borderColor: '#ffc107',
                    icon: '⚙️',
                    bgColor: '#fffdf0',
                    iconBg: '#ffc107',
                    iconColor: 'white'
                },
                'warning': {
                    borderColor: '#fd7e14',
                    icon: '⚠️',
                    bgColor: '#fff8f0',
                    iconBg: '#fd7e14',
                    iconColor: 'white'
                },
                'error': {
                    borderColor: '#dc3545',
                    icon: '❌',
                    bgColor: '#fff0f0',
                    iconBg: '#dc3545',
                    iconColor: 'white'
                },
                'success': {
                    borderColor: '#28a745',
                    icon: '✅',
                    bgColor: '#f8fff8',
                    iconBg: '#28a745',
                    iconColor: 'white'
                },
                'info': {
                    borderColor: '#17a2b8',
                    icon: 'ℹ️',
                    bgColor: '#f0ffff',
                    iconBg: '#17a2b8',
                    iconColor: 'white'
                },
                'permission_change': {
                    borderColor: '#ffc107',
                    icon: '🔒',
                    bgColor: '#fffdf0',
                    iconBg: '#ffc107',
                    iconColor: 'white'
                },
                'account_type_change': {
                    borderColor: '#ffc107',
                    icon: '👤',
                    bgColor: '#fffdf0',
                    iconBg: '#ffc107',
                    iconColor: 'white'
                },
                'return_order': {
                    borderColor: '#fd7e14',
                    icon: '🔄',
                    bgColor: '#fff8f0',
                    iconBg: '#fd7e14',
                    iconColor: 'white'
                },
                'modify_order': {
                    borderColor: '#007bff',
                    icon: '✏️',
                    bgColor: '#f8f9ff',
                    iconBg: '#007bff',
                    iconColor: 'white'
                },
                'delete_order': {
                    borderColor: '#dc3545',
                    icon: '🗑️',
                    bgColor: '#fff0f0',
                    iconBg: '#dc3545',
                    iconColor: 'white'
                },
                'default': {
                    borderColor: '#6c757d',
                    icon: '📢',
                    bgColor: '#f8f9fa',
                    iconBg: '#6c757d',
                    iconColor: 'white'
                }
            };
            return configs[type] || configs['default'];
        };
        
        const config = getNotificationTypeConfig(notification.type);
        
        // 创建通知元素
        const notificationEl = document.createElement('div');
        notificationEl.className = 'notification-toast';
        notificationEl.dataset.id = notification.id;
        notificationEl.dataset.type = notification.type;
        
        // 获取格式化的时间
        const formatTime = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            return date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        };
        
        notificationEl.innerHTML = `
            <div class="notification-content" style="background-color: ${config.bgColor};">
                <div class="notification-icon" style="background-color: ${config.iconBg}; color: ${config.iconColor};">
                    ${config.icon}
                </div>
                <div class="notification-body">
                    <div class="notification-header">
                        <div class="notification-title">${notification.title}</div>
                        <div class="notification-time">${formatTime(notification.created_at)}</div>
                    </div>
                    <div class="notification-message">${notification.content}</div>
                    ${notification.related_id ? '<div><span class="notification-link">查看详情</span></div>' : ''}
                </div>
                <button class="notification-close" aria-label="关闭通知">×</button>
            </div>
        `;

        // 添加样式
        if (!document.querySelector('#notification-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-toast-styles';
            style.textContent = `
                /* 通知容器位置管理 */
                .notification-container {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    z-index: 9999;
                    max-width: 380px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                /* 通知卡片基础样式 */
                .notification-toast {
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    opacity: 0;
                    transform: translateX(100%);
                    animation: slideInRight 0.4s ease-out forwards;
                    will-change: transform, opacity;
                }
                
                .notification-toast:hover {
                    transform: translateX(-4px);
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
                }
                
                /* 通知内容区 */
                .notification-content {
                    display: flex;
                    padding: 16px;
                    position: relative;
                }
                
                /* 通知图标 */
                .notification-icon {
                    flex-shrink: 0;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 12px;
                    font-size: 18px;
                }
                
                /* 通知主体内容 */
                .notification-body {
                    flex: 1;
                    min-width: 0;
                }
                
                /* 通知头部 */
                .notification-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                    position: relative;
                    padding-right: 35px; /* 为关闭按钮留出空间 */
                }
                
                /* 通知标题 */
                .notification-title {
                    font-weight: 600;
                    font-size: 15px;
                    color: #333;
                    margin: 0;
                }
                
                /* 通知时间 */
                .notification-time {
                    font-size: 12px;
                    color: #999;
                    margin-left: 8px;
                }
                
                /* 通知消息内容 */
                .notification-message {
                    font-size: 14px;
                    color: #666;
                    line-height: 1.4;
                    margin: 4px 0 8px 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                }
                
                /* 通知操作按钮 */
                .notification-actions {
                    margin-top: 8px;
                }
                
                .notification-link {
                    font-size: 13px;
                    color: #007bff;
                    text-decoration: none;
                    cursor: pointer;
                    font-weight: 500;
                }
                
                .notification-link:hover {
                    text-decoration: underline;
                }
                
                /* 关闭按钮 */
                    .notification-close {
                        position: absolute;
                        top: 12px;
                        right: 8px;
                    background: rgba(0, 0, 0, 0.05);
                    border: none;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    font-size: 16px;
                    cursor: pointer;
                    color: #666;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    z-index: 1;
                }
                
                .notification-close:hover {
                    background: rgba(0, 0, 0, 0.1);
                    color: #333;
                }
                
                /* 动画效果 */
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                
                @keyframes slideOutRight {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
                
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
                
                /* 移动端适配 */
                @media (max-width: 768px) {
                    .notification-container {
                        right: 10px;
                        left: 10px;
                        max-width: none;
                        width: 70%;
                        top: 70px;
                    }
                    
                    .notification-toast {
                        border-radius: 8px;
                        margin: 0 auto;
                    }
                    
                    .notification-content {
                        padding: 12px;
                    }
                    
                    .notification-icon {
                        width: 36px;
                        height: 36px;
                        font-size: 16px;
                    }
                    
                    .notification-title {
                        font-size: 14px;
                        line-height: 1.3;
                        padding-right: 20px; /* 为关闭按钮留出空间 */
                    }
                    
                    .notification-message {
                        font-size: 13px;
                        line-height: 1.4;
                        margin-top: 4px;
                        padding-right: 20px; /* 为关闭按钮留出空间 */
                    }
                    
                    .notification-close {
                        top: 10px;
                        right: 8px;
                        width: 22px;
                        height: 22px;
                        font-size: 15px;
                        background: rgba(255, 255, 255, 0.9); /* 增加背景透明度 */
                    }
                }
                
                /* 小屏幕手机优化 */
                @media (max-width: 480px) {
                    .notification-container {
                        width: 85%;
                        left: 7.5%;
                        right: 7.5%;
                    }
                    
                    .notification-content {
                        padding: 10px;
                    }
                    
                    .notification-title {
                        font-size: 13px;
                        padding-right: 15px; /* 为关闭按钮留出空间 */
                    }
                    
                    .notification-message {
                        font-size: 12px;
                        padding-right: 15px; /* 为关闭按钮留出空间 */
                    }
                    
                    .notification-icon {
                        width: 32px;
                        height: 32px;
                        font-size: 14px;
                    }
                    
                    .notification-close {
                        top: 8px;
                        right: 6px;
                        width: 20px;
                        height: 20px;
                        font-size: 14px;
                        background: rgba(255, 255, 255, 0.9); /* 增加背景透明度 */
                    }
                }
                
                /* 通知堆叠效果 */
                .notification-toast:nth-child(n+2) {
                    animation-delay: 0.1s;
                }
                
                .notification-toast:nth-child(n+3) {
                    animation-delay: 0.2s;
                }
            `;
            document.head.appendChild(style);
        }
        
        // 确保有通知容器，避免重复创建
        let notificationContainer = document.querySelector('.notification-container');
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.className = 'notification-container';
            // 设置固定定位，避免与页面元素重叠
            notificationContainer.style.position = 'fixed';
            notificationContainer.style.top = '100px'; // 增加顶部间距，避免与导航栏重叠
            notificationContainer.style.right = '20px';
            notificationContainer.style.zIndex = '9999';
            notificationContainer.style.maxWidth = '380px';
            notificationContainer.style.width = '100%';
            notificationContainer.style.display = 'flex';
            notificationContainer.style.flexDirection = 'column';
            notificationContainer.style.gap = '10px';
            document.body.appendChild(notificationContainer);
        }
        
        // 重置容器样式，确保不会因为之前的修改导致排版问题
        notificationContainer.style.position = 'fixed';
        notificationContainer.style.zIndex = '9999';

        // 添加到容器（添加到顶部，最新的通知显示在最上面）
        notificationContainer.insertBefore(notificationEl, notificationContainer.firstChild);
        
        // 限制通知数量，最多显示5个
        const notifications = notificationContainer.querySelectorAll('.notification-toast');
        if (notifications.length > 5) {
            for (let i = 5; i < notifications.length; i++) {
                notifications[i].style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => notifications[i].remove(), 300);
            }
        }

        // 绑定关闭事件
        notificationEl.querySelector('.notification-close').addEventListener('click', (e) => {
            e.stopPropagation();
            removeNotification(notificationEl);
        });
        
        // 绑定点击事件（跳转到相关页面）
        notificationEl.addEventListener('click', (e) => {
            if (notification.related_id && !e.target.closest('.notification-close')) {
                // 判断是移动端还是桌面端
                const isMobile = this.isMobile();
                
                // 如果是工单相关通知，跳转到工单详情
                if (notification.type === 'new_order' || notification.type === 'status_change') {
                    window.location.href = `mobile-work-order-detail.html?id=${notification.related_id}`;
                } else if (notification.type === 'new_message') {
                    // 新消息通知，跳转到聊天界面
                    if (isMobile) {
                        window.location.href = `mobile-chat.html?id=${notification.related_id}`;
                    } else {
                        window.location.href = `chat.html?id=${notification.related_id}`;
                    }
                } else if (notification.type === 'material_request' || notification.type === 'material_status_update') {
                    // 物料请求相关通知，跳转到物料请求列表
                    if (isMobile) {
                        window.location.href = 'mobile-material-requests.html';
                    } else {
                        window.location.href = 'material-requests.html';
                    }
                } else {
                    // 其他通知，跳转到通知中心
                    if (isMobile) {
                        window.location.href = 'mobile-notifications.html';
                    } else {
                        window.location.href = 'mobile-notifications.html';
                    }
                }
                removeNotification(notificationEl);
            }
        });
        
        // 绑定查看详情链接点击事件
        const linkElement = notificationEl.querySelector('.notification-link');
        if (linkElement) {
            linkElement.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 跳转到相关详情页面
                if (notification.related_id) {
                    if (notification.type === 'new_order' || notification.type === 'status_change') {
                        window.location.href = `mobile-work-order-detail.html?id=${notification.related_id}`;
                    } else if (notification.type === 'new_message') {
                        // 新消息通知，跳转到聊天界面
                        window.location.href = `mobile-chat.html?id=${notification.related_id}`;
                    } else {
                        // 其他通知，跳转到通知中心
                        window.location.href = 'mobile-notifications.html';
                    }
                }
                removeNotification(notificationEl);
            });
        }
        
        // 移除通知的辅助函数
        function removeNotification(element) {
            element.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                if (element.parentElement) {
                    element.parentElement.removeChild(element);
                }
                
                // 如果没有通知了，移除容器
                if (notificationContainer.children.length === 0) {
                    notificationContainer.remove();
                }
            }, 300);
        }
        
        // 自动移除（7秒后，给用户足够时间阅读）
        setTimeout(() => {
            removeNotification(notificationEl);
        }, 7000);
    }

    // 请求通知权限
    static requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            // 先显示一个友好的提示，说明为什么需要通知权限
            this.confirm(
                '开启实时通知',
                '我们希望为您提供工单状态变更的实时提醒。开启通知后，您将立即收到新工单创建、状态变更等重要消息通知，不会错过任何工作。',
                () => {
                    // 用户确认后再请求权限
                    Notification.requestPermission().then(permission => {
                        console.log('通知权限:', permission);
                        if (permission === 'granted') {
                            this.showSuccess('通知权限已开启，您将收到实时提醒！');
                        } else if (permission === 'denied') {
                            this.showWarning('通知权限已拒绝，您将无法收到实时通知。您可以在浏览器设置中修改此权限。');
                        }
                    });
                },
                () => {
                    console.log('用户取消了通知权限请求');
                    // 用户取消后，仍然提供一个降级选项，可以稍后在设置中开启
                    setTimeout(() => {
                        this.showWarning('您可以随时在浏览器设置或系统设置中开启通知权限。');
                    }, 1000);
                }
            );
        }
    }

    // 轮询降级方案
    static startPolling() {
        if (window.notificationPolling) {
            return;
        }

        // 更新状态为轮询中
        this.updateConnectionStatus('polling');

        // 存储上次通知数量，用于检测是否有新通知
        let lastNotificationCount = 0;

        window.notificationPolling = setInterval(async () => {
            try {
                // 获取未读通知数量
                const response = await this.get('/notifications/unread/count');
                const currentCount = response.unreadCount || 0;
                
                // 更新通知角标
                await this.loadNotificationCount();
                await this.loadChatUnreadCount();

                // 如果有新通知，获取最新通知并显示
                if (currentCount > lastNotificationCount) {
                    try {
                        const notificationsResponse = await this.get('/notifications/latest');
                        if (notificationsResponse && notificationsResponse.notification) {
                            this.showNotificationToast(notificationsResponse.notification);
                        }
                    } catch (error) {
                        console.error('获取最新通知失败:', error);
                        // 至少显示一个通用通知提示
                        this.showNotificationToast({
                            title: '新通知',
                            content: `您有 ${currentCount} 条未读通知，请查看`,
                            id: Date.now()
                        });
                    }
                }
                
                // 更新上次通知数量
                lastNotificationCount = currentCount;
                
            } catch (error) {
                console.error('轮询通知失败:', error);
                // 如果连续多次失败，标记为断开状态
                if (window.notificationPollingErrorCount) {
                    window.notificationPollingErrorCount++;
                } else {
                    window.notificationPollingErrorCount = 1;
                }
                
                if (window.notificationPollingErrorCount >= 3) {
                    this.updateConnectionStatus('disconnected');
                }
            }
        }, 10000); // 每10秒检查一次
    }

    // 关闭实时通知
    static closeRealtimeNotifications() {
        if (window.sseConnection) {
            window.sseConnection.close();
            window.sseConnection = null;
        }
        if (window.notificationPolling) {
            clearInterval(window.notificationPolling);
            window.notificationPolling = null;
            window.notificationPollingErrorCount = 0;
        }
        this.updateConnectionStatus('disconnected');
    }

    // 初始化通知系统（页面加载时调用）
    static initNotificationSystem() {
        // 创建状态指示器样式
        this.createStatusIndicatorStyles();
        
        // 初始化实时通知
        this.initRealtimeNotifications();
        
        // 加载通知数量
        this.loadNotificationCount();
        this.loadChatUnreadCount();

        // 请求通知权限（如果尚未请求）
        this.requestNotificationPermission();
        
        // 页面可见性变化时重新连接通知
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // 页面变为可见时，重新检查连接状态
                if (!window.sseConnection || window.sseConnection.readyState === EventSource.CLOSED) {
                    this.initRealtimeNotifications();
                }
                // 重新加载通知数量
                this.loadNotificationCount();
                this.loadChatUnreadCount();
            }
        });
        
        // 页面卸载时关闭连接
        window.addEventListener('beforeunload', () => {
            this.closeRealtimeNotifications();
        });
    }
}

// 导出工具类
window.Utils = Utils;

// 聊天相关API方法
Utils.chatApi = {
    // 获取用户列表
    async getUsers() {
        return await Utils.get('/chat/users');
    },

    // 获取聊天记录
    async getMessages(userId, page = 1, limit = 20) {
        return await Utils.get(`/chat/messages/${userId}?page=${page}&limit=${limit}`);
    },

    // 发送文本消息
    async sendMessage(userId, content) {
        return await Utils.post(`/chat/messages/${userId}`, { content });
    },

    // 发送文件消息
    async sendFileMessage(userId, file) {
        const formData = new FormData();
        formData.append('file', file);

        const token = Utils.getToken();
        const response = await fetch(`/api/chat/messages/${userId}/file`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '发送文件失败');
        }

        return await response.json();
    },

    // 获取未读消息数
    async getUnreadCount() {
        return await Utils.get('/chat/unread-count');
    },

    // 标记消息为已读
    async markMessageAsRead(messageId) {
        return await Utils.put(`/chat/messages/${messageId}/read`);
    },

    // 删除消息
    async deleteMessage(messageId) {
        return await Utils.delete(`/chat/messages/${messageId}`);
    }
};

// 通用的API请求方法（用于聊天页面）
async function apiRequest(url, method = 'GET', data = null) {
    try {
        const token = Utils.getToken();
        if (!token) {
            throw new Error('用户未登录');
        }

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        console.log(`API请求: ${method} ${Utils.BASE_URL}${url}`);
        console.log('请求数据:', data);
        
        const response = await fetch(Utils.BASE_URL + url, options);
        
        console.log(`API响应状态: ${response.status}`);
        
        const result = await response.json();
        
        console.log('API响应数据:', result);

        if (response.status === 401) {
            Utils.removeToken();
            Utils.removeUser();
            window.location.href = '/login.html';
            return;
        }

        if (!response.ok) {
            throw new Error(result.error || `请求失败 (${response.status})`);
        }

        return result;
    } catch (error) {
        console.error('API请求错误:', error);
        throw error;
    }
}

// 页面加载完成后自动初始化通知系统
document.addEventListener('DOMContentLoaded', () => {
    if (typeof Utils !== 'undefined') {
        Utils.initNotificationSystem();
        // 注意：聊天未读消息数量已在initNotificationSystem中加载，不需要重复调用
    }
});

// 添加用户交互监听器，初始化音频上下文
['click', 'keydown', 'touchstart', 'scroll'].forEach(eventType => {
    document.addEventListener(eventType, function initAudioOnInteraction() {
        if (typeof Utils !== 'undefined' && !Utils.audioContextInitialized) {
            Utils.initAudioContext();
            console.log('音频上下文已通过用户交互初始化');
        }
        
        // 移除监听器，只需要初始化一次
        document.removeEventListener(eventType, initAudioOnInteraction);
    }, { once: true });
});