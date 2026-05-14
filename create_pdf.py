# -*- coding: utf-8 -*-
"""将 Markdown 教程转换为 PDF"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import re

# 读取 Markdown 文件
with open('WorkBuddy-GitHub上传完整教程.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 创建 PDF
doc = SimpleDocTemplate(
    'WorkBuddy-GitHub上传完整教程.pdf',
    pagesize=A4,
    rightMargin=2*cm,
    leftMargin=2*cm,
    topMargin=2*cm,
    bottomMargin=2*cm
)

# 定义样式
styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    'CustomTitle',
    parent=styles['Title'],
    fontSize=24,
    spaceAfter=30,
    alignment=TA_CENTER,
    textColor=colors.HexColor('#1a73e8')
)

heading1_style = ParagraphStyle(
    'CustomHeading1',
    parent=styles['Heading1'],
    fontSize=18,
    spaceBefore=20,
    spaceAfter=12,
    textColor=colors.HexColor('#333333'),
)

heading2_style = ParagraphStyle(
    'CustomHeading2',
    parent=styles['Heading2'],
    fontSize=14,
    spaceBefore=15,
    spaceAfter=8,
    textColor=colors.HexColor('#555555')
)

heading3_style = ParagraphStyle(
    'CustomHeading3',
    parent=styles['Heading3'],
    fontSize=12,
    spaceBefore=10,
    spaceAfter=6,
    textColor=colors.HexColor('#666666')
)

body_style = ParagraphStyle(
    'CustomBody',
    parent=styles['Normal'],
    fontSize=10,
    spaceAfter=6,
    leading=14,
    textColor=colors.HexColor('#333333')
)

code_style = ParagraphStyle(
    'Code',
    parent=styles['Code'],
    fontSize=9,
    fontName='Courier',
    spaceBefore=4,
    spaceAfter=4,
    leftIndent=15,
    backColor=colors.HexColor('#f5f5f5'),
    borderPadding=8,
    leading=12
)

note_style = ParagraphStyle(
    'Note',
    parent=styles['Normal'],
    fontSize=10,
    spaceAfter=6,
    leading=14,
    textColor=colors.HexColor('#d93025'),
    leftIndent=20
)

# 解析 Markdown 并生成 PDF 内容
story = []

# 标题
story.append(Paragraph("WorkBuddy GitHub 上传完整教程", title_style))
story.append(Spacer(1, 20))

# 处理每一行
lines = content.split('\n')
i = 0
while i < len(lines):
    line = lines[i]

    # 跳过标题行（已在上面添加）
    if line.startswith('# WorkBuddy GitHub'):
        i += 1
        continue

    # 一级标题
    if line.startswith('## '):
        text = line[4:]
        story.append(Paragraph(text, heading1_style))

    # 二级标题
    elif line.startswith('### '):
        text = line[5:]
        story.append(Paragraph(text, heading2_style))

    # 三级标题
    elif line.startswith('#### '):
        text = line[6:]
        story.append(Paragraph(text, heading3_style))

    # 代码块
    elif line.startswith('```'):
        code_lines = []
        i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            code_lines.append(lines[i])
            i += 1
        code_text = '<br/>'.join(code_lines)
        story.append(Paragraph(code_text, code_style))

    # 表格
    elif line.startswith('|'):
        # 收集表格行
        table_data = []
        while i < len(lines) and lines[i].startswith('|'):
            # 跳过分隔行（|---|---|）
            if '---' in lines[i]:
                i += 1
                continue
            # 解析表格单元格
            cells = [c.strip() for c in lines[i].split('|')[1:-1]]
            table_data.append(cells)
            i += 1

        if table_data:
            # 创建表格
            table = Table(table_data)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1a73e8')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
                ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f9f9f9')),
            ]))
            story.append(table)
            story.append(Spacer(1, 15))

    # 重要提醒
    elif '⚠️' in line or '❌' in line:
        # 提取关键信息
        text = line.replace('⚠️', '').replace('❌', '').strip()
        story.append(Paragraph(text, note_style))

    # 列表项
    elif line.startswith('- '):
        text = line[2:]
        # 处理加粗
        text = text.replace('**', '')
        story.append(Paragraph(f"• {text}", body_style))

    elif line.startswith('1. ') or line.startswith('2. ') or line.startswith('3. '):
        text = line[3:]
        text = text.replace('**', '')
        story.append(Paragraph(text, body_style))

    # 分隔线
    elif line.startswith('---'):
        story.append(Spacer(1, 10))

    # 空行
    elif line.strip() == '':
        pass

    # 普通文本
    else:
        text = line
        # 处理加粗
        text = text.replace('**', '')
        story.append(Paragraph(text, body_style))

    i += 1

# 生成 PDF
doc.build(story)
print("PDF 生成成功: WorkBuddy-GitHub上传完整教程.pdf")
