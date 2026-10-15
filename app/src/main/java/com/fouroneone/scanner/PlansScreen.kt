package com.fouroneone.scanner

import android.app.Activity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CardMembership
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Plans & subscriptions screen. The considered-purchase counterpart to
 * the quota sheet: subscriptions live here (never as an impulse popup),
 * alongside top-ups for browsing at leisure.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlansScreen(
    quotaStatus: QuotaStatus,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val productDetails by BillingManager.productDetailsMap.collectAsState()
    fun priceOf(id: String, fallback: String): String {
        val details = productDetails[id] ?: return fallback
        details.subscriptionOfferDetails?.firstOrNull()
            ?.pricingPhases?.pricingPhaseList?.firstOrNull()?.formattedPrice?.let { return it }
        details.oneTimePurchaseOfferDetails?.formattedPrice?.let { return it }
        return fallback
    }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selectedProductId by remember { mutableStateOf<String?>(null) }

    fun buy(productId: String, isTopUp: Boolean) {
        val activity = context as? Activity
        if (activity != null) {
            BillingManager.launchPurchase(activity, productId) {
                BillingManager.showUnavailable(context)
            }
        }
        onDismiss()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier.testTag("plans_screen_bottom_sheet")
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Default.CardMembership,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                    .padding(top = 8.dp)
                    .height(44.dp)
            )

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "Plans & Subscriptions",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Current status
            val sq = quotaStatus.serverQuota
            val statusText = when {
                quotaStatus.isTesterUnlimited -> "Tester — unlimited scans"
                sq != null && sq.remaining > 0 ->
                    "${sq.tier.replaceFirstChar { it.uppercase() }} — ${sq.remaining}/${sq.scansAllowed} scans left"
                sq != null && sq.topUpScans > 0 ->
                    "${sq.topUpScans} top-up scans available"
                quotaStatus.isUnlimited -> "Subscription active"
                else -> "Free tier — 1 scan per week"
            }
            Text(
                text = statusText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            // Renewal date
            sq?.anniversaryEpochMs?.let { epochMs ->
                val sdf = java.text.SimpleDateFormat("MMM d, yyyy", java.util.Locale.US)
                Text(
                    text = "Renews ${sdf.format(java.util.Date(epochMs))}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }

            // Family management (owners only)
            sq?.family?.let { family ->
                if (family.isOwner) {
                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Family Admin",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Start
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Detailed member list with activity, restrict, and kick.
                    var familyDetails by remember { mutableStateOf<FamilyDetails?>(null) }
                    var detailsLoading by remember { mutableStateOf(true) }

                    LaunchedEffect(Unit) {
                        familyDetails = QuotaRepository.getFamilyDetails()
                        detailsLoading = false
                    }

                    if (detailsLoading) {
                        Text(
                            text = "Loading members...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        val details = familyDetails
                        if (details != null) {
                            Text(
                                text = "${details.members.size + details.pendingInvites.size}/${details.maxSeats} seats used" +
                                    if (details.pendingInvites.isNotEmpty()) " (${details.pendingInvites.size} invited)" else "",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))

                            details.members.forEach { member ->
                                MemberRow(
                                    member = member,
                                    onRestrictToggle = {
                                        coroutineScope.launch {
                                            QuotaRepository.restrictFamilySeat(
                                                member.uid, !member.isRestricted
                                            )
                                            // Refresh the list
                                            familyDetails = QuotaRepository.getFamilyDetails()
                                        }
                                    },
                                    onKick = {
                                        coroutineScope.launch {
                                            QuotaRepository.removeFamilySeat(member.uid)
                                            familyDetails = QuotaRepository.getFamilyDetails()
                                        }
                                    }
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }

                            details.pendingInvites.forEach { email ->
                                PendingInviteRow(
                                    email = email,
                                    onCancel = {
                                        coroutineScope.launch {
                                            QuotaRepository.cancelFamilyInvite(email)
                                            familyDetails = QuotaRepository.getFamilyDetails()
                                        }
                                    }
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    var inviteEmail by remember { mutableStateOf("") }
                    var inviteResult by remember { mutableStateOf<FamilyActionResult?>(null) }
                    var inviteSending by remember { mutableStateOf(false) }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        OutlinedTextField(
                            value = inviteEmail,
                            onValueChange = { inviteEmail = it; inviteResult = null },
                            label = { Text("Member email") },
                            singleLine = true,
                            modifier = Modifier.weight(1f)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                inviteSending = true
                                coroutineScope.launch {
                                    val result = QuotaRepository.inviteFamilySeat(inviteEmail.trim())
                                    inviteResult = result
                                    inviteSending = false
                                    if (result.ok) {
                                        inviteEmail = ""
                                        familyDetails = QuotaRepository.getFamilyDetails()
                                    }
                                }
                            },
                            enabled = inviteEmail.isNotBlank() && !inviteSending
                        ) {
                            Text(if (inviteSending) "Sending…" else "Invite")
                        }
                    }

                    inviteResult?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = it.message,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (it.ok) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.error,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Subscriptions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Start
            )

            Spacer(modifier = Modifier.height(10.dp))

            SUBSCRIPTION_TIERS.forEachIndexed { index, tier ->
                TierSelectionCard(
                    title = tier.title,
                    price = priceOf(tier.productId, tier.fallbackPrice),
                    subtitle = tier.subtitle,
                    icon = tier.icon,
                    isSelected = selectedProductId == tier.productId,
                    onClick = { selectedProductId = tier.productId },
                    testTag = tier.testTag
                )
                if (index < SUBSCRIPTION_TIERS.lastIndex) Spacer(modifier = Modifier.height(10.dp))
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Top-Ups",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Start
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = "Extra scans that never expire. Subscription scans always burn first.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Start
            )

            Spacer(modifier = Modifier.height(10.dp))

            TOPUP_TIERS.forEachIndexed { index, tier ->
                TierSelectionCard(
                    title = tier.title,
                    price = priceOf(tier.productId, tier.fallbackPrice),
                    subtitle = tier.subtitle,
                    icon = tier.icon,
                    isSelected = selectedProductId == tier.productId,
                    onClick = { selectedProductId = tier.productId },
                    testTag = tier.testTag
                )
                if (index < TOPUP_TIERS.lastIndex) Spacer(modifier = Modifier.height(10.dp))
            }

            Spacer(modifier = Modifier.height(20.dp))

            val selectedId = selectedProductId
            Button(
                onClick = {
                    if (selectedId != null) {
                        val isTopUp = TOPUP_TIERS.any { it.productId == selectedId }
                        buy(selectedId, isTopUp)
                    }
                },
                enabled = selectedId != null,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("plans_action_button")
            ) {
                Text(
                    text = selectedId?.let { id ->
                        (SUBSCRIPTION_TIERS + TOPUP_TIERS).first { it.productId == id }.actionLabel
                    } ?: "Select a plan",
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

/**
 * An invited email that hasn't accepted yet. It holds a seat until the
 * person accepts, declines, or the owner cancels.
 */
@Composable
private fun PendingInviteRow(
    email: String,
    onCancel: () -> Unit
) {
    androidx.compose.material3.Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = email,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Invited • waiting for them to accept",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            androidx.compose.material3.OutlinedButton(onClick = onCancel) {
                Text("Cancel")
            }
        }
    }
}

/**
 * One row in the family admin board: member email, scan activity,
 * restrict/unrestrict toggle, and kick button. Owner row has no actions.
 */
@Composable
private fun MemberRow(
    member: FamilyMember,
    onRestrictToggle: () -> Unit,
    onKick: () -> Unit
) {
    androidx.compose.material3.Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = member.email ?: "Unknown",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold
                    )
                    val activityText = buildString {
                        append("${member.scansUsed} scans")
                        member.lastScanAt?.let {
                            val sdf = java.text.SimpleDateFormat("MMM d", java.util.Locale.US)
                            append(" • last ${sdf.format(java.util.Date(it))}")
                        }
                        if (member.isOwner) append(" • owner")
                        if (member.isRestricted) append(" • RESTRICTED")
                    }
                    Text(
                        text = activityText,
                        style = MaterialTheme.typography.bodySmall,
                        color = if (member.isRestricted) MaterialTheme.colorScheme.error
                            else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (!member.isOwner) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)
                ) {
                    androidx.compose.material3.OutlinedButton(
                        onClick = onRestrictToggle,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(if (member.isRestricted) "Unrestrict" else "Restrict")
                    }
                    androidx.compose.material3.OutlinedButton(
                        onClick = onKick,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Kick", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}
