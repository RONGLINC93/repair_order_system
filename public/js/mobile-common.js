// 移动端通用JavaScript函数


// 显示提示消息
function showToast(message, type = 'info') {
    // 移除现有的toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // 样式
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 14px;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    // 添加到页面
    document.body.appendChild(toast);
    
    // 显示动画
    setTimeout(() => {
        toast.style.opacity = '1';
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// 格式化日期
function formatDate(dateString, options = {}) {
    if (!dateString) return '—';
    
    const defaultOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    try {
        const date = new Date(dateString);
        return date.toLocaleString('zh-CN', finalOptions);
    } catch (error) {
        console.error('日期格式化错误:', error);
        return dateString;
    }
}

// 格式化日期（仅日期）
function formatDateOnly(dateString) {
    return formatDate(dateString, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// 格式化时间（仅时间）
function formatTimeOnly(dateString) {
    return formatDate(dateString, {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 获取相对时间（如：2小时前）
function getRelativeTime(dateString) {
    if (!dateString) return '—';
    
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
        return `${diffDays}天前`;
    } else if (diffHours > 0) {
        return `${diffHours}小时前`;
    } else if (diffMinutes > 0) {
        return `${diffMinutes}分钟前`;
    } else {
        return '刚刚';
    }
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// 确认对话框
function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// 加载状态管理
function showLoading(element, message = '加载中...') {
    if (element) {
        element.innerHTML = `
            <div class="loading">
                <i class="fas fa-spinner"></i> ${message}
            </div>
        `;
    }
}

function hideLoading(element, content) {
    if (element && content !== undefined) {
        element.innerHTML = content;
    }
}

// 空状态显示
function showEmptyState(element, message = '暂无数据', icon = 'fa-inbox') {
    if (element) {
        element.innerHTML = `
            <div class="empty-state">
                <i class="fas ${icon}"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

// 错误状态显示
function showErrorState(element, message = '加载失败，请重试', callback = null) {
    if (element) {
        element.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
                ${callback ? '<button onclick="location.reload()" class="btn btn-primary">重试</button>' : ''}
            </div>
        `;
    }
}

// API请求封装
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    // 合并headers
    if (options.headers) {
        finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
    }
    
    try {
        const response = await fetch(url, finalOptions);
        const result = await response.json();
        
        if (response.status === 401) {
            // token过期，跳转到登录页
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
            return null;
        }
        
        return result;
    } catch (error) {
        console.error('API请求失败:', error);
        throw error;
    }
}

   // 检查权限
        async function checkAuth() {
            const user = Utils.getUser();
            if (!user) {
                window.location.href = '/login.html';
                return;
            }

            // 更新用户信息
            document.getElementById('mobileUserName').textContent = user.fullName || user.username;
            document.getElementById('mobileUserRole').textContent = Utils.getAccountTypeText(user.accountType);
            
            // 加载侧边栏头像
            await loadSidebarAvatar();
            await setupNavigation() 
        }

        // 加载侧边栏头像
        async function loadSidebarAvatar() {
            try {
                const user = Utils.getUser();
                if (!user) return;

                const response = await Utils.get(`/users/${user.id}/avatar`);
                const avatarPath = response.avatarPath;

                const sidebarAvatarImage = document.getElementById('sidebarAvatarImage');
                const sidebarAvatarIcon = document.getElementById('sidebarAvatarIcon');

                if (avatarPath) {
                    sidebarAvatarImage.src = avatarPath;
                    sidebarAvatarImage.style.display = 'block';
                    sidebarAvatarIcon.style.display = 'none';
                } else {
                    sidebarAvatarImage.style.display = 'none';
                    sidebarAvatarIcon.style.display = 'block';
                }
            } catch (error) {
                console.error('加载侧边栏头像失败:', error);
                // 保持默认头像显示
            }
        }


                // 设置导航菜单权限
        function setupNavigation() {
            const user = Utils.getUser();
            if (!user) return;

            // 更新用户信息显示
            document.getElementById('mobileUserName').textContent = user.fullName || user.username;
            document.getElementById('mobileUserRole').textContent = Utils.getAccountTypeText(user.accountType);

            // 隐藏没有权限的菜单
            // 只有工程师才能看到我的工单
            if (!Utils.hasAccountType('engineer')) {
                document.getElementById('myOrdersLink')?.remove();
            }
              if (!Utils.hasPermission('仓储管理')) {
                document.getElementById('materialRequestsLink')?.remove();
            }

            // 检查是否有系统管理权限
            if (Utils.hasPermission('用户管理') || Utils.hasPermission('地址管理')) {
                document.getElementById('adminLink').style.display = 'flex';
            }
        }

    // 退出登录
        function logout() {
            Utils.confirm('退出登录', '确定要退出登录吗？', async () => {
                Utils.removeToken();
                Utils.setUser(null);
                Utils.showSuccess('退出登录成功');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 1000);
            });
        }


        // 侧边栏控制
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar) {
                sidebar.classList.toggle('open');
            }
            if (overlay) {
                overlay.classList.toggle('active');
            }
        }

        // 关闭侧边栏
        function closeSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            if (sidebar) {
                sidebar.classList.remove('open');
            }
            if (overlay) {
                overlay.classList.remove('active');
            }
        }

        // 侧边栏遮罩层点击事件
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', closeSidebar);
        }


// 导出函数供其他脚本使用
window.MobileCommon = {   
    checkAuth,
    setupNavigation,
    logout,
    toggleSidebar,
    closeSidebar,
    loadSidebarAvatar,
    showToast,
    formatDate,
    formatDateOnly,
    formatTimeOnly,
    getRelativeTime,
    debounce,
    throttle,
    confirmAction,
    showLoading,
    hideLoading,
    showEmptyState,
    showErrorState,
    apiRequest
};