package com.fouroneone.scanner

import com.google.firebase.auth.AuthCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Encapsulated user authentication state.
 */
data class UserState(
    val uid: String = "",
    val email: String? = null,
    val displayName: String? = null,
    val photoUrl: String? = null,
    val isAnonymous: Boolean = true,
    val isAuthenticated: Boolean = false
)

/**
 * Singleton managing Firebase Auth, anonymous fallback guest sessions,
 * and Google SSO credential links.
 */
object AuthManager {

    private val auth: FirebaseAuth by lazy { FirebaseAuth.getInstance() }

    private val _userState = MutableStateFlow(UserState())
    val userState: StateFlow<UserState> = _userState.asStateFlow()

    private var isInitialized = false

    fun init() {
        if (isInitialized) return
        isInitialized = true

        auth.addAuthStateListener { firebaseAuth ->
            val user = firebaseAuth.currentUser
            updateState(user)
        }

        if (auth.currentUser == null) {
            ensureGuestSession()
        }
    }

    private fun updateState(user: FirebaseUser?) {
        if (user == null) {
            _userState.value = UserState(isAnonymous = true, isAuthenticated = false)
        } else {
            _userState.value = UserState(
                uid = user.uid,
                email = user.email,
                displayName = user.displayName,
                photoUrl = user.photoUrl?.toString(),
                isAnonymous = user.isAnonymous,
                isAuthenticated = true
            )
        }
    }

    fun ensureGuestSession(onComplete: (Boolean) -> Unit = {}) {
        if (auth.currentUser != null) {
            onComplete(true)
            return
        }
        auth.signInAnonymously()
            .addOnSuccessListener {
                updateState(it.user)
                onComplete(true)
            }
            .addOnFailureListener {
                onComplete(false)
            }
    }

    fun signInWithCredential(
        credential: AuthCredential,
        onResult: (Result<UserState>) -> Unit
    ) {
        val currentUser = auth.currentUser
        if (currentUser != null && currentUser.isAnonymous) {
            currentUser.linkWithCredential(credential)
                .addOnSuccessListener { authResult ->
                    updateState(authResult.user)
                    onResult(Result.success(_userState.value))
                }
                .addOnFailureListener {
                    // Fall back to standard sign-in if linking fails (e.g. account already exists)
                    auth.signInWithCredential(credential)
                        .addOnSuccessListener { result ->
                            updateState(result.user)
                            onResult(Result.success(_userState.value))
                        }
                        .addOnFailureListener { ex ->
                            onResult(Result.failure(ex))
                        }
                }
        } else {
            auth.signInWithCredential(credential)
                .addOnSuccessListener { result ->
                    updateState(result.user)
                    onResult(Result.success(_userState.value))
                }
                .addOnFailureListener { ex ->
                    onResult(Result.failure(ex))
                }
        }
    }

    fun signOut() {
        auth.signOut()
        ensureGuestSession()
    }
}
