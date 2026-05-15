/**
 * 认证工具脚本
 * 自动为所有 API 请求添加 session token
 */

// 获取存储的 token
function getSessionToken() {
  return localStorage.getItem('session_token');
}

// 原始 fetch 方法
const originalFetch = window.fetch;

// 重写 fetch 方法，自动添加 token
window.fetch = async function(url, options = {}) {
  const token = getSessionToken();
  
  if (token) {
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      options.headers.set('X-Session-Token', token);
    } else {
      options.headers['X-Session-Token'] = token;
    }
  }
  
  const response = await originalFetch(url, options);
  
  // 检查是否需要登录
  if (response.status === 401) {
    try {
      const data = await response.json();
      if (data.needLogin) {
        // 清除过期的 token
        localStorage.removeItem('session_token');
        // 跳转到登录页
        const redirect = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = '/login.html?redirect=' + redirect;
      }
    } catch (e) {}
  }
  
  return response;
};

// 检查登录状态
async function checkAuthStatus() {
  const token = getSessionToken();
  if (!token) return false;
  
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    return data.loggedIn;
  } catch (e) {
    return false;
  }
}

// 登出
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  localStorage.removeItem('session_token');
  window.location.href = '/login.html';
}

// 导出给全局使用
window.auth = {
  getToken: getSessionToken,
  checkStatus: checkAuthStatus,
  logout: logout
};
