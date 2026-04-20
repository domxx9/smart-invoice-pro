# Building Android APK for SMA-91 QA

Pre-flight checks complete:

- ✓ All export/import unit tests pass (100/100)
- ✓ QA test plan created (`QA_ROUNDTRIP_PLAN.md`)
- ✓ Web build succeeds (`npm run build`)
- ✓ Capacitor sync completes (`npx cap sync android`)

## Build Environment Requirements

- Java Development Kit (JDK) 17 or higher
- Android SDK (API 34+ recommended)
- Gradle (included via `./gradlew`)
- Node 22 (per SMA-108)

## Build Steps

### 1. Prepare Environment (One-Time)

```bash
# Install Android SDK + emulator/device tooling
# https://developer.android.com/studio/install

# Set JAVA_HOME (example for Linux with OpenJDK)
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH

# Verify
java -version
```

### 2. Build Release APK

```bash
# From repo root
npm run build                  # Rebuild web assets if needed
npx cap sync android          # Sync to Android project
cd android
./gradlew assembleRelease     # Build signed release APK
```

Output:

```
android/app/build/outputs/apk/release/app-release.apk
```

### 3. Build Debug APK (For Testing)

```bash
cd android
./gradlew assembleDebug       # Faster, unsigned debug build
```

Output:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

## Deploy to Device

### Option A: Physical Device (Recommended)

```bash
# 1. Connect device via USB, enable Developer Mode
adb devices                   # Should list your device

# 2. Install APK
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 3. Launch app
adb shell am start -n com.example.smartinvoicepro/.MainActivity
```

### Option B: Android Emulator

```bash
# 1. Start emulator
emulator -avd Pixel_6_API_34

# 2. Wait for boot, then install
adb install android/app/build/outputs/apk/debug/app-debug.apk

# 3. Launch app via emulator UI or:
adb shell am start -n com.example.smartinvoicepro/.MainActivity
```

## QA Testing

Follow test scenarios in `QA_ROUNDTRIP_PLAN.md`:

- **A**: Export default (no secrets)
- **B**: Export with secrets opt-in
- **C**: Full round-trip (merge mode)
- **D**: Full round-trip (replace mode)
- **E**: Edge cases & validation
- **F**: CSV export
- **G**: Share & download flow

## Signing Release APK

For production/Play Store:

```bash
# Generate key (one-time)
keytool -genkey -v -keystore ~/my-release-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias my-key-alias

# Configure signing in android/app/build.gradle:
# signingConfigs { release { ... } }

# Build signed release APK
./gradlew assembleRelease
```

## Troubleshooting

| Error                     | Solution                               |
| ------------------------- | -------------------------------------- |
| `JAVA_HOME not set`       | Set `export JAVA_HOME=/path/to/jdk`    |
| `SDK not found`           | Install Android SDK via Android Studio |
| `Plugin version mismatch` | Run `npx cap sync android`             |
| `Permission denied`       | `chmod +x ./gradlew`                   |
| `Port 8080 in use`        | Change emulator port or kill process   |

## CI/CD Integration

To automate APK builds in GitHub Actions:

```yaml
- name: Build Android APK
  run: |
    npm run build
    npx cap sync android
    cd android && ./gradlew assembleRelease

- name: Upload APK
  uses: actions/upload-artifact@v3
  with:
    name: app-release.apk
    path: android/app/build/outputs/apk/release/
```

## References

- [Capacitor Android Docs](https://capacitorjs.com/docs/android)
- [Android Gradle Build](https://developer.android.com/build)
- [Gradle Wrapper](https://docs.gradle.org/current/userguide/gradle_wrapper.html)
