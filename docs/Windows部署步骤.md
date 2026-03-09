# THU_SOC_AGENT 在 Windows 上部署步骤（Git 方式）

按顺序执行以下步骤即可在本机运行「社会科学文献处理综合智能体」。

---

## 一、环境准备（只需做一次）

### 1. 安装 Node.js

- 打开 https://nodejs.org ，下载 **LTS 版本**（建议 18 或 20）。
- 安装时勾选「自动安装必要工具」（如提示）。
- 安装完成后，打开 **命令提示符** 或 **PowerShell**，输入：
  ```bash
  node -v
  ```
  若显示类似 `v18.x.x` 或 `v20.x.x` 即表示安装成功。

### 2. 安装 Git

- 若尚未安装：打开 https://git-scm.com/download/win 下载并安装。
- 安装时请选择 **「Git from the command line and also from 3rd-party software」**（或类似“将 Git 加入 PATH”的选项），这样在终端里才能直接使用 `git`。
- 安装完成后，**关闭并重新打开**命令提示符或 PowerShell（否则可能仍找不到 `git`），再输入：
  ```bash
  git --version
  ```
  若显示类似 `git version 2.x.x` 即表示安装成功。

- **若仍提示「无法将 git 项识别为 cmdlet…」**（已选“加入 PATH”也无效时）：
  1. **先试「命令提示符」**：不要用 PowerShell，打开 **cmd**（命令提示符），在里边输入 `git --version`。有时 cmd 能识别而 PowerShell 不能。
  2. **重启电脑**：Windows 有时要重启后，新加的 PATH 才对所有程序生效。重启后再开 PowerShell 试一次。
  3. **手动把 Git 加入 PATH**：
     - 按 `Win + R`，输入 `sysdm.cpl` 回车 →「高级」→「环境变量」；
     - 在「系统变量」里选中 `Path` →「编辑」→「新建」，添加：`C:\Program Files\Git\cmd`（若安装到其他盘，改为实际路径，例如 `D:\Program Files\Git\cmd`）；
     - 逐一点「确定」保存，**关闭所有已打开的终端窗口**，再新开 PowerShell 输入 `git --version`。
  4. 若仍不行，可先**用完整路径临时测试**：在 PowerShell 里执行  
     `& "C:\Program Files\Git\bin\git.exe" --version`  
     若有版本号说明 Git 已装好，只是 PATH 未生效，按上一步手动加 PATH 即可。

### 3. 选择存放仓库的目录

- 任选一个你方便的位置即可，例如：
  - **桌面**：路径一般为 `C:\Users\你的用户名\Desktop`（在 PowerShell 里也可直接输入 `cd Desktop`，若当前已在用户目录下）。
  - 或**英文路径、无空格**的文件夹，例如：`C:\Projects`（没有可新建一个）。

---

## 二、获取代码（首次：克隆；之后：拉取）

### 方式 A：首次在这台电脑上部署（克隆）

1. 打开 **命令提示符** 或 **PowerShell**。
2. 进入你打算放项目的目录，例如放桌面：
   ```bash
   cd C:\Users\你的用户名\Desktop
   ```
   或放其他文件夹，例如：`cd C:\Projects`。
3. 执行克隆（本项目仓库地址）：
   ```bash
   git clone https://github.com/FunologistS/THU_SOC_AGENT.git
   ```
   若使用 SSH：
   ```bash
   git clone git@github.com:FunologistS/THU_SOC_AGENT.git
   ```
   若你 fork 到自己的 GitHub，把上面的 `FunologistS` 换成你的用户名即可。
4. 克隆完成后，进入项目目录：
   ```bash
   cd THU_SOC_AGENT
   ```

### 方式 B：这台电脑上已有仓库，只是更新代码（拉取）

1. 打开 **命令提示符** 或 **PowerShell**。
2. 进入项目目录，例如：
   ```bash
   cd C:\Projects\THU_SOC_AGENT
   ```
3. 执行拉取：
   ```bash
   git pull
   ```

---

## 三、安装依赖（两个地方都要装）

依赖需要安装**两次**：一次在项目根目录，一次在 UI 目录。

> **若 PowerShell 报错「在此系统上禁止运行脚本」**：请改用 **命令提示符（cmd）** 执行下面的 `npm install`，或按本节末尾的「禁止运行脚本」排查步骤修改执行策略。

### 1. 在项目根目录安装

确保当前在项目根目录（能看到 `package.json` 和 `.claude` 文件夹），执行：

```bash
npm install
```

等待执行完成，无报错即可。

### 2. 在 UI 目录安装

接着执行：

```bash
cd ui\app
npm install
```

等待执行完成，无报错即可。

- **若 PowerShell 提示「无法加载文件 npm.ps1，因为在此系统上禁止运行脚本」**，任选其一即可：
  1. **改用命令提示符（推荐）**：关闭 PowerShell，打开 **cmd**，进入项目目录后执行同样的命令，例如：
     ```bash
     cd C:\Users\LMX\Desktop\THU_SOC_AGENT
     npm install
     cd ui\app
     npm install
     ```
  2. **放宽 PowerShell 执行策略**：在 PowerShell 里执行（只需一次）：
     ```powershell
     Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
     ```
     出现提示输入 `Y` 确认。完成后即可在 PowerShell 中正常使用 `npm`。

---

## 四、配置环境变量（API Key 等）

1. 当前应在 `ui\app` 目录下。
2. 将示例配置复制为本地配置：
   - **命令提示符** 下执行：
     ```bash
     copy .env.example .env.local
     ```
   - **PowerShell** 下可执行：
     ```powershell
     Copy-Item .env.example .env.local
     ```
3. 用记事本或 VS Code 打开 `.env.local`，按需填写（至少填下面两项即可使用主要功能）：
   - **OPENAI_API_KEY**：你的 OpenAI API 密钥（荟萃分析、一键综述等会用到）。
   - **OPENALEX_API_KEY**：OpenAlex 密钥（批量检索期刊时建议填写，否则容易触发限流）。
   - 其他如 ZHIPU_API_KEY、FIRECRAWL_API_KEY 等可按需填写，不填也可先启动。
4. 保存并关闭文件。

---

## 五、启动应用

1. 确认当前在 **ui\app** 目录下。
2. 执行自检（可选，用于检查 Node 版本和依赖是否装好）：
   ```bash
   npm run doctor
   ```
   若提示「自检通过」或仅提示「端口检查已跳过」（Windows 无 lsof 属正常），即可继续。
3. 启动开发服务器：
   ```bash
   npm run dev
   ```
4. 等待终端出现类似 **Ready** 或 **localhost:9301** 的提示。
5. 在浏览器中打开：**http://localhost:9301**  
   即可使用智能体。

---

## 六、之后每次更新代码后的操作

1. 打开命令提示符或 PowerShell，进入项目根目录，例如：
   ```bash
   cd C:\Projects\THU_SOC_AGENT
   ```
2. 执行：
   ```bash
   git pull
   ```
3. 若依赖有变更，再执行两次安装（先根目录，再 UI）：
   ```bash
   npm install
   cd ui\app
   npm install
   ```
4. 若未改过 `.env.local`，无需重新配置；然后按「五」中步骤在 `ui\app` 下执行 `npm run dev` 启动即可。

---

## 常见问题

- **端口 9301 已被占用**  
  可改用其他端口启动，例如在 PowerShell 中：
  ```powershell
  $env:PORT=9305; npm run dev
  ```
  然后在浏览器访问 **http://localhost:9305**。

- **第一次使用、没有「主题」可选**  
  不需要事先新建 `outputs` 文件夹。在界面里先「创建主题」或做一次「批量检索」，系统会自动创建 `outputs` 及对应主题目录。

- **启动命令不知道填什么路径**  
  可双击打开项目根目录下的 **start.html**（用浏览器打开），页面会根据当前路径显示适合本机的启动命令，复制到终端执行即可。

- **运行智能体时很慢，是文章太多吗？**  
  是的，**要处理的文章/文献数量**是主要因素之一；**不同电脑的配置**也会影响速度：
  - **本机配置**：CPU、内存、硬盘读写会影响本地计算（如清洗、摘要、聚类）；同一任务在低配电脑上会明显更慢。
  - **网络**：批量检索和荟萃/综述都要访问外网 API（OpenAlex、OpenAI、智谱等），网络慢或不稳定会拖长等待时间；不同网络环境（家庭宽带、校园网、VPN）速度差异很大。
  - **批量检索**：要请求多本期刊 × OpenAlex 接口，文章多、期刊多就会更久；若开启了「摘要补全」，还会对缺摘要的篇目逐篇抓取网页或调 Firecrawl，耗时明显增加。
  - **清洗规整 / 摘要**：篇数越多，本地处理时间越长（摘要阶段主要是本地规则提取，不做大模型调用）。
  - **荟萃分析 / 概念合成 / 一键综述**：会调用大模型 API，按主题或聚类分批请求，文献越多、聚类越多，请求次数越多，耗时会成倍增加；网络延迟和 API 限速也会影响速度。
  **建议**：先缩小范围试跑（如少选几本期刊、缩短年份、或先对少量文献做综述），确认流程正常后再扩大规模；检索时如非必要可先不勾选「摘要补全」。同一任务在不同电脑上耗时不同属正常现象。

- **文献简报里某个 cluster（如 32 篇）返回为空，其他 5 篇、7 篇的没问题**  
  多半是该聚类一次送入的篇数太多，**超过大模型上下文/输入长度限制**，接口返回空。解决：运行文献简报时，在弹窗里把「每聚类最多使用篇数」调小（例如 **12** 或 **15**），系统会将该聚类自动拆成多批调用再合并。默认已改为 12；若仍有个别聚类为空，可再试 10。

- **一键综述报「merge_max_chars = 12000」且 exit code = 1**  
  表示合并阶段（把各块综述拼成一篇）时请求过大或超时，脚本已用 12000 重试仍失败。解决：重新跑「一键综述」时，在确认页把 **「合并阶段字符上限」** 改为 **8000**（或先试 12000），再点「确认并运行」。若仍失败，可检查网络与 API 密钥，或稍后重试。

- **一键综述「生成内容失败，返回内容为空」是为什么？**  
  表示请求发到了接口且 HTTP 成功，但**响应里没有可用的正文**（`content` 为空）。常见原因：**① 504/520 超时**：网关在等模型输出时超时，有时会返回 200 但 body 为空或不完整；**② 内容过滤**：接口或模型做了安全拦截（`finish_reason=content_filter`），拒绝输出；**③ 限流/服务异常**：429、503 等情况下接口有时返回空；**④ 网络/代理**：连接中断或代理返回异常，解析后 content 为空。  
  建议：先试「合并阶段字符上限」改为 8000 后重跑；若日志中有 `finish_reason: content_filter` 可换用其他模型或接口；检查网络与 OPENAI_BASE_URL / 代理是否稳定。

---

*文档随仓库更新；若与界面或脚本不一致，以当前仓库为准。*
