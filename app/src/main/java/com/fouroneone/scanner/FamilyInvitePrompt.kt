/**
 * @file: FamilyInvitePrompt.kt
 * @class: Class 1 (Focused UI Component)
 * @cap: 150 Lines
 * @responsibility:
 * Ask the signed-in user to accept or decline a Family plan invite sent to
 * their email. Nobody joins a family without saying yes here.
 *
 * @dependencies:
 * Compose, AuthManager, QuotaRepository, QuotaManager.
 *
 * @security_gate:
 * The server only lets the account whose verified email the invite names
 * answer it, and refuses to join over the user's own paid plan.
 *
 * @owner_context:
 * 411 Scanner Family plan (storyboard Epic 12).
 */

package com.fouroneone.scanner

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

@Composable
fun FamilyInvitePrompt() {
    val user by AuthManager.userState.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()

    var invites by remember { mutableStateOf<List<FamilyInvite>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var outcome by remember { mutableStateOf<FamilyActionResult?>(null) }

    // Re-check whenever a different account signs in.
    LaunchedEffect(user.uid, user.isAuthenticated) {
        invites = if (user.isAuthenticated) QuotaRepository.getFamilyInvites() else emptyList()
    }

    val invite = invites.firstOrNull()

    fun respond(accept: Boolean) {
        val current = invite ?: return
        busy = true
        coroutineScope.launch {
            val result = QuotaRepository.respondFamilyInvite(current.inviteId, accept)
            busy = false
            outcome = result
            if (result.ok) {
                invites = invites.drop(1)
                if (accept) QuotaManager.refreshServerQuota()
            }
        }
    }

    val shown = outcome
    when {
        shown != null -> AlertDialog(
            onDismissRequest = { outcome = null },
            title = { Text(if (shown.ok) "Family plan" else "Couldn't join") },
            text = { Text(shown.message) },
            confirmButton = {
                TextButton(onClick = { outcome = null }) { Text("OK") }
            }
        )

        invite != null -> AlertDialog(
            onDismissRequest = { },
            title = { Text("Family plan invite") },
            text = {
                Text(
                    "${invite.ownerEmail.ifBlank { "Someone" }} invited you to join their " +
                        "411 Scanner Family plan. You'd share their scans and top-ups."
                )
            },
            confirmButton = {
                TextButton(onClick = { respond(true) }, enabled = !busy) {
                    Text(if (busy) "Joining…" else "Accept")
                }
            },
            dismissButton = {
                TextButton(onClick = { respond(false) }, enabled = !busy) {
                    Text("Decline", color = MaterialTheme.colorScheme.error)
                }
            }
        )
    }
}
