package com.fouroneone.scanner

import android.app.Application
import com.google.firebase.FirebaseApp

class ScannerApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Device key for the weekly free scan (survives data clears).
        DeviceKey.init(this)
        try {
            FirebaseApp.initializeApp(this)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
