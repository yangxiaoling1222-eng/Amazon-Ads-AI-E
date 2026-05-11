/**
 * 数据库初始化脚本
 * 运行: node scripts/init-db.js
 */

require('dotenv').config();
const db = require('../config/database');

console.log('🔧 初始化数据库数据...\n');

// 等待数据库初始化完成
async function initData() {
  // 确保数据库已就绪
  await db.ready();
  
  // 清空现有数据
  db.run('DELETE FROM operation_logs');
  db.run('DELETE FROM budget_rules');
  db.run('DELETE FROM portfolios');
  db.run('DELETE FROM users');

  // 插入管理员用户
  db.run(`
    INSERT INTO users (id, name, email, password, role, status, stores) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['U001', '系统管理员', 'admin@example.com', '123456', 'admin', 'active', 'store_us,store_uk,store_de,store_jp']);
  
  db.run(`
    INSERT INTO users (id, name, email, password, role, status, stores) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['U002', '李华', 'lihua@example.com', '123456', 'manager', 'active', 'store_us,store_uk']);
  
  db.run(`
    INSERT INTO users (id, name, email, password, role, status, stores) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['U003', '王芳', 'wangfang@example.com', '123456', 'manager', 'active', 'store_de,store_jp']);
  
  db.run(`
    INSERT INTO users (id, name, email, password, role, status, stores) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['U004', '赵伟', 'zhaowei@example.com', '123456', 'user', 'active', 'store_us']);
  
  db.run(`
    INSERT INTO users (id, name, email, password, role, status, stores) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, ['U005', '钱敏', 'qianmin@example.com', '123456', 'user', 'inactive', 'store_uk']);

  console.log('✅ 用户数据已插入');

  // 插入广告组合
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P001', '电子类产品组合', 'store_us', '美国站', 'U002', 15, 12.3, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P002', '家居类产品组合', 'store_us', '美国站', 'U002', 20, 28.5, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P003', '服装类产品组合', 'store_uk', '英国站', 'U003', 18, 16.2, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P004', '玩具类产品组合', 'store_de', '德国站', null, 22, 19.8, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P005', '美妆类产品组合', 'store_jp', '日本站', 'U003', 16, 24.1, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P006', '运动户外组合', 'store_us', '美国站', 'U004', 18, 15.5, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P007', '厨房用品组合', 'store_uk', '英国站', null, 20, 18.2, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P008', '宠物用品组合', 'store_de', '德国站', 'U002', 22, 20.5, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P009', '办公用品组合', 'store_jp', '日本站', null, 18, 21.3, 'active']);
  
  db.run(`
    INSERT INTO portfolios (id, name, store_id, store_name, owner_id, target_acos, current_acos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, ['P010', '母婴用品组合', 'store_us', '美国站', 'U004', 20, 17.8, 'active']);

  console.log('✅ 广告组合数据已插入');

  // 插入一些操作日志
  db.run(`
    INSERT INTO operation_logs (operator, operation_type, target_name, details)
    VALUES (?, ?, ?, ?)
  `, ['系统管理员', '登录系统', '系统', '用户登录成功']);
  
  db.run(`
    INSERT INTO operation_logs (operator, operation_type, target_name, details)
    VALUES (?, ?, ?, ?)
  `, ['李华', '优化广告', '电子类产品组合', '调整竞价: 0.5 -> 0.6']);
  
  db.run(`
    INSERT INTO operation_logs (operator, operation_type, target_name, details)
    VALUES (?, ?, ?, ?)
  `, ['王芳', '创建目标', '服装类产品组合', '目标ACOS: 18%']);
  
  db.run(`
    INSERT INTO operation_logs (operator, operation_type, target_name, details)
    VALUES (?, ?, ?, ?)
  `, ['系统管理员', '分配任务', '玩具类产品组合', '分配给: 待定']);
  
  db.run(`
    INSERT INTO operation_logs (operator, operation_type, target_name, details)
    VALUES (?, ?, ?, ?)
  `, ['赵伟', '查看报告', '运动户外组合', '查看日报数据']);

  console.log('✅ 操作日志数据已插入');

  // 输出统计
  console.log('\n📊 数据统计:');
  const uCount = db.get('SELECT COUNT(*) as c FROM users')?.c || 0;
  const pCount = db.get('SELECT COUNT(*) as c FROM portfolios')?.c || 0;
  const aCount = db.get('SELECT COUNT(*) as c FROM portfolios WHERE owner_id IS NOT NULL')?.c || 0;
  const lCount = db.get('SELECT COUNT(*) as c FROM operation_logs')?.c || 0;
  
  console.log('  - 用户数量:', uCount);
  console.log('  - 广告组合数量:', pCount);
  console.log('  - 已分配组合:', aCount);
  console.log('  - 操作日志:', lCount);

  console.log('\n🎉 数据库初始化完成！');
  console.log('\n测试账号:');
  console.log('  管理员: admin@example.com / 123456');
  console.log('  经理:   lihua@example.com / 123456');
  console.log('  用户:   zhaowei@example.com / 123456');
  
  process.exit(0);
}

initData().catch(err => {
  console.error('❌ 初始化失败:', err);
  process.exit(1);
});
