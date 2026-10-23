#!/usr/bin/env bash
# Сборка Android APK (обёртка WebView с игрой) без Gradle: bash tools/build-apk.sh
# Нужны: JDK, Android SDK (platforms;android-34, build-tools;35.0.0). ANDROID_HOME по умолчанию /root/android-sdk.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_HOME:-/root/android-sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
OUT="$ROOT/dist"; B="$ROOT/android/build"
rm -rf "$B"; mkdir -p "$B/res" "$B/assets" "$B/classes" "$B/gen" "$OUT"

node "$ROOT/tools/build.js" >/dev/null
cp "$ROOT/index.html" "$B/assets/index.html"
VERSION="$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)"

# ресурсы и манифест (versionCode = число коммитов, чтобы обновления ставились поверх)
sed "s/android:versionCode=\"1\"/android:versionCode=\"$VERSION\"/; s/android:versionName=\"1.0\"/android:versionName=\"1.0.$VERSION\"/" "$ROOT/android/AndroidManifest.xml" > "$B/AndroidManifest.xml"
"$BT/aapt2" compile --dir "$ROOT/android/res" -o "$B/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest "$B/AndroidManifest.xml" -A "$B/assets" -R "$B/res.zip" \
  --java "$B/gen" --auto-add-overlay -o "$B/base.apk"

# код
javac -g -nowarn -source 1.8 -target 1.8 -bootclasspath "$JAR" -classpath "$JAR" -d "$B/classes" \
  $(find "$ROOT/android/src" "$B/gen" -name '*.java') 2>&1 | grep -v "^warning\|^Note\|options were not" || true
"$BT/d8" --min-api 24 --lib "$JAR" --output "$B" $(find "$B/classes" -name '*.class')
(cd "$B" && zip -q base.apk classes.dex)

# выравнивание и подпись (отладочный ключ проекта — одинаковый в каждой сборке, обновления ставятся поверх)
KS="$ROOT/android/debug.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias syncstrike \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Sync Strike Debug" >/dev/null 2>&1
fi
"$BT/zipalign" -f -p 4 "$B/base.apk" "$B/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --ks-key-alias syncstrike \
  --out "$OUT/SyncStrike.apk" "$B/aligned.apk"
"$BT/apksigner" verify "$OUT/SyncStrike.apk"
echo "APK: $OUT/SyncStrike.apk ($(du -h "$OUT/SyncStrike.apk" | cut -f1)), versionCode $VERSION"
