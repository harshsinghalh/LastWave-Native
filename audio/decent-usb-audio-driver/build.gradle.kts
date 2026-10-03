plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    buildToolsVersion = "37.0.0"
    namespace = "com.decent.usbaudio"
    compileSdk = 37

    defaultConfig {
        minSdk = 24
        externalNativeBuild { cmake { cppFlags("-fno-fast-math") } }
    }

    buildTypes {
        getByName("debug")
        getByName("release")
        create("rawRelease") {
            initWith(getByName("release"))
            isMinifyEnabled = false
        }
    }

//     externalNativeBuild {
//         cmake { path("src/main/jni/CMakeLists.txt") }
//     }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(21)
        compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
}
