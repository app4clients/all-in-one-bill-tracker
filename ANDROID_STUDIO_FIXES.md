# Android Studio - Correctifs des erreurs rencontrees

Ce document corrige les deux erreurs bloqueantes rencontrees:

1. Invalid Gradle JDK configuration
2. Duplicate class kotlin-stdlib (1.8.22 vs jdk7/jdk8 1.6.21)

## 1) Fix Gradle JDK invalide

Dans Android Studio:
- File -> Settings -> Build, Execution, Deployment -> Build Tools -> Gradle
- Gradle JDK: choisir `Embedded JDK`
  - Windows: `C:\Program Files\Android\Android Studio\jbr`

Option de secours dans `android/gradle.properties`:

```properties
org.gradle.java.home=C:\\Program Files\\Android\\Android Studio\\jbr
```

Puis:
- File -> Sync Project with Gradle Files
- Build -> Rebuild Project

## 2) Fix Duplicate Kotlin classes

Cause: melange de `kotlin-stdlib:1.8.22` avec `kotlin-stdlib-jdk7/jdk8:1.6.21`.

### 2.1 `android/variables.gradle`

```gradle
ext {
    minSdkVersion = 24
    compileSdkVersion = 35
    targetSdkVersion = 35
    kotlin_version = '1.8.22'
    cordovaAndroidVersion = '12.0.1'
}
```

Note: `cordovaAndroidVersion 12.0.1` impose minSdk >= 24.

### 2.2 `android/app/build.gradle`

Ajouter:

```gradle
configurations.configureEach {
    exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk7"
    exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk8"
}
```

Dans `dependencies {}` ajouter:

```gradle
implementation platform("org.jetbrains.kotlin:kotlin-bom:${rootProject.ext.kotlin_version}")
```

### 2.3 `android/build.gradle` (project/root)

Ajouter en bas:

```gradle
subprojects {
    configurations.configureEach {
        exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk7"
        exclude group: "org.jetbrains.kotlin", module: "kotlin-stdlib-jdk8"

        resolutionStrategy {
            force "org.jetbrains.kotlin:kotlin-stdlib:${rootProject.ext.kotlin_version}"
            force "org.jetbrains.kotlin:kotlin-stdlib-common:${rootProject.ext.kotlin_version}"
            force "org.jetbrains.kotlin:kotlin-reflect:${rootProject.ext.kotlin_version}"
            eachDependency { details ->
                if (details.requested.group == "org.jetbrains.kotlin") {
                    details.useVersion rootProject.ext.kotlin_version
                }
            }
        }
    }
}
```

## 3) Nettoyage et rebuild (PowerShell Windows)

```powershell
cd "<ton-projet>\android"
.\gradlew.bat clean --refresh-dependencies
cd ..
npx cap sync android
npx cap open android
```

Dans Android Studio:
- File -> Invalidate Caches / Restart
- Build -> Rebuild Project

## 4) Diagnostic si erreur restante

```powershell
cd "<ton-projet>\android"
.\gradlew.bat :app:dependencyInsight --configuration debugRuntimeClasspath --dependency kotlin-stdlib-jdk8
```

Le module remonte dans ce rapport est celui a exclure en priorite.