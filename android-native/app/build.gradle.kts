plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android { namespace = "id.notaku.app"; compileSdk = 35
    defaultConfig { applicationId = "id.notaku.app"; minSdk = 26; targetSdk = 35; versionCode = 103501; versionName = "1.35.1" }
    buildTypes {
        release {
            isMinifyEnabled = false
            // Sementara memakai debug keystore agar APK hasil GitHub Actions valid
            // untuk instalasi. Production signing key dipindahkan ke GitHub Secret
            // sebelum distribusi publik dan update otomatis.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin { jvmToolchain(17) }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
