# GitHub 发布步骤

由于 GitHub 登录、密码和验证码必须由账号本人完成，下面是本项目上传到 GitHub 的最短步骤。

## 方式一：网页创建仓库后命令行推送

1. 打开 GitHub 新建仓库页面：

   <https://github.com/new>

2. 填写仓库信息：

   - Repository name: `electric-tab-ai`
   - Description: `A browser-based electric guitar TAB transcription demo`
   - Public
   - 不勾选 `Add a README file`
   - 不勾选 `.gitignore`
   - 不选择 License

3. 点击 `Create repository`。

4. 复制仓库 HTTPS 地址，格式类似：

   ```text
   https://github.com/你的用户名/electric-tab-ai.git
   ```

5. 回到本项目目录，在终端执行：

   ```bash
   git remote add origin https://github.com/你的用户名/electric-tab-ai.git
   git push -u origin main
   ```

6. 如果弹出 GitHub 登录窗口，按提示登录并授权。

## 方式二：网页直接上传

如果命令行推送失败，也可以在仓库页面手动上传文件：

1. 进入新建好的仓库页面。
2. 点击 `Add file` -> `Upload files`。
3. 上传以下文件：

   ```text
   index.html
   styles.css
   app.js
   README.md
   REPORT.md
   LICENSE
   .gitignore
   GITHUB_UPLOAD_GUIDE.md
   ```

4. 提交信息填写：

   ```text
   Initial electric guitar tab web app
   ```

5. 点击 `Commit changes`。

## 提交作业

上传成功后，复制仓库首页地址，例如：

```text
https://github.com/你的用户名/electric-tab-ai
```

把这个地址粘贴到课程作业提交页面即可。
