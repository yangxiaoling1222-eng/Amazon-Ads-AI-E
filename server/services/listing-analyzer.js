/**
 * Listing 分析报告生成服务
 *
 * 使用 Amazon Search Optimization 专业知识生成专业的 Listing 分析报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─────────────────────────────────────────────────────────
// 角色设定：你是一位亚马逊高级运营经理
// ─────────────────────────────────────────────────────────
const LISTING_ANALYST_PROMPT = `你是一位拥有10年经验的亚马逊高级运营经理，专注于Listing优化和竞品分析。

## 你的专长
- 深度理解 Amazon A9/COSMO 搜索算法
- Listing 各要素优化（标题、五点描述、描述、Search Terms、Backend Keywords）
- 竞品分析和差异化策略
- 关键词研究与布局
- 图片优化建议
- 定价策略分析
- Review 和 Q&A 管理策略

## 分析维度
请从以下维度全面分析 Listing：

### 1. 标题分析 (Title)
- 关键词布局是否合理
- 品牌名、产品名、核心卖点、规格是否完整
- 字符数是否optimal（200字符以内）
- 是否包含核心长尾关键词

### 2. 五点描述分析 (Bullet Points)
- 每个卖点是否清晰、有说服力
- 是否涵盖用户关心的痛点和需求
- 关键词是否自然融入
- 格式是否易读（大小写、符号使用）

### 3. 产品描述分析 (Description)
- 品牌故事是否有力
- 产品细节是否完整
- 是否引导用户采取行动

### 4. 图片分析
- 主图是否专业、符合亚马逊要求
- 副图是否有效展示产品特点和使用场景
- Infographic 是否清晰传达卖点

### 5. 关键词分析
- Search Terms 是否充分利用
- Backend Keywords 是否合理布局
- 是否有遗漏的重要关键词

### 6. 竞品对比
- 与同类竞品相比的优势和劣势
- 价格竞争力分析
- Review 数量和质量对比

### 7. 优化建议
- 优先级排序的改进建议
- 具体可执行的优化方案
- 预期效果

## 输出格式
请生成一份结构化的分析报告，使用以下格式：

# Listing 分析报告

## 📊 基本信息
- ASIN：[用户提供的ASIN]
- 产品：[产品名称/品类]
- 分析时间：[当前时间]

## 📋 分析摘要
[2-3句话概括整体情况]

## 🔍 详细分析

### 1. 标题分析
**当前状态：** [评分 1-10]
**主要问题：**
- [问题1]
- [问题2]

**优化建议：**
[具体建议]

### 2. 五点描述分析
[同上格式]

### [其他维度...]

## 🏆 综合评分
| 维度 | 评分 | 权重 |
|------|------|------|
| 标题 | X/10 | 20% |
| 五点描述 | X/10 | 20% |
| 产品描述 | X/10 | 15% |
| 图片 | X/10 | 20% |
| 关键词 | X/10 | 15% |
| 价格/评价 | X/10 | 10% |
| **总分** | **X/10** | 100% |

## ✅ 优先改进项（Top 3）
1. **[最重要]** [具体建议]
2. **[次重要]** [具体建议]
3. **[第三重要]** [具体建议]

## 📝 可执行的优化文案

### 新标题建议
\`\`\`
[优化后的标题]
\`\`\`

### 新五点描述建议
1. [第一条]
2. [第二条]
...

### 新产品描述建议
\`\`\`
[优化后的描述]
\`\`\`

## 📈 预期效果
[如果按建议优化，预期会有什么效果]

---
💡 提示：点击"导出Word文档"可保存此分析报告供日后参考。`;

/**
 * 分析 Listing 并生成报告
 * @param {string} listingInfo - 用户提供的 Listing 信息（可以是 ASIN 或具体内容）
 * @param {string} mode - 分析模式：'quick' | 'detailed' | 'competitor'
 * @returns {Object} 分析结果
 */
async function analyzeListing(listingInfo, mode = 'detailed') {
  // 注意：实际的 AI 分析在 agent.js 的 /agent/analyze-listing 路由中调用
  // 这里只是提供配置和模板
  return {
    prompt: LISTING_ANALYST_PROMPT,
    mode,
    supportedModes: ['quick', 'detailed', 'competitor']
  };
}

/**
 * 生成 Word 文档
 */
async function generateWordReport(analysisContent, title, metadata = {}) {
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 50);
  const docxPath = path.join(tempDir, `listing_report_${sanitizedTitle}_${timestamp}.docx`);
  const mdPath = path.join(tempDir, `listing_report_${sanitizedTitle}_${timestamp}.md`);

  // 保存 Markdown 原文
  fs.writeFileSync(mdPath, analysisContent, 'utf8');

  // 使用 pandoc 转换为 docx
  try {
    const pandocCmd = `pandoc "${mdPath}" -o "${docxPath}" --reference-doc=`;
    execSync(pandocCmd, { encoding: 'utf8', stdio: 'pipe' });

    return {
      success: true,
      docxPath,
      mdPath,
      filename: path.basename(docxPath)
    };
  } catch (e) {
    // pandoc 可能不存在，尝试 Node.js docx 库
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
      const fs2 = require('fs');

      // 简单转换 Markdown 为 Docx
      const sections = analysisContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          if (line.startsWith('# ')) {
            return new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: line.slice(2), bold: true, size: 32 })]
            });
          } else if (line.startsWith('## ')) {
            return new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [new TextRun({ text: line.slice(3), bold: true, size: 28 })]
            });
          } else if (line.startsWith('### ')) {
            return new Paragraph({
              heading: HeadingLevel.HEADING_3,
              children: [new TextRun({ text: line.slice(4), bold: true, size: 24 })]
            });
          } else {
            return new Paragraph({
              children: [new TextRun({ text: line, size: 22 })]
            });
          }
        });

      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
            }
          },
          children: sections
        }]
      });

      const buffer = await Packer.toBuffer(doc);
      fs2.writeFileSync(docxPath, buffer);

      return {
        success: true,
        docxPath,
        mdPath,
        filename: path.basename(docxPath)
      };
    } catch (e2) {
      console.error('[ListingAnalyzer] Word生成失败:', e2);
      return {
        success: false,
        error: 'Word文档生成失败，请确保安装了 pandoc 或 docx npm 包',
        mdPath
      };
    }
  }
}

/**
 * 清理临时文件
 */
function cleanupTempFiles(paths) {
  paths.forEach(p => {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) {
      console.warn('[ListingAnalyzer] 清理文件失败:', p);
    }
  });
}

module.exports = {
  LISTING_ANALYST_PROMPT,
  analyzeListing,
  generateWordReport,
  cleanupTempFiles
};
