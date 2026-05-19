/**
 * AI广告专家 - 统一侧边栏组件
 * 用于所有页面的侧边栏渲染
 */

class SidebarComponent {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.navItems = [
      { id: 'dashboard', icon: '📊', label: '仪表盘', path: 'index.html' },
      { id: 'ai-optimizer', icon: '⚡', label: 'AI自动优化', path: 'ai-optimizer.html' },
      // AI指挥中心功能已整合到 AI自动优化 页面的 AI对话 Tab，此处隐藏
      // { id: 'ai-command', icon: '🎯', label: 'AI指挥中心', path: 'ai-command.html', hidden: true },
      { id: 'ai-tasks', icon: '📋', label: '任务中心', path: 'ai-tasks.html' },
      { id: 'scheduler', icon: '⏰', label: '广告调度', path: 'scheduler.html', hidden: true },
      { id: 'analysis-report', icon: '📈', label: '分析报告', path: 'analysis-report.html' },
      { id: 'ad-data', icon: '📺', label: '广告数据', path: 'ad-data.html' },
      { id: 'portfolios', icon: '🗂️', label: '广告分配', path: 'portfolios.html', adminOnly: true },
      { id: 'users', icon: '👥', label: '用户管理', path: 'users.html', adminOnly: true },
      { id: 'system-logs', icon: '📋', label: '系统日志', path: 'system-logs.html', adminOnly: true },
      { id: 'data-sync', icon: '🔄', label: '数据同步', path: 'data-sync.html', adminOnly: true },
      { id: 'system-settings', icon: '⚙️', label: '系统设置', path: 'system-settings.html', adminOnly: true }
    ];
    
    // 从 localStorage 获取当前用户
    this.currentUser = this.getCurrentUser();
  }

  getCurrentUser() {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      return JSON.parse(stored);
    }
    // 默认管理员用户
    return {
      id: 'U001',
      name: '系统管理员',
      email: 'admin@example.com',
      role: 'admin'
    };
  }

  getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    // 在 app.html 中使用 hash 来判断当前页面
    if (page === 'app.html') {
      const hash = window.location.hash.substring(1);
      return hash ? hash + '.html' : 'index.html';
    }
    return page;
  }

  getVisibleItems() {
    return this.navItems.filter(item => !item.hidden && (this.currentUser.role === 'admin' || !item.adminOnly));
  }

  logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('sessionToken');
    window.location.href = 'login.html';
  }

  render() {
    if (!this.container) {
      console.error('Sidebar container not found');
      return;
    }

    const currentPage = this.getCurrentPage();
    const visibleItems = this.getVisibleItems();
    const userName = this.currentUser.name || '用户';
    const userRole = this.currentUser.role === 'admin' ? '管理员' : (this.currentUser.role === 'manager' ? '经理' : '普通用户');
    const avatarColor = this.currentUser.role === 'admin' ? '#667eea' : (this.currentUser.role === 'manager' ? '#f59e0b' : '#10b981');

    const html = `
      <aside class="sidebar">
        <div class="sidebar-inner">
          <div class="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="url(#logoGradient)"/>
              <path d="M16 6L8 12V20L16 26L24 20V12L16 6Z" fill="white" fill-opacity="0.9"/>
              <path d="M16 10L12 13V19L16 22L20 19V13L16 10Z" fill="url(#logoGradient)"/>
              <defs>
                <linearGradient id="logoGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#667eea"/>
                  <stop offset="1" stop-color="#764ba2"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="logo-text">
              <h1>AI广告<span>专家</span></h1>
              <span class="logo-sub">Amazon Ads Expert</span>
            </div>
          </div>
          <nav class="sidebar-nav">
            ${visibleItems.map(item => {
              const hash = item.path === 'index.html' ? '#' : '#' + item.path.replace('.html', '');
              const isActive = currentPage === item.path || 
                (item.path === 'index.html' && (currentPage === '' || currentPage === 'app.html'));
              return `
                <a href="${hash}" class="nav-item ${isActive ? 'active' : ''}">
                  <span class="nav-icon">${item.icon}</span>
                  <span class="nav-label">${item.label}</span>
                </a>
              `;
            }).join('')}
          </nav>
          <div class="sidebar-footer">
            <div class="user-info">
              <div class="user-avatar" style="background: ${avatarColor}">${userName.charAt(0)}</div>
              <div class="user-details">
                <div class="user-name">${userName}</div>
                <div class="user-role">${userRole}</div>
              </div>
            </div>
            <button class="logout-btn" onclick="logout()" title="退出登录">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <style>
        /* 侧边栏容器 */
        aside.sidebar {
          width: 260px;
          min-width: 260px;
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05);
          z-index: 100;
        }
        .sidebar-inner {
          height: 100%;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        /* Logo */
        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 32px;
          padding: 0 8px;
        }
        .logo svg {
          flex-shrink: 0;
        }
        .logo-text h1 {
          font-size: 18px;
          font-weight: 700;
          color: #1f2937;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          line-height: 1.2;
        }
        .logo-text h1 span {
          display: block;
          font-size: 11px;
          font-weight: 500;
          -webkit-text-fill-color: #6b7280;
          color: #6b7280;
          margin-top: -2px;
        }
        .logo-sub {
          font-size: 10px;
          color: #9ca3af;
          font-weight: 500;
          letter-spacing: 0.3px;
          display: none;
        }
        /* 导航 */
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }
        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 10px;
          color: #6b7280;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .nav-item:hover {
          background: #f3f4f6;
          color: #1f2937;
        }
        .nav-item.active {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
          color: #667eea;
        }
        .nav-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 24px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 0 2px 2px 0;
        }
        .nav-icon {
          font-size: 18px;
          width: 24px;
          text-align: center;
          flex-shrink: 0;
        }
        .nav-label {
          flex: 1;
        }
        /* 用户信息区域 */
        .sidebar-footer {
          margin-top: auto;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .user-info {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 14px;
          flex-shrink: 0;
        }
        .user-details {
          flex: 1;
          min-width: 0;
        }
        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: #1f2937;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .user-role {
          font-size: 11px;
          color: #9ca3af;
        }
        .logout-btn {
          width: 36px;
          height: 36px;
          border: none;
          background: #fee2e2;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ef4444;
          transition: all 0.2s;
          flex-shrink: 0;
        }
        .logout-btn:hover {
          background: #fecaca;
        }
      </style>
    `;

    this.container.innerHTML = html;
  }
}

// 全局退出登录函数
function logout() {
  localStorage.removeItem('currentUser');
  localStorage.removeItem('sessionToken');
  window.location.href = 'login.html';
}

// 检测是否在 iframe 内运行
function isInIframe() {
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
}

// 页面加载后自动初始化
document.addEventListener('DOMContentLoaded', () => {
  // 如果在 SPA 模式下，不自动初始化（由 app.html 手动控制）
  if (window.__spaMode) return;

  // 如果在 iframe 内，不自动初始化侧边栏（由父页面统一渲染）
  if (isInIframe()) return;

  // 检查是否存在侧边栏容器
  const sidebarContainer = document.getElementById('sidebar');
  if (sidebarContainer) {
    const sidebar = new SidebarComponent('sidebar');
    sidebar.render();

    // 绑定导航点击事件，使用AJAX加载页面内容
    bindNavClickEvents();
  }
});

// 绑定导航点击事件
function bindNavClickEvents() {
  // 如果在 iframe 内或在 app.html 中，不处理（由父页面统一处理）
  if (isInIframe() || window.location.pathname.includes('app.html')) return;

  // 独立访问子页面时：点击菜单跳转到对应页面
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const href = item.getAttribute('href');
      if (href && href.startsWith('#')) {
        const page = href.substring(1) || 'index';
        const targetUrl = page === 'index' ? 'index.html' : page + '.html';
        window.location.href = targetUrl;
      }
    });
  });
}

// 导出供手动调用
window.SidebarComponent = SidebarComponent;
