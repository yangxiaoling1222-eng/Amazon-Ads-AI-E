/**
 * 全局登录状态检查 + 自动认证注入
 * 每个页面引入此脚本，未登录自动跳转，且自动为所有 fetch 请求添加 token
 */
(function() {
  // 登录页不需要检查
  if (window.location.pathname.includes('login.html')) {
    return;
  }

  const sessionToken = localStorage.getItem('sessionToken');

  // 检查是否已登录
  if (!sessionToken) {
    window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
    return;
  }

  // ── 拦截所有 fetch，自动注入 X-Session-Token ──
  const originalFetch = window.fetch;
  window.fetch = async function(url, options = {}) {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        options.headers.set('X-Session-Token', token);
      } else {
        options.headers['X-Session-Token'] = token;
      }
      console.log('[auth-check] 注入token到请求:', url, 'token前8位:', token.slice(0,8));
    } else {
      console.warn('[auth-check] 请求无token:', url);
    }

    console.log('[auth-check] 最终headers:', JSON.stringify(options.headers));

    const response = await originalFetch(url, options);

    console.log('[auth-check] 收到响应:', url, 'status:', response.status);

    // 注意：401 时不自动跳转，让各页面自己处理错误展示
    // 只在页面初始加载校验失败时才跳转（见下方 /api/auth/status 检查）

    return response;
  };

  // 可选：验证 token 是否有效（异步）
  fetch('/api/auth/status')
  .then(res => res.json())
  .then(data => {
    if (!data.loggedIn) {
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('currentUser');
      setTimeout(() => {
        window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
      }, 300);
    }
  })
  .catch(() => {
    console.log('无法验证登录状态，使用本地缓存');
  });
})();
