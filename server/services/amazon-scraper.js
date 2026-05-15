/**
 * 亚马逊产品页面抓取服务
 * 从亚马逊页面提取 Listing 信息供 AI 分析
 */

const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

/**
 * 从 ASIN 构造亚马逊产品页 URL
 */
function buildAmazonUrl(asin, marketplace = 'com') {
  const domains = {
    com: 'www.amazon.com',
    co: 'www.amazon.co.uk',
    de: 'www.amazon.de',
    fr: 'www.amazon.fr',
    it: 'www.amazon.it',
    es: 'www.amazon.es',
    jp: 'www.amazon.co.jp',
    ca: 'www.amazon.ca',
    in: 'www.amazon.in',
    mx: 'www.amazon.com.mx',
    au: 'www.amazon.com.au'
  };
  const domain = domains[marketplace] || domains.com;
  return `https://${domain}/dp/${asin}`;
}

/**
 * 从 URL 中提取 ASIN
 */
function extractAsin(url) {
  // 支持格式:
  // https://www.amazon.com/dp/B08N5WRWNW
  // https://www.amazon.com/gp/product/B08N5WRWNW
  // https://www.amazon.com/dp/product/B08N5WRWNW?ref=...
  // B08N5WRWNW
  // 注：Node.js v24.x 对正则字面量中 (?: 非捕获分组有解析 bug，改用 RegExp 构造函数
  const patterns = [
    new RegExp('amazon\\.com\\/(?:dp|gp\\/product)\\/([A-Z0-9]{10})', 'i'),
    new RegExp('amazon\\.[a.]+\\/dp\\/([A-Z0-9]{10})', 'i'),
    new RegExp('([A-Z0-9]{10})(?:\\/|$)', 'i')
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

/**
 * 检测市场域名
 */
function detectMarketplace(url) {
  const domainMap = {
    'amazon.com': 'com',
    'amazon.co.uk': 'co',
    'amazon.co.jp': 'jp',
    'amazon.ca': 'ca',
    'amazon.de': 'de',
    'amazon.fr': 'fr',
    'amazon.it': 'it',
    'amazon.es': 'es',
    'amazon.in': 'in',
    'amazon.com.mx': 'mx',
    'amazon.com.au': 'au'
  };

  for (const [domain, marketplace] of Object.entries(domainMap)) {
    if (url.includes(domain)) return marketplace;
  }
  return 'com';
}

/**
 * 抓取亚马逊产品页面
 */
async function scrapeAmazonProduct(url) {
  let asin = extractAsin(url);
  let marketplace = detectMarketplace(url);

  // 如果 ASIN 在 URL 中不存在，尝试从 URL 中提取完整 URL
  if (!url.includes('amazon.com') && !url.includes('amazon.')) {
    throw new Error('无效的亚马逊链接，请输入类似 https://www.amazon.com/dp/B08N5WRWNW 的链接');
  }

  // 如果 URL 不是 dp 格式，构造标准 URL
  if (!url.includes('/dp/') && !url.includes('/gp/product/')) {
    if (asin) {
      url = buildAmazonUrl(asin, marketplace);
    } else {
      throw new Error('无法从链接中提取 ASIN');
    }
  }

  console.log(`[AmazonScraper] 正在抓取: ${url}`);

  try {
    // 设置请求头模拟真实浏览器（增强反爬）
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'Referer': 'https://www.google.com/search?q=amazon+product',
      'DNT': '1',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };

    // 检查是否有代理配置
    const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null;

    const axiosConfig = {
      headers,
      timeout: 30000,
      responseType: 'arraybuffer',
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    };

    if (proxy) {
      axiosConfig.proxy = false; // 禁用默认代理，使用环境变量
      const HttpsProxyAgent = require('https-proxy-agent');
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxy);
    }

    const response = await axios.get(url, axiosConfig);

    // 处理编码
    let html;
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('charset=gb')) {
      html = iconv.decode(Buffer.from(response.data), 'gbk');
    } else {
      // 尝试从 HTML 中检测编码
      const rawHtml = response.data.toString('utf-8');
      const encodingMatch = rawHtml.match(/charset=([\\w-]+)/i);
      if (encodingMatch) {
        const encoding = encodingMatch[1].replace('\\', '');
        html = iconv.decode(Buffer.from(response.data), encoding);
      } else {
        html = rawHtml;
      }
    }

    const $ = cheerio.load(html);

    // ── 反爬检测 ──
    const pageTitle = $('title').text().toLowerCase();
    const pageText = $('body').text().toLowerCase();

    // 检查验证码/反爬页面
    if (pageTitle.includes('robot') ||
        pageTitle.includes('captcha') ||
        pageTitle.includes('verify') ||
        pageText.includes('robot check') ||
        pageText.includes('type the characters') ||
        pageText.includes('enter the characters') ||
        pageText.includes('api-services-support@amazon') ||
        pageText.includes('sorry, we just need to make sure') ||
        pageText.includes('to discuss automated access')) {
      return {
        success: false,
        error: '亚马逊检测到自动化访问，要求验证码验证。这是亚马逊的反爬机制，建议：1) 切换到手动输入模式；2) 或稍后再试',
        captchaDetected: true
      };
    }

    // 检查是否是 404 或不可用页面
    if (pageTitle.includes('page not found') ||
        pageTitle.includes('404') ||
        pageText.includes('we couldn\'t find that page') ||
        pageText.includes('this item is not available')) {
      return {
        success: false,
        error: '产品页面不存在或已下架，请检查链接是否正确'
      };
    }

    // 检查是否需要登录
    if (pageText.includes('sign in') && pageText.includes('to view this page')) {
      return {
        success: false,
        error: '该产品需要登录才能查看，请切换到手动输入模式'
      };
    }

    // 提取产品信息
    const product = {
      asin: asin,
      url: url,
      marketplace: marketplace,
      title: '',
      price: '',
      rating: '',
      reviews: '',
      ratingCount: 0,
      bulletPoints: [],
      description: '',
      brand: '',
      seller: '',
      availability: '',
      images: [],
      category: '',
      rank: '',
      features: []
    };

    // 提取标题
    product.title = $('#productTitle').text().trim() ||
                   $('#title').text().trim() ||
                   $('h1.product-title-word-break').text().trim() ||
                   '';

    // 如果标题为空，尝试其他选择器
    if (!product.title) {
      product.title = $('[data-feature-name="title"]').text().trim() ||
                     $('span#productTitle').text().trim() || '';
    }

    // 提取价格
    const priceWhole = $('#priceblock_ourprice, #priceblock_dealprice, #priceblock_saleprice, .a-price .a-offscreen, #corePrice_feature_div .a-offscreen, #corePriceDisplay_desktop_feature_div .a-offscreen').first().text().trim() ||
                      $('.apexPriceToPay .a-offscreen').first().text().trim() || '';
    product.price = priceWhole.replace(/\\s+/g, ' ');

    // 如果价格还是空的，尝试其他方式
    if (!product.price) {
      const priceMatch = html.match(/\\$([\\d,]+\\.?\\d*)/);
      if (priceMatch) product.price = '$' + priceMatch[1];
    }

    // 提取评分
    product.rating = $('#acrPopover').attr('title') ||
                    $('i.a-icon-star .a-icon-alt').first().text().trim() ||
                    '';

    // 提取评论数
    const reviewsText = $('#acrCustomerReviewText').text().trim() ||
                       $('[data-hook="total-review-count"]').text().trim() || '';
    product.reviews = reviewsText;
    const reviewCountMatch = reviewsText.match(/([\\d,]+)/);
    if (reviewCountMatch) {
      product.ratingCount = parseInt(reviewCountMatch[1].replace(/,/g, ''));
    }

    // 提取五点描述
    $('#feature-bullets li, #feature-bullets ul li, .a-unordered-list .a-list-item').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !text.includes('›') && text.length > 5) {
        product.bulletPoints.push(text.replace(/\\s+/g, ' '));
      }
    });

    // 如果五点描述为空，尝试其他方式
    if (product.bulletPoints.length === 0) {
      $('div[data-feature-name="featurebullets"] li span, #feature-bullets-inner li span').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 5) {
          product.bulletPoints.push(text);
        }
      });
    }

    // 提取产品描述
    product.description = $('#productDescription p, #productDescription').text().trim() ||
                         $('[data-feature-name="description"]').text().trim() ||
                         $('div#productDescription p').text().trim() || '';

    // 如果描述还是空的，尝试从 iframe 中获取
    if (!product.description) {
      const descIframe = $('#rich_product_description iframe').attr('src') ||
                        $('div#productDescription iframe').attr('src');
      if (descIframe) {
        try {
          const descResponse = await axios.get(descIframe.startsWith('http') ? descIframe : new URL(descIframe, url).href, { headers, timeout: 10000 });
          product.description = cheerio.load(descResponse.data)('body').text().trim();
        } catch (e) {
          console.warn('[AmazonScraper] 无法获取产品描述 iframe:', e.message);
        }
      }
      // 尝试从 JS 中提取描述
      if (!product.description) {
        const descMatch = html.match(/\"productDescription\\":\\"([^"]{20,})/i);
        if (descMatch) product.description = descMatch[1].replace(/\\n/g, ' ').replace(/\\u([\d\w]{4})/gi, (m, p) => String.fromCharCode(parseInt(p, 16)));
      }
    }

    // 提取品牌
    product.brand = $('#bylineInfo, #brand').text().trim() ||
                   $('[data-feature-name="brand"]').text().trim() ||
                   $('a#brand').text().trim() || '';

    // 提取卖家信息
    product.seller = $('#sellerProfileTriggerId, #merchant-info a, #fulfillerInfoFeature_feature_div').text().trim() || '';

    // 提取分类
    const breadcrumbs = [];
    $('#wayfinding-breadcrumbs_feature_div a, #wayfinding-breadcrumbs ul li a, .a-spacing-mini a').each((i, el) => {
      const cat = $(el).text().trim();
      if (cat && !breadcrumbs.includes(cat)) breadcrumbs.push(cat);
    });
    product.category = breadcrumbs.join(' > ');

    // 提取排名
    const rankText = $('#SalesRank, #detailBulletsWrapper_feature_div, #detailBullets_feature_div').text().trim() || '';
    product.rank = rankText.match(/#[\\d,]+/)?.[0] || '';

    // 提取特性（从 A+ 内容或规格表）
    $('#productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr').each((i, el) => {
      const label = $(el).find('th, td:first-child').text().trim();
      const value = $(el).find('td:last-child, th:last-child').text().trim();
      if (label && value && label.length < 50) {
        product.features.push({ label, value });
      }
    });

    // 检查是否有有效数据
    if (!product.title && product.bulletPoints.length === 0) {
      console.warn('[AmazonScraper] 页面结构可能已变化，无法提取数据');
      return {
        success: false,
        error: '无法从页面提取产品信息，可能是页面结构变化或被反爬限制'
      };
    }

    console.log(`[AmazonScraper] 成功提取: ${product.title?.slice(0, 50) || '未知产品'}...`);
    return {
      success: true,
      product
    };

  } catch (error) {
    console.error('[AmazonScraper] 抓取失败:', error.message);

    // 判断错误类型
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        error: '网络连接失败，无法访问亚马逊。请检查网络或切换到手动输入模式'
      };
    }
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: '请求超时，亚马逊响应过慢。请重试或切换到手动输入模式'
      };
    }
    if (error.response?.status === 503) {
      return {
        success: false,
        error: '亚马逊服务暂时不可用（503），可能是反爬限制。请稍后再试或切换到手动输入模式'
      };
    }

    return {
      success: false,
      error: `抓取失败: ${error.message}`
    };
  }
}

/**
 * 格式化产品信息为 AI 分析用的文本
 */
function formatProductForAnalysis(product) {
  let text = '';

  text += `═══════════════════════════════════════════════════════════════\n`;
  text += `                    亚马逊产品信息\n`;
  text += `═══════════════════════════════════════════════════════════════\n\n`;

  if (product.asin) text += `📦 ASIN: ${product.asin}\n`;
  if (product.marketplace) text += `🌐 市场: ${product.marketplace}\n`;
  if (product.url) text += `🔗 链接: ${product.url}\n`;
  if (product.brand) text += `🏢 品牌: ${product.brand}\n`;
  if (product.category) text += `📂 分类: ${product.category}\n`;
  if (product.rank) text += `📊 排名: ${product.rank}\n`;
  text += '\n';

  text += `═══════════════════════════════════════════════════════════════\n`;
  text += `                    产品核心信息\n`;
  text += `═══════════════════════════════════════════════════════════════\n\n`;

  if (product.title) text += `📌 产品标题:\n${product.title}\n\n`;
  if (product.price) text += `💰 价格: ${product.price}\n`;
  if (product.rating) text += `⭐ 评分: ${product.rating}\n`;
  if (product.reviews) text += `💬 评论数: ${product.reviews}\n`;
  if (product.seller) text += `🏪 卖家: ${product.seller}\n`;
  if (product.availability) text += `✅ 库存: ${product.availability}\n`;
  text += '\n';

  if (product.bulletPoints.length > 0) {
    text += `═══════════════════════════════════════════════════════════════\n`;
    text += `                    五点描述 (Bullet Points)\n`;
    text += `═══════════════════════════════════════════════════════════════\n\n`;
    product.bulletPoints.forEach((point, i) => {
      text += `${i + 1}. ${point}\n`;
    });
    text += '\n';
  }

  if (product.description) {
    text += `═══════════════════════════════════════════════════════════════\n`;
    text += `                    产品描述\n`;
    text += `═══════════════════════════════════════════════════════════════\n\n`;
    text += `${product.description}\n\n`;
  }

  if (product.features.length > 0) {
    text += `═══════════════════════════════════════════════════════════════\n`;
    text += `                    产品规格\n`;
    text += `═══════════════════════════════════════════════════════════════\n\n`;
    product.features.forEach(f => {
      text += `• ${f.label}: ${f.value}\n`;
    });
    text += '\n';
  }

  return text;
}

module.exports = {
  extractAsin,
  detectMarketplace,
  buildAmazonUrl,
  scrapeAmazonProduct,
  formatProductForAnalysis
};
