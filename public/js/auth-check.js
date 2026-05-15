/**
 * 全局登录状态检查
 * 每个页面引入此脚本，未登录自动跳转到登录页
 */
(function() {
  // 登录页不需要检查
  if (window.location.pathname.includes('login.html')) {
    return;
  }
  
  const sessionToken = localStorage.getItem('sessionToken');
  
  // 检查是否已登录
  if (!sessionToken) {
    // 未登录，跳转到登录页
    window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
    return;
  }
  
  // 可选：验证token是否有效（异步）
  fetch('/api/auth/status', {
    headers: {
      'x-session-token': sessionToken
    }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.loggedIn) {
      // token无效，清除并跳转
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('currentUser');
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
    }
  })
  .catch(() => {
    // 网络错误，继续允许访问（避免离线时无法使用）
    console.log('无法验证登录状态，使用本地缓存');
  });
})();
