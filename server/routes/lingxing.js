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
    const dbCampaigns = db.query('SELECT * FROM sync_campaigns ORDER BY last_sync_at DESC');
    
    if (dbCampaigns.length > 0) {
      res.json({ success: true, data: dbCampaigns, fromDb: true });
    } else {
      // 先获取店铺列表，再逐个店铺同步广告活动
      const stores = await lingxingService.getStores();
      let allCampaigns = [];
      for (const store of stores || []) {
        try {
          const campaigns = await lingxingService.getCampaigns({ sid: store.sid });
          allCampaigns = allCampaigns.concat(campaigns || []);
        } catch (e) {
          console.warn(`[routes] 店铺 ${store.sid} 广告活动获取失败:`, e.message);
        }
      }
      saveCampaigns(allCampaigns);
      res.json({ success: true, data: allCampaigns });
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
    
    // 获取店铺列表
    const stores = await lingxingService.getStores();
    
    // 逐个店铺同步产品、广告活动、报告
    let allProducts = [];
    let allCampaigns = [];
    let allReports = [];
    
    for (const store of stores || []) {
      try {
        const [products, campaigns, reportData] = await Promise.all([
          lingxingService.getProducts({ storeId: store.sid }),
          lingxingService.getCampaigns({ sid: store.sid }),
          lingxingService.getAdReport({ storeId: store.sid, startDate, endDate })
        ]);
        allProducts = allProducts.concat(products || []);
        allCampaigns = allCampaigns.concat(campaigns || []);
        allReports = allReports.concat((reportData.data || reportData) || []);
      } catch (e) {
        console.warn(`[sync] 店铺 ${store.sid} 同步失败:`, e.message);
      }
    }
    
    // 保存到数据库
    saveStores(stores);
    saveProducts(allProducts);
    saveCampaigns(allCampaigns);
    
    // 按店铺分组保存报告（带上 store_id）
    const reportsByStore = {};
    for (const store of stores || []) {
      const sid = String(store.sid);
      if (!reportsByStore[sid]) reportsByStore[sid] = [];
    }
    allReports.forEach(r => {
      const sid = String(r.store_id || r.sid || '');
      if (sid && !reportsByStore[sid]) reportsByStore[sid] = [];
      if (sid && reportsByStore[sid]) {
        reportsByStore[sid].push(r);
      } else {
        // 未匹配店铺的报告归入第一个店铺
        const firstStore = stores?.[0]?.sid;
        if (firstStore && !reportsByStore[String(firstStore)]) reportsByStore[String(firstStore)] = [];
        if (firstStore) reportsByStore[String(firstStore)].push(r);
      }
    });
    for (const [sid, reps] of Object.entries(reportsByStore)) {
      saveReports(reps, sid);
    }
    
    // 记录同步日志
    db.run(
      'INSERT INTO sync_logs (sync_type, status, message) VALUES (?, ?, ?)',
      ['full', 'success', `同步完成: ${stores.length}店铺, ${allProducts.length}产品, ${allCampaigns.length}活动, ${allReports.length}报告`]
    );
    
    res.json({ 
      success: true, 
      data: {
        stores: stores.length,
        products: allProducts.length,
        campaigns: allCampaigns.length,
        reports: allReports.length
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

// ============ 广告数据（组合/活动视图） ============

// 获取广告组合列表（支持店铺+日期筛选）
router.get('/portfolios', async (req, res) => {
  try {
    const { storeId, startDate, endDate, page, pageSize } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageSz = parseInt(pageSize) || 20;

    // 优先从数据库读 campaigns
    let campaigns = db.query('SELECT * FROM sync_campaigns ORDER BY campaign_name');
    if (storeId) {
      const sid = String(storeId);
      campaigns = campaigns.filter(c => String(c.store_id || '') === sid);
    }

    // 按 campaign_id 聚合报告数据（可按日期范围筛选）
    let reports = db.query('SELECT * FROM sync_reports');
    if (startDate) reports = reports.filter(r => r.date >= startDate);
    if (endDate)   reports = reports.filter(r => r.date <= endDate);

    const byCampaign = {};
    reports.forEach(r => {
      if (!byCampaign[r.campaign_id]) {
        byCampaign[r.campaign_id] = { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 };
      }
      byCampaign[r.campaign_id].impressions += r.impressions || 0;
      byCampaign[r.campaign_id].clicks       += r.clicks       || 0;
      byCampaign[r.campaign_id].cost          += r.cost          || 0;
      byCampaign[r.campaign_id].sales         += r.sales         || 0;
      byCampaign[r.campaign_id].orders        += r.orders        || 0;
    });

    // 合并活动元数据 + 性能数据
    let list = campaigns.map(c => {
      const m = byCampaign[c.campaign_id] || {};
      const cost   = parseFloat(m.cost)   || 0;
      const sales  = parseFloat(m.sales)  || 0;
      const clicks = parseInt(m.clicks)   || 0;
      const imp    = parseInt(m.impressions) || 0;
      return {
        campaign_id:       c.campaign_id,
        campaign_name:     c.campaign_name,
        type:              c.type,
        status:            c.status,
        budget:            c.budget,
        store_id:          c.store_id,
        impressions:       imp,
        clicks,
        cost:              parseFloat(cost.toFixed(2)),
        sales:             parseFloat(sales.toFixed(2)),
        orders:            parseInt(m.orders) || 0,
        ctr:               imp > 0 ? parseFloat((clicks / imp * 100).toFixed(2)) : 0,
        cpc:               clicks > 0 ? parseFloat((cost / clicks).toFixed(2)) : 0,
        acos:              sales > 0 ? parseFloat((cost / sales * 100).toFixed(2)) : 0,
        roas:              cost > 0 ? parseFloat((sales / cost).toFixed(2)) : 0,
        lingxing_url:      `https://www.lingxing.com/adv/campaign/detail?campaign_id=${c.campaign_id}&store_id=${c.store_id}`
      };
    });

    // 按花费降序
    list.sort((a, b) => b.cost - a.cost);

    // 分页
    const total = list.length;
    const start = (pageNum - 1) * pageSz;
    list = list.slice(start, start + pageSz);

    // 汇总
    const summary = {
      total: total,
      impressions: list.reduce((s, r) => s + r.impressions, 0),
      clicks:      list.reduce((s, r) => s + r.clicks, 0),
      cost:        parseFloat(list.reduce((s, r) => s + r.cost, 0).toFixed(2)),
      sales:       parseFloat(list.reduce((s, r) => s + r.sales, 0).toFixed(2)),
      orders:      list.reduce((s, r) => s + r.orders, 0),
    };
    const sCost  = summary.cost;
    const sSales = summary.sales;
    const sClicks = summary.clicks;
    const sImp    = summary.impressions;
    summary.ctr  = sImp   > 0 ? parseFloat((sClicks / sImp * 100).toFixed(2)) : 0;
    summary.cpc  = sClicks > 0 ? parseFloat((sCost / sClicks).toFixed(2)) : 0;
    summary.acos = sSales > 0 ? parseFloat((sCost / sSales * 100).toFixed(2)) : 0;
    summary.roas = sCost  > 0 ? parseFloat((sSales / sCost).toFixed(2)) : 0;

    res.json({ success: true, data: list, summary, total, page: pageNum, pageSize: pageSz });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取单个广告组合详情（含广告组列表）
router.get('/portfolios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // 活动基本信息
    const campaigns = db.query('SELECT * FROM sync_campaigns WHERE campaign_id = ?', [id]);
    if (!campaigns.length) return res.status(404).json({ success: false, message: '广告组合不存在' });

    const c = campaigns[0];

    // 该活动的每日报告数据
    let reports = db.query('SELECT * FROM sync_reports WHERE campaign_id = ? ORDER BY date', [id]);
    if (startDate) reports = reports.filter(r => r.date >= startDate);
    if (endDate)   reports = reports.filter(r => r.date <= endDate);

    // 汇总
    const m = reports.reduce((acc, r) => {
      acc.impressions += r.impressions || 0;
      acc.clicks       += r.clicks       || 0;
      acc.cost         += r.cost          || 0;
      acc.sales        += r.sales         || 0;
      acc.orders       += r.orders        || 0;
      return acc;
    }, { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 });

    const cost   = parseFloat(m.cost.toFixed(2));
    const sales  = parseFloat(m.sales.toFixed(2));
    const clicks = m.clicks;
    const imp    = m.impressions;

    // 店铺信息
    const stores = db.query('SELECT * FROM sync_stores WHERE store_id = ?', [c.store_id]);
    const storeName = stores.length ? stores[0].store_name : c.store_id;

    // 模拟广告组数据（mock阶段）
    const adGroups = [
      { ad_group_id: `${id}_ag1`, ad_group_name: '精准词组A', status: 'enabled', bids: 1.2, impressions: Math.floor(imp * 0.4), clicks: Math.floor(clicks * 0.38), cost: parseFloat((cost * 0.38).toFixed(2)), sales: parseFloat((sales * 0.4).toFixed(2)), orders: Math.floor(m.orders * 0.38), acos: sales > 0 ? parseFloat((cost * 0.38 / (sales * 0.4) * 100).toFixed(2)) : 0 },
      { ad_group_id: `${id}_ag2`, ad_group_name: '精准词组B', status: 'enabled', bids: 0.85, impressions: Math.floor(imp * 0.35), clicks: Math.floor(clicks * 0.35), cost: parseFloat((cost * 0.35).toFixed(2)), sales: parseFloat((sales * 0.35).toFixed(2)), orders: Math.floor(m.orders * 0.35), acos: sales > 0 ? parseFloat((cost * 0.35 / (sales * 0.35) * 100).toFixed(2)) : 0 },
      { ad_group_id: `${id}_ag3`, ad_group_name: '自动匹配组', status: 'enabled', bids: 0.6, impressions: Math.floor(imp * 0.25), clicks: Math.floor(clicks * 0.27), cost: parseFloat((cost * 0.27).toFixed(2)), sales: parseFloat((sales * 0.25).toFixed(2)), orders: Math.floor(m.orders * 0.27), acos: sales > 0 ? parseFloat((cost * 0.27 / (sales * 0.25) * 100).toFixed(2)) : 0 },
    ];

    res.json({
      success: true,
      data: {
        campaign: {
          ...c,
          store_name: storeName,
          impressions: imp,
          clicks,
          cost,
          sales,
          orders: m.orders,
          ctr:  imp > 0 ? parseFloat((clicks / imp * 100).toFixed(2)) : 0,
          cpc:  clicks > 0 ? parseFloat((cost / clicks).toFixed(2)) : 0,
          acos: sales > 0 ? parseFloat((cost / sales * 100).toFixed(2)) : 0,
          roas: cost > 0 ? parseFloat((sales / cost).toFixed(2)) : 0,
          lingxing_url: `https://www.lingxing.com/adv/campaign/detail?campaign_id=${id}&store_id=${c.store_id}`,
          daily: reports.map(r => ({
            date:       r.date,
            impressions: r.impressions,
            clicks:     r.clicks,
            cost:       r.cost,
            sales:      r.sales,
            orders:     r.orders,
          }))
        },
        adGroups
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取概览统计数据（仪表盘核心指标）
router.get('/overview', async (req, res) => {
  try {
    const { storeId, startDate, endDate } = req.query;

    // 汇总报告数据
    let reports = db.query('SELECT * FROM sync_reports');
    if (storeId) {
      const sid = String(storeId);
      reports = reports.filter(r => String(r.store_id || '') === sid);
    }
    if (startDate) reports = reports.filter(r => r.date >= startDate);
    if (endDate)   reports = reports.filter(r => r.date <= endDate);

    const summary = reports.reduce((acc, r) => {
      acc.impressions += r.impressions || 0;
      acc.clicks       += r.clicks       || 0;
      acc.cost         += r.cost         || 0;
      acc.sales        += r.sales        || 0;
      acc.orders       += r.orders       || 0;
      return acc;
    }, { impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 });

    // 活动数量
    let campaigns = db.query('SELECT * FROM sync_campaigns');
    if (storeId) {
      const sid = String(storeId);
      campaigns = campaigns.filter(c => String(c.store_id || '') === sid);
    }

    // 店铺数量
    const stores = db.query('SELECT * FROM sync_stores');

    const cost   = parseFloat(summary.cost.toFixed(2));
    const sales  = parseFloat(summary.sales.toFixed(2));
    const clicks = summary.clicks;
    const imp    = summary.impressions;

    res.json({
      success: true,
      data: {
        totalSales:        sales,
        totalCost:         cost,
        totalOrders:       summary.orders,
        acos:              sales > 0 ? parseFloat((cost / sales * 100).toFixed(2)) : 0,
        roas:              cost > 0 ? parseFloat((sales / cost).toFixed(2)) : 0,
        impressions:       imp,
        clicks:            clicks,
        ctr:               imp > 0 ? parseFloat((clicks / imp * 100).toFixed(2)) : 0,
        cpc:               clicks > 0 ? parseFloat((cost / clicks).toFixed(2)) : 0,
        campaignCount:     campaigns.length,
        storeCount:        stores.length,
        reportDateRange:   reports.length
          ? { start: reports[0].date, end: reports[reports.length - 1].date }
          : null,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取趋势数据（按日期分组，用于图表）
router.get('/trend', async (req, res) => {
  try {
    const { storeId, startDate, endDate, days } = req.query;
    const limit = parseInt(days) || 30;

    let reports = db.query('SELECT * FROM sync_reports ORDER BY date DESC LIMIT ?', [limit * 10]); // 多取一些以防过滤
    if (storeId) {
      const sid = String(storeId);
      reports = reports.filter(r => String(r.store_id || '') === sid);
    }
    if (startDate) reports = reports.filter(r => r.date >= startDate);
    if (endDate)   reports = reports.filter(r => r.date <= endDate);

    // 按日期聚合
    const byDate = {};
    reports.forEach(r => {
      const d = r.date;
      if (!byDate[d]) {
        byDate[d] = { date: d, impressions: 0, clicks: 0, cost: 0, sales: 0, orders: 0 };
      }
      byDate[d].impressions += r.impressions || 0;
      byDate[d].clicks       += r.clicks       || 0;
      byDate[d].cost         += r.cost         || 0;
      byDate[d].sales        += r.sales        || 0;
      byDate[d].orders       += r.orders       || 0;
    });

    // 按日期排序，取最近 N 天
    let trend = Object.values(byDate)
      .map(d => ({
        ...d,
        cost:  parseFloat(d.cost.toFixed(2)),
        sales: parseFloat(d.sales.toFixed(2)),
        ctr:   d.impressions > 0 ? parseFloat((d.clicks / d.impressions * 100).toFixed(2)) : 0,
        cpc:   d.clicks > 0 ? parseFloat((d.cost / d.clicks).toFixed(2)) : 0,
        acos:  d.sales > 0 ? parseFloat((d.cost / d.sales * 100).toFixed(2)) : 0,
        roas:  d.cost > 0 ? parseFloat((d.sales / d.cost).toFixed(2)) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 只返回最近 N 天
    if (trend.length > limit) {
      trend = trend.slice(trend.length - limit);
    }

    res.json({ success: true, data: trend, total: trend.length });
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
    `, [store.sid, store.name, store.country, store.region, store.status]);
  }
}

function saveProducts(products) {
  if (!products || products.length === 0) return;
  for (const product of products) {
    db.run(`
      INSERT OR REPLACE INTO sync_products 
      (sku_id, sku, asin, name, img, status, store_id, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [product.id || product.sku_id || 0, product.sku || '', product.asin || null, product.product_name || product.name || '', product.pic_url || null, product.status || 1, product.cid || null]);
  }
}

function saveCampaigns(campaigns) {
  if (!campaigns || campaigns.length === 0) return;
  for (const campaign of campaigns) {
    db.run(`
      INSERT OR REPLACE INTO sync_campaigns 
      (campaign_id, campaign_name, type, status, budget, store_id, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [campaign.campaign_id, campaign.name || '', campaign.campaign_type || 'unknown', campaign.state || 'enabled', campaign.daily_budget || 0, campaign.sid || null]);
  }
}

function saveReports(reports, storeId) {
  if (!reports || reports.length === 0) return;
  for (const report of reports) {
    db.run(`
      INSERT OR REPLACE INTO sync_reports 
      (date, campaign_id, store_id, impressions, clicks, cost, sales, orders, ctr, cpc, acos, roas, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, [
      report.report_date || report.date || new Date().toISOString().slice(0,10),
      report.campaign_id || null,
      storeId || report.store_id || null,
      report.impressions || 0,
      report.clicks || 0,
      report.cost || 0,
      report.sales || 0,
      report.orders || 0,
      report.ctr || 0,
      report.cpc || 0,
      report.acos || 0,
      report.roas || 0
    ]);
  }
}

module.exports = router;