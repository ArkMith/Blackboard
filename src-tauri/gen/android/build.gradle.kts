buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.11.0")
        // AGP 8.11.0's own release notes say it was updated to pair with Kotlin
        // 2.1.20 (see: https://developer.android.com/build/releases/agp-8-11-0-release-notes).
        // The template's old 1.9.25 pin predates that and causes a Kotlin
        // metadata-version mismatch during the buildSrc/:app configuration step.
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.20")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

