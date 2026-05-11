/**
 * 领星ERP API 路由
 */

const express = require('express');
const router = express.Router();
const lingxingService = require('../services/lingxing');
const db = require('../config/database');

// 测试连接
router.get('/test', async (req, res) => {
  try {
    const result = await lingxingService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取店铺列表（优先从数据库读取）
router.get('/stores', async (req, res) => {
  try {
    // 先尝试从数据库获取
    const dbStores = db.query('SELECT * FROM sync_stores ORDER BY last_sync_at DESC');
    
    if (dbStores.length > 0) {
      res.json({ success: true, data: dbStores, fromDb: true });
    } else {
      // 数据库没有，从API获取并保存
      const stores = await lingxingService.getStores();
      saveStores(stores);
      res.json({ success: true, data: stores });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取产品列表
router.get('/products', async (req, res) => {
  try {
    const { storeId, page, pageSize } = req.query;
    
    const dbProducts = db.query('SELECT * FROM sync_products ORDER BY last_sync_at DESC');
    
    if (dbProducts.length > 0) {
      res.json({ success: true, data: dbProducts, fromDb: true });
    } else {
      const products = await lingxingService.getProducts({ storeId, page, pageSize });
      saveProducts(products);
      res.json({ success: true, data: products });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取广告活动
router.get('/campaigns', async (req, res) => {
  try {
    const { storeId, page, pageSize } = req.query;
    
    const dbCampaigns = db.query('SELECT * FROM sync_campaigns ORDER BY last_sync_at DESC');
    
    if (dbCampaigns.length > 0) {
      res.json({ success: true, data: dbCampaigns, fromDb: true });
    } else {
      const campaigns = await lingxingService.getCampaigns({ storeId, page, pageSize });
      saveCampaigns(campaigns);
      res.json({ success: true, data: campaigns });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取广告报告
router.post('/report', async (req, res) => {
  try {
    const { storeId, campaignId, adGroupId, startDate, endDate, metrics } = req.body;
    const report = await lingxingService.getAdReport({ storeId, campaignId, adGroupId, startDate, endDate, metrics });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取组合性能
router.post('/portfolio/performance', async (req, res) => {
  try {
    const { storeId, portfolioId, startDate, endDate } = req.body;
    const performance = await lingxingService.getPortfolioPerformance({ storeId, portfolioId, startDate, endDate });
    res.json({ success: true, data: performance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 同步广告数据
router.post('/sync', async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.body;
    
    // 同步所有数据
    const [stores, products, campaigns, reportData] = await Promise.all([
      lingxingService.getStores(),
      lingxingService.getProducts({ storeId }),
      lingxingService.getCampaigns({ storeId }),
      lingxingService.getAdReport({ storeId, startDate, endDate })
    ]);
    
    // 保存到数据库
    saveStores(stores);
    saveProducts(products);
    saveCampaigns(campaigns);
    saveReports(reportData.data || reportData);
    
    // 记录同步日志
    db.run(
      'INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)',
      ['full', 'success', `同步完成: ${stores.length}店铺, ${products.length}产品, ${campaigns.length}活动`]
    );
    
    res.json({ 
      success: true, 
      data: {
        stores: stores.length,
        products: products.length,
        campaigns: campaigns.length,
        reports: (reportData.data || reportData).length
      }
    });
  } catch (error) {
    db.run(
      'INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)',
      ['full', 'error', error.message]
    );
    res.status(500).json({ success: false, message: error.message });
  }
});

// 调试接口 - 查看数据库中的数据
router.get('/debug', async (req, res) => {
  try {
    const stores = db.query('SELECT * FROM sync_stores');
    const products = db.query('SELECT * FROM sync_products');
    const campaigns = db.query('SELECT * FROM sync_campaigns');
    const reports = db.query('SELECT * FROM sync_reports LIMIT 10');
    
    res.json({
      success: true,
      debug: {
        storesCount: stores.length,
        productsCount: products.length,
        campaignsCount: campaigns.length,
        reportsCount: reports.length,
        stores: stores.slice(0, 3),
        campaigns: campaigns.slice(0, 3)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取概览统计数据
router.get('/overview', async (req, res) => {
  try {
    const [stores, products, campaigns, reports] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM sync_stores'),
      db.query('SELECT COUNT(*) as count FROM sync_products'),
      db.query('SELECT COUNT(*) as count FROM sync_campaigns'),
      db.query(`
        SELECT 
          SUM(impressions) as impressions,
          SUM(clicks) as clicks,
          SUM(cost) as cost,
          SUM(sales) as sales,
          SUM(orders) as orders
        FROM sync_reports
      `)
    ]);
    
    const summary = reports[0] || {};
    
    res.json({
      success: true,
      data: {
        stores: stores[0]?.count || 0,
        products: products[0]?.count || 0,
        campaigns: campaigns[0]?.count || 0,
        impressions: summary.impressions || 0,
        clicks: summary.clicks || 0,
        cost: summary.cost || 0,
        sales: summary.sales || 0,
        orders: summary.orders || 0,
        acos: summary.sales > 0 ? ((summary.cost / summary.sales) * 100).toFixed(2) : 0,
        roas: summary.cost > 0 ? (summary.sales / summary.cost).toFixed(2) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存店铺数据
function saveStores(stores) {
  if (!stores || stores.length === 0) return;
  
  for (const store of stores) {
    db.run(`
      INSERT OR REPLACE INTO sync_stores 
      (store_id, store_name, marketplace, region, status, last_sync_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [store.store_id, store.store_name, store.marketplace, store.region, store.status]);
  }
}

// 保存产品数据
function saveProducts(products) {
  if (!products || products.length === 0) return;
  
  for (const product of products) {
    db.run(`
      INSERT OR REPLACE INTO sync_products 
      (sku_id, sku, asin, name, img, status, store_id, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [product.sku_id, product.sku, product.asin, product.name, product.img, product.status, product.store_id]);
  }
}

// 保存广告活动数据
function saveCampaigns(campaigns) {
  if (!campaigns || campaigns.length === 0) return;
  
  for (const campaign of campaigns) {
    db.run(`
      INSERT OR REPLACE INTO sync_campaigns 
      (campaign_id, campaign_name, type, status, budget, store_id, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [campaign.campaign_id, campaign.campaign_name, campaign.type, campaign.status, campaign.budget, campaign.store_id]);
  }
}

// 保存报告数据
function saveReports(reports) {
  if (!reports || reports.length === 0) return;
  
  for (const report of reports) {
    db.run(`
      INSERT OR REPLACE INTO sync_reports 
      (date, campaign_id, impressions, clicks, cost, sales, orders, ctr, cpc, acos, roas, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      report.date, report.campaign_id, report.impressions, report.clicks, 
      report.cost, report.sales, report.orders, report.ctr, report.cpc, report.acos, report.roas
    ]);
  }
}

module.exports = router;
