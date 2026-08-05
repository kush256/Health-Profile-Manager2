# Building APK with GitHub Actions

This project is configured to automatically build an APK file using GitHub Actions. Every time you push to the `main` or `master` branch, GitHub will automatically compile and package your Health Profile Manager app as an Android APK.

## Quick Setup

### 1. Create GitHub Repository

```bash
cd /path/to/health-profile-manager
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/health-profile-manager.git
git push -u origin main
```

### 2. Enable GitHub Actions

- Go to your GitHub repository
- Click **Actions** tab
- Click **"I understand my workflows, go ahead and enable them"** (if prompted)

### 3. Push Changes to Trigger Build

Every push to `main` or `master` branch will automatically trigger the build:

```bash
git push origin main
```

## Accessing the Built APK

### Via GitHub Artifacts (easiest for testing)
1. Go to your GitHub repository
2. Click **Actions** tab
3. Click the latest workflow run
4. Scroll down to **Artifacts**
5. Download **health-profile-manager** (.zip file)
6. Unzip and install on your Android device:
   ```bash
   adb install app-debug.apk
   ```

### Via GitHub Releases
Once you create a **Git Tag** (release), the APK will be attached:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Then see it in your GitHub **Releases** page.

## Project Structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/healthprofilemanager/app/
│   │   │   └── MainActivity.java          # Loads web app in WebView
│   │   ├── res/
│   │   │   ├── layout/activity_main.xml   # App layout
│   │   │   ├── values/strings.xml         # App strings
│   │   │   ├── values/colors.xml          # Theme colors
│   │   │   └── mipmap-*/ic_launcher.png   # App icons
│   │   └── AndroidManifest.xml            # App manifest
│   ├── build.gradle                       # App build configuration
│   └── proguard-rules.pro                 # Code obfuscation rules
├── build.gradle                           # Root build file
├── settings.gradle                        # Gradle project settings
├── gradlew                                # Gradle wrapper script
└── gradle/
    └── wrapper/
        └── gradle-wrapper.properties      # Gradle version config

.github/
└── workflows/
    └── build-apk.yml                      # GitHub Actions workflow

# Root directory (web app)
├── index.html
├── styles.css
├── script.js
├── manifest.json
└── sw.js
```

## How It Works

1. **Push to GitHub** → Triggers GitHub Actions workflow
2. **GitHub runs Android build** using Java 17 + Android SDK
3. **Web assets copied** to Android app's `assets/` folder
4. **Gradle compiles** the APK
5. **APK uploaded** as artifact and/or release
6. **You download** and install on device

## Firebase Authentication Setup

Since your app uses Firebase, you need to register your app's signing certificate with Firebase:

1. Get your app's SHA-1 fingerprint:
   ```bash
   cd android
   ./gradlew signingReport
   ```

2. Go to **Firebase Console** → Project Settings → Your App
3. Add the SHA-1 fingerprint under **Android apps**
4. Add your GitHub Pages/Netlify URL to **Authorized domains** if hosting the web version

## Updating the App

To update the APK:
1. Make changes to your web files (`.html`, `.js`, `.css`)
2. Commit and push:
   ```bash
   git add .
   git commit -m "Update health features"
   git push origin main
   ```
3. GitHub Actions automatically rebuilds the APK
4. Download the new APK from Actions artifacts

## Troubleshooting

### APK build fails in GitHub Actions
- Check the **Actions** tab for error messages
- Ensure `AndroidManifest.xml` is properly formatted
- Verify Java/Gradle versions in `.github/workflows/build-apk.yml`

### App won't install on device
- Ensure device is Android 7+ (minSdk 24)
- Uninstall old version first: `adb uninstall com.healthprofilemanager.app`
- Try: `adb install -r app-debug.apk` (force replace)

### Firebase login not working in the app
- Add the signing certificate SHA-1 to Firebase console
- Ensure `AndroidManifest.xml` has `INTERNET` permission

## Local Build (Optional)

If you want to build locally without GitHub:

```bash
cd android
./gradlew assembleDebug
# APK will be at: app/build/outputs/apk/debug/app-debug.apk
```

Requires: Android SDK, Java 17, Gradle 8.2+

## Publishing to Play Store

For production release:
1. Generate a **signed APK** (requires keystore)
2. Upload to Google Play Console
3. Follow Play Store submission guidelines

_See Google's [App Signing guide](https://developer.android.com/studio/publish/app-signing)_

---

**Questions?** Check the workflow logs in the Actions tab for detailed build output.
