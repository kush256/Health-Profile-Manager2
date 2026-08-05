# Health Profile Manager — Android APK Build with GitHub Actions

A modern, responsive health assessment web app that builds automatically to Android APK via GitHub.

![Health Profile Manager](icon-512.png)

## Features

✨ **Responsive Design** — Works on mobile, tablet, and desktop  
📊 **Interactive BMI Dial** — Visual health assessment with animated gauge  
💾 **Cloud Storage** — Firebase Firestore for secure profile history  
🔐 **User Authentication** — Secure login/signup with Firebase Auth  
📱 **PWA Ready** — Installable web app with offline support  
🤖 **Automated APK Build** — GitHub Actions builds APK on every push  

## Quick Start: Build APK with GitHub

### Step 1: Create GitHub Repository

```bash
git clone <this-repo> health-profile-manager
cd health-profile-manager
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/health-profile-manager.git
git push -u origin main
```

### Step 2: GitHub Actions Builds Automatically

- The `.github/workflows/build-apk.yml` triggers on every push to `main` branch
- GitHub compiles the APK using Java 17 + Android SDK
- Takes ~3-5 minutes per build

### Step 3: Download & Install APK

**Option A: From Artifacts (Testing)**
1. Go to GitHub repository → **Actions** tab
2. Click latest workflow run
3. Download **health-profile-manager** artifact
4. Install on device: `adb install app-debug.apk`

**Option B: From Releases (Production)**
1. Create a git tag: `git tag v1.0.0 && git push origin v1.0.0`
2. APK auto-uploads to **Releases** page
3. Download from release page

## Project Structure

```
health-profile-manager/
├── index.html                 # Main app (login/signup/chart)
├── history.html               # History page
├── login.html & signup.html   # Auth pages
├── styles.css                 # Unified design system
├── script.js                  # App logic + gauge
├── history.js                 # History management
├── auth.js                    # Firebase authentication
├── firebase.js                # Firebase config
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker (offline)
├── icon-*.png                 # App icons
│
├── android/                   # Native Android wrapper
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/healthprofilemanager/app/
│   │   │   │   └── MainActivity.java       # WebView loader
│   │   │   ├── res/                        # Resources
│   │   │   │   ├── layout/activity_main.xml
│   │   │   │   ├── values/strings.xml
│   │   │   │   ├── mipmap-*/ic_launcher.png
│   │   │   └── AndroidManifest.xml
│   │   ├── build.gradle
│   │   └── proguard-rules.pro
│   ├── build.gradle
│   ├── settings.gradle
│   ├── gradlew                # Gradle wrapper script
│   └── gradle/wrapper/
│
├── .github/
│   └── workflows/
│       └── build-apk.yml      # ← GitHub Actions workflow
│
├── package.json
├── capacitor.config.json
├── GITHUB_APK_BUILD.md        # Detailed build guide
└── README.md                  # This file
```

## How It Works

### GitHub Actions Workflow

```
Your Code Push → GitHub Actions Triggers
    ↓
Setup Java 17 + Android SDK (auto-installed)
    ↓
Copy web files to Android assets/
    ↓
Gradle compiles APK
    ↓
Upload to artifacts/releases
    ↓
You download & install on phone
```

**File:** `.github/workflows/build-apk.yml`  
**Runs on:** Every `git push origin main`  
**Time:** ~3-5 minutes  
**No local setup needed!**

## Configuration

### Firebase Setup (Required for Full Features)

Your Firebase config is in `firebase.js`. Already set up with:
- **Project:** health-profile-manager
- **Auth:** Email/Password
- **Firestore:** User profiles + history

To use your own Firebase project:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Copy your config and update `firebase.js`
4. **Important:** Add your APK's signing certificate SHA-1 to Firebase:
   ```bash
   cd android
   ./gradlew signingReport
   # Copy SHA-1 → Firebase Console → Your App → Add fingerprint
   ```

### Android App Settings

Edit `android/app/src/main/AndroidManifest.xml`:
```xml
<application
    android:icon="@drawable/ic_launcher"
    android:label="@string/app_name"
    ...>
```

Edit version in `android/app/build.gradle`:
```gradle
versionCode 1        # Increment for each release
versionName "1.0"    # User-facing version
```

## Development Workflow

### Local Web Development
```bash
# Edit files (HTML/CSS/JS)
# Test in browser at http://localhost:8000
python3 -m http.server 8000
```

### Push to GitHub (triggers APK build)
```bash
git add .
git commit -m "Add BMI history export feature"
git push origin main
# → Automatically builds APK in ~3-5 minutes
```

### Download & Test
```bash
# From GitHub Actions artifacts
adb install app-debug.apk
```

## Troubleshooting

### Build fails in GitHub Actions
1. Check **Actions** tab for error log
2. Common issues:
   - Java version mismatch
   - Gradle cache issues (usually auto-resolved)
   - Missing Android SDK components (auto-installed)

### APK won't install
```bash
# Uninstall old version first
adb uninstall com.healthprofilemanager.app
# Force reinstall
adb install -r app-debug.apk
```

### Firebase login not working in APK
- Add signing certificate SHA-1 to Firebase console
- Ensure `INTERNET` permission in `AndroidManifest.xml`
- Check Firebase **Authorized domains** includes where you're hosting

### Build artifacts not showing
1. Go to GitHub repo → **Actions** tab
2. Check if workflow **Status** is green (passed) or red (failed)
3. Click workflow run to see logs
4. Scroll to **Artifacts** section

## Advanced: Local APK Build

To build locally (requires Android SDK installed):

```bash
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

## Production Release

For Google Play Store:

1. **Create release branch:**
   ```bash
   git checkout -b release/v1.0.0
   ```

2. **Generate signed release APK:**
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

3. **Upload to Play Store Console**
   - Create app listing
   - Upload signed APK
   - Follow Play Store guidelines

## File Descriptions

| File | Purpose |
|------|---------|
| `index.html` | Main health chart interface |
| `history.html` | View/search saved profiles |
| `login.html` | User login screen |
| `signup.html` | Account creation screen |
| `styles.css` | Unified Vitals Chart design system (mobile-responsive) |
| `script.js` | BMI calculation, gauge animation, form logic |
| `history.js` | Firestore querying, search, delete records |
| `auth.js` | Firebase authentication flows |
| `firebase.js` | Firebase SDK initialization |
| `sw.js` | Service Worker for offline caching |
| `manifest.json` | PWA metadata for app installation |
| `.github/workflows/build-apk.yml` | GitHub Actions automation |

## Architecture

**Frontend:** HTML5 + CSS3 (mobile-first responsive)  
**Logic:** Vanilla JavaScript (no build step)  
**Backend:** Firebase (Auth + Firestore)  
**Mobile:** WebView wrapper + Android native permissions  
**CI/CD:** GitHub Actions (automated APK builds)  

## Browser/Device Support

- **Android:** 7.0+ (API 24+)
- **iOS:** Web app only (via PWABuilder for native app)
- **Desktop:** Chrome, Firefox, Safari

## License

MIT — feel free to use, modify, and distribute.

---

**Need help?**
1. Check `.github/workflows/build-apk.yml` for build config
2. Read `GITHUB_APK_BUILD.md` for detailed instructions
3. Check GitHub **Actions** logs for build errors
4. Verify `firebase.js` is configured correctly

**Questions on setup?** Open an issue on GitHub or check the workflow logs first!

**Ready to build?** → Push to main and watch GitHub Actions build your APK! 🚀
