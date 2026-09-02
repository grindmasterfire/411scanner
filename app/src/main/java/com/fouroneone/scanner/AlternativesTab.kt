package com.fouroneone.scanner

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AlternativesTab(
    consumerCard: ConsumerCard?,
    technicalLedger: TechnicalLedger?,
    alternatives: Alternatives?
) {
    val context = LocalContext.current
    if (alternatives == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No alternative data available.", color = Color.Gray)
        }
        return
    }
    val targetName = consumerCard?.targetName.orEmpty()
    val targetDomainOrPkg = technicalLedger?.networkTelemetry?.appPackageOrDomain.orEmpty()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!alternatives.renders) {
            // Score 5.5 and under — show target's own verified links
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF3FDF5)),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, Color(0xFF81C784))
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(Icons.Default.Verified, contentDescription = null, tint = Color(0xFF2E7D32))
                    Column {
                        Text(
                            text = "VERIFIED DIRECT ACCESS",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF2E7D32)
                        )
                        Text(
                            text = "This target scored below the alternatives threshold. Use the verified links below to reach it directly.",
                            fontSize = 12.sp,
                            color = Color(0xFF1B5E20)
                        )
                    }
                }
            }
            Text(
                text = "OFFICIAL CONTACT POINTS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF6750A4),
                letterSpacing = 0.8.sp
            )
            val siteUrl = alternatives.verifiedLinks.officialSite.ifBlank {
                val domain = targetDomainOrPkg
                when {
                    domain.startsWith("com.") -> "https://play.google.com/store/apps/details?id=$domain"
                    domain.contains(".") -> "https://${domain.removePrefix("https://").removePrefix("http://").trimEnd('/')}"
                    else -> "https://www.google.com/search?q=${URLEncoder.encode(targetName, StandardCharsets.UTF_8.toString())}"
                }
            }
            if (siteUrl.isNotBlank()) {
                VerifiedLinkCard(
                    label = "Official Site",
                    value = siteUrl,
                    icon = { Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp)) },
                    onClick = {
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(siteUrl)))
                        } catch (e: Exception) { }
                    }
                )
            }
            val phone = alternatives.verifiedLinks.realPhone
            if (phone.isNotBlank()) {
                VerifiedLinkCard(
                    label = "Phone",
                    value = phone,
                    icon = { Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp)) },
                    onClick = {
                        try {
                            context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                        } catch (e: Exception) { }
                    }
                )
            }
            val email = alternatives.verifiedLinks.realEmail
            if (email.isNotBlank()) {
                VerifiedLinkCard(
                    label = "Email",
                    value = email,
                    icon = { Icon(Icons.Default.Email, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp)) },
                    onClick = {
                        try {
                            context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$email")))
                        } catch (e: Exception) { }
                    }
                )
            }
        } else {
            // Score 5.6 and above — show recommended alternatives
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "VETTED ALTERNATIVES",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF6750A4),
                    letterSpacing = 0.8.sp
                )
                Text(
                    text = "411 Verified",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF79747E)
                )
            }
            if (alternatives.recommendedAlternatives.isEmpty()) {
                Text(
                    text = "No verified alternatives found for this target.",
                    fontSize = 13.sp,
                    color = Color.Gray
                )
            } else {
                alternatives.recommendedAlternatives.forEach { alt ->
                    val targetUrl = when {
                        alt.name.contains("(") -> {
                            val domain = alt.name.substringAfter("(").substringBefore(")").trim()
                            when {
                                domain.startsWith("com.") || domain.startsWith("org.") ->
                                    "market://details?id=$domain"
                                domain.contains(".") && !domain.contains(" ") ->
                                    "https://$domain"
                                else ->
                                    "https://www.google.com/search?q=${URLEncoder.encode(alt.name, StandardCharsets.UTF_8.toString())}"
                            }
                        }
                        else ->
                            "https://www.google.com/search?q=${URLEncoder.encode(alt.name, StandardCharsets.UTF_8.toString())}"
                    }
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
                                } catch (e: Exception) {
                                    context.startActivity(
                                        Intent(Intent.ACTION_VIEW,
                                            Uri.parse("https://www.google.com/search?q=${URLEncoder.encode(alt.name, "UTF-8")}"))
                                    )
                                }
                            },
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFCFBFF)),
                        border = BorderStroke(1.dp, Color(0xFFE6E0E9))
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Star,
                                contentDescription = null,
                                tint = Color(0xFF6750A4),
                                modifier = Modifier.size(24.dp)
                            )
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = alt.name.substringBefore("(").trim(),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF1E1B2E)
                                )
                                if (alt.scoreEstimate.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        text = "Score: ${alt.scoreEstimate}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF6750A4)
                                    )
                                }
                                if (alt.description.isNotBlank()) {
                                    Spacer(modifier = Modifier.height(3.dp))
                                    Text(
                                        text = alt.description,
                                        fontSize = 12.sp,
                                        color = Color(0xFF49454F)
                                    )
                                }
                            }
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF2E7D32),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        if (alternatives.communityTags.isNotEmpty()) {
            Text(
                text = "COMMUNITY SIGNALS",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF6750A4),
                letterSpacing = 0.8.sp
            )
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                alternatives.communityTags.forEach { tag ->
                    AssistChip(
                        onClick = {},
                        label = { Text(tag, fontSize = 11.sp, fontWeight = FontWeight.Medium) },
                        colors = AssistChipDefaults.assistChipColors(
                            containerColor = Color(0xFFECE6F0),
                            labelColor = Color(0xFF49454F)
                        ),
                        border = null,
                        shape = RoundedCornerShape(8.dp)
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
private fun VerifiedLinkCard(
    label: String,
    value: String,
    icon: @Composable () -> Unit,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.5.dp, Color(0xFF2E7D32))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            icon()
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF49454F)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = value,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF1E1B2E)
                )
            }
        }
    }
}