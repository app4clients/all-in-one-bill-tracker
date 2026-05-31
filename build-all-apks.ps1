Write-Host "=== Building Play Store APK ===" -ForegroundColor Cyan
$env:VITE_BUILD_VARIANT="playstore"
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
cd ..
Write-Host "Play Store APK ready: android/app/build/outputs/apk/release/app-release.apk" -ForegroundColor Green

Write-Host "`n=== Building Amazon APK ===" -ForegroundColor Cyan
$env:VITE_BUILD_VARIANT="amazon"
npm run build
npx cap sync android-amazon
cd android-amazon
./gradlew assembleRelease
cd ..
Write-Host "Amazon APK ready: android-amazon/app/build/outputs/apk/release/app-release.apk" -ForegroundColor Green

Write-Host "`n=== Building Direct APK ===" -ForegroundColor Cyan
$env:VITE_BUILD_VARIANT="direct"
npm run build
npx cap sync android-direct
cd android-direct
./gradlew assembleRelease
cd ..
Write-Host "Direct APK ready: android-direct/app/build/outputs/apk/release/app-release.apk" -ForegroundColor Green

Write-Host "`n=== All APKs built successfully ===" -ForegroundColor Green