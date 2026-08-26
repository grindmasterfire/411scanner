package com.fouroneone.scanner

import android.content.Context
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class UserState(val uid: String = "", val email: String? = null, val displayName: String? = null, val photoUrl: String? = null, val isAnonymous: Boolean = true, val isAuthenticated: Boolean = false)

object AuthManager {
    private const val TAG = "411_AuthManager"
    private var auth: FirebaseAuth? = null
    private val _userState = MutableStateFlow(UserState())
    val userState: StateFlow<UserState> = _userState.asStateFlow()
    private var isInitialized = false

    fun init(context: Context? = null) {
        if (isInitialized) return
        isInitialized = true
        try {
            if (context != null && FirebaseApp.getApps(context).isEmpty()) FirebaseApp.initializeApp(context)
            auth = FirebaseAuth.getInstance()
            auth?.addAuthStateListener { firebaseAuth -> updateState(firebaseAuth.currentUser) }
            if (auth?.currentUser == null) ensureGuestSession()
        } catch (e: Exception) {
            Log.w(TAG, "Firebase Auth offline/mock: ${e.message}")
            _userState.value = UserState(uid = "guest_local_device", isAnonymous = true, isAuthenticated = false)
        }
    }

    private fun updateState(user: FirebaseUser?) {
        if (user == null) {
            _userState.value = UserState(uid = "guest_local_device", isAnonymous = true, isAuthenticated = false)
        } else {
            _userState.value = UserState(uid = user.uid, email = user.email, displayName = user.displayName, photoUrl = user.photoUrl?.toString(), isAnonymous = user.isAnonymous, isAuthenticated = true)
        }
    }

    fun ensureGuestSession(onComplete: (Boolean) -> Unit = {}) {
        try {
            val current = auth?.currentUser
            if (current != null) { updateState(current); onComplete(true) }
            else {
                auth?.signInAnonymously()?.addOnCompleteListener { task ->
                    if (task.isSuccessful) { updateState(task.result?.user); onComplete(true) }
                    else { _userState.value = UserState(uid = "guest_fallback", isAnonymous = true, isAuthenticated = false); onComplete(false) }
                } ?: onComplete(false)
            }
        } catch (e: Exception) { onComplete(false) }
    }

    fun signInWithCredential(credential: AuthCredential, onResult: (Result<UserState>) -> Unit) {
        val currentAuth = auth ?: run { onResult(Result.failure(Exception("Auth uninitialized"))); return }
        val user = currentAuth.currentUser
        if (user != null && user.isAnonymous) {
            user.linkWithCredential(credential).addOnSuccessListener { updateState(it.user); onResult(Result.success(_userState.value)) }.addOnFailureListener { currentAuth.signInWithCredential(credential).addOnSuccessListener { res -> updateState(res.user); onResult(Result.success(_userState.value)) }.addOnFailureListener { err -> onResult(Result.failure(err)) } }
        } else {
            currentAuth.signInWithCredential(credential).addOnSuccessListener { res -> updateState(res.user); onResult(Result.success(_userState.value)) }.addOnFailureListener { err -> onResult(Result.failure(err)) }
        }
    }

    fun signOut() { try { auth?.signOut(); ensureGuestSession() } catch (e: Exception) {} }
}
