# 全国超声医学博士申请数据库 2027 · V2.2

本版面向2027级博士申请，采用“公开可核验”口径，不宣称存在教育部统一的全国超声博导总名录。

## 数据规模

- 导师/导师组：**144**
- 培养单位：**40**
- 覆盖省级地区：**20**
- 官方招生/导师监控入口：**47**
- 已收录招生动态：**27**

## 核验层级

1. 年度招生目录明确可招生；
2. 学校、医院或导师系统明确博士生导师，2027名额待确认；
3. 历史招生目录或培养记录出现，当前资格待核实；
4. 超声治疗、分子影像、纳米医学、AI或生物医学工程交叉导师。

收录并不等于2027年一定招生。正式申请前必须核对年度专业目录、培养单位要求并获得导师回复。

## 本地运行

### Mac
双击 `start_local.command`，或在终端进入本文件夹运行：

```bash
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`。

### Windows
双击 `start_local.bat`。

## 自动更新

将全部文件上传到 GitHub 仓库，开启 GitHub Pages，并允许 Actions 读写权限。`.github/workflows/update-admissions.yml` 会按计划检查官方入口。由于各校没有统一API，验证码、动态页面和反爬会造成漏报；网站会显示抓取状态，不能替代人工核验。

## 文件

- `index.html`：网站首页
- `style.css`：样式
- `script.js`：筛选、收藏、备注和导出功能
- `data/advisors.json` / `data/advisors.csv`：导师数据库
- `data/schools.json` / `data/schools.csv`：培养单位和政策数据库
- `data/sources.json`：自动监控入口
- `scripts/update_admissions.py`：招生动态检查器


## V2.2 学博口径纠错

本版修正了前版只按“超声医学科/超声医学专业”搜集造成的系统性漏收。后续完整收录必须同时检查：

1. 100207 影像医学与核医学（超声方向学博）；
2. 1002 临床医学一级学科下的超声方向学博；
3. 105124 超声医学专业博士（仅在学校博士目录实际设置时收录）；
4. 医学技术、生物医学工程、材料、人工智能等超声交叉博士；
5. 年度博士招生目录、考核名单、拟录取名单和导师官方主页。

已补入张华伟：山东第一医科大学附属省立医院超声医学科，100207影像医学与核医学学博，2025、2026年度考核名单有明确报考记录。

## GitHub 自动更新与发布（修正版）

本包中的 `.github/workflows/update-admissions.yml` 已合并“抓取、提交数据、部署 GitHub Pages”三个步骤。

1. 将仓库 `Settings → Pages → Source` 设置为 `GitHub Actions`；
2. 将 `Settings → Actions → General → Workflow permissions` 设置为 `Read and write permissions`；
3. 在 `Actions` 页面手动运行 `Update admissions and deploy Pages`；
4. 工作流每天北京时间约 09:15 自动执行。
