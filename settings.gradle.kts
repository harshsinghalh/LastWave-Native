pluginManagement {
    buildscript {
        repositories {
            google()
            mavenCentral()
            maven { url = uri("https://storage.googleapis.com/r8-releases/raw") }
        }
        dependencies {
            classpath("com.android.tools:r8:9.4.14")
        }
    }
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        maven { url = uri("https://storage.googleapis.com/r8-releases/raw") }
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven("https://jitpack.io")
    }
}

rootProject.name = "LastWave"
include(":app")
include(":audio:decent-usb-audio-driver")

// NewTube 1.15.0 engine and native player, pinned in newtube/.
gradle.extra["sharedModulesRoot"] = file("newtube/SharedModules")
gradle.extra["mediaServiceCoreRoot"] = file("newtube/MediaServiceCore")
gradle.extra["sharedModulesConstants"] = file("newtube/SharedModules/constants.gradle")
apply(from = "newtube/SharedModules/core_settings.gradle")
apply(from = "newtube/MediaServiceCore/core_settings.gradle")
listOf("smarttubetv", "common", "filepicker-lib", "doubletapplayerview-media3", "slidableactivity", "sabr-media3").forEach {
    include(":$it")
    project(":$it").projectDir = file("newtube/$it")
}

include(":laya-policy")
