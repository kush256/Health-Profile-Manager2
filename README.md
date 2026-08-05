# Health Profile Manager

A simple health tracking app that builds to Android automatically using GitHub.

## ✨ Features

📊 **Track Your Health** — Log your weight, height, and age  
📈 **See Your BMI** — Visual chart shows your health status  
💾 **Save Your Data** — Cloud storage keeps your history safe  
🔐 **Secure Login** — Only you can see your health info  
📱 **Works on Phone** — Native Android app  
🤖 **Auto Updates** — GitHub builds new versions automatically  

## 🚀 Quick Start (30 Minutes)

### Step 1: Extract Files
```
1. Download: health-profile-manager.zip
2. Right-click → Extract All (Windows) or Double-click (Mac)
3. You now have a folder with all your app files
```

### Step 2: Create GitHub Repository
```
1. Go to: https://github.com/new
2. Enter name: health-profile-manager
3. Make sure "Public" is selected ✓
4. Click "Create repository"
```

### Step 3: Upload Files to GitHub
```
1. On GitHub repo page, click "Add file" dropdown
2. Click "Upload files"
3. Drag the extracted folder into the upload area
   (or click to select files)
4. Scroll down
5. Click "Commit changes"
```

**That's it! GitHub now has your code!**

### Step 4: GitHub Builds Your APK (Automatic!)
```
1. Click "Actions" tab (top menu)
2. You'll see "Build APK" workflow
3. Status: 🟡 Yellow = Building (wait 3-5 minutes)
4. Status: 🟢 Green = Done! ✓
```

### Step 5: Download APK
```
1. In Actions, click the workflow (with green checkmark)
2. Scroll down to "Artifacts" section
3. Click "health-profile-manager" to download
4. Unzip the file
5. You now have: app-debug.apk
```

### Step 6: Install on Your Phone
```
Connect phone with USB cable, then run:

adb install app-debug.apk

Your app is now on your phone! 🎉
```

## 📋 What's Inside

| File | What It Does |
|------|---|
| `index.html` | Main app screen |
| `history.html` | View past health entries |
| `login.html` | Login screen |
| `signup.html` | Create account screen |
| `styles.css` | App design and colors |
| `script.js` | Health calculations |
| `firebase.js` | Cloud storage setup |
| `android/` | Makes it work on phones |
| `.github/workflows/build-apk.yml` | Auto-builds the APK |

## 🔄 Update Your App

Want to make changes?

```bash
1. Edit any file (HTML/CSS/JavaScript)
2. Save the file
3. Upload to GitHub (same as Step 3)
4. GitHub rebuilds automatically
5. Download the new APK from Actions
6. Install: adb install -r app-debug.apk
```

## 🔧 How It Works

```
You Upload Code
      ↓
GitHub Detects Changes
      ↓
GitHub Actions Builds APK (automatic)
      ↓
You Download APK
      ↓
Install on Your Phone
      ↓
App Ready to Use!
```

**No Android Studio needed. GitHub does everything!**

## ❓ Common Questions

**Q: Do I need Android Studio?**  
A: No! GitHub builds it for you.

**Q: How long does building take?**  
A: About 3-5 minutes.

**Q: Can I make changes?**  
A: Yes! Edit files and push to GitHub. It rebuilds automatically.

**Q: Will it work on my phone?**  
A: Yes, if it's Android 7.0 or newer.

## 🚨 Troubleshooting

### APK won't install
```bash
adb uninstall com.healthprofilemanager.app
adb install -r app-debug.apk
```

### Build failed (red X in Actions)
- Click the workflow to see error logs
- Usually fixes itself if you push again
- Run: `git push origin main`

### Can't find Artifacts
- Make sure the workflow has a ✓ green checkmark
- Red X means it failed. Check the logs.

### Login not working
- Go to Firebase Console
- Make sure your app is set up correctly

## 📞 Need Help?

1. Check GitHub Actions logs for build errors
2. Read `STEP_BY_STEP_GUIDE.md` for detailed help
3. Read `COPY_PASTE_COMMANDS.md` for terminal commands

## 🛠️ Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Firebase (saves your data)
- **Mobile:** Android app wrapper
- **Automation:** GitHub Actions

## 📝 License

MIT — You can use, modify, and share this app freely!

---

## 🎉 You're All Set!

1. ✅ Extract the ZIP file
2. ✅ Create GitHub repo
3. ✅ Upload your files
4. ✅ GitHub builds your APK automatically
5. ✅ Download and install on your phone
6. ✅ Start tracking your health!

**That's all there is to it!** 🚀

---

**Happy tracking! 💚** 
