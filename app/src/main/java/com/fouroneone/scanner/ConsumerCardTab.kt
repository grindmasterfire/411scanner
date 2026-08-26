package com.fouroneone.scanner

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale

@Composable
fun ConsumerCardTab(consumerCard: ConsumerCard?) {
    if (consumerCard == null) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text("No diagnostic data available.", color = Color.Gray)
        }
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Target Header Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFAFAFE)),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = consumerCard.targetName,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1E1B2E)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Entity: ${consumerCard.developerOrEntity}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF6B4EA2)
                )
            }
        }

        // Action Meter Container
        val score: Double = try {
            consumerCard.actionMeterScore.toDouble()
        } catch (e: Exception) {
            0.0
        }
        val (badgeColor, containerBg, borderStroke) = getActionMeterColors(score)

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, borderStroke, RoundedCornerShape(16.dp)),
            colors = CardDefaults.cardColors(containerColor = containerBg),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "ACTION METER",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF5E5970),
                        letterSpacing = 1.sp
                    )
                    Text(
                        text = String.format(Locale.US, "SCORE: %.1f / 10", score),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Black,
                        color = badgeColor
                    )
                }

                // Spectrum Legend Chips
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    SpectrumChip(label = "0-2 Safe", active = score < 3.0, color = Color(0xFF2E7D32))
                    SpectrumChip(label = "3-4 Solid", active = score in 3.0..4.9, color = Color(0xFF757575))
                    SpectrumChip(label = "5 Tribe", active = score in 5.0..5.9, color = Color(0xFFF9A825))
                    SpectrumChip(label = "6-7 Narrow", active = score in 6.0..7.9, color = Color(0xFFE65100))
                    SpectrumChip(label = "8-10 Delete", active = score >= 8.0, color = Color(0xFFC62828))
                }

                // Main Action Verdict Badge
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = 0.85f), RoundedCornerShape(10.dp))
                        .border(1.5.dp, badgeColor.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
                        .padding(vertical = 12.dp, horizontal = 16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = consumerCard.actionVerdictBadge,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        color = badgeColor,
                        textAlign = TextAlign.Center
                    )
                }

                // Dynamic Subtitle Mapping
                val subtitle = when {
                    score < 3.0 -> "Universal utility. Open baseline software fit for anyone."
                    score < 5.0 -> "Solid baseline. Standard mechanics and transparent trade-offs."
                    score < 6.0 -> "Your Tribe. Built for a specific community or specialized workflow."
                    score < 7.0 -> "Not for everyone. High entry hurdles, pushy funnels, or narrow utility."
                    score < 8.0 -> "Pro consideration only. Aggressive monetization or steep commitments."
                    score < 9.0 -> "Delete from device. Extreme local battery, data, or financial drain."
                    score < 10.0 -> "Delete from Play Store. Deceptive mechanics or structural store violations."
                    else -> "Delete from Earth. Predatory malicious infrastructure or fraud vectors."
                }

                Text(
                    text = subtitle,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color(0xFF4A4458),
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }

        // Six-Vector Diagnostic Audit Breakdown
        SixVectorAuditSection(consumerCard = consumerCard)

        // The 411 Bottom Line
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFF3EDF7)),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "THE 411 BOTTOM LINE",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF6750A4),
                    letterSpacing = 0.8.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = consumerCard.the411BottomLine,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    fontWeight = FontWeight.Normal,
                    color = Color(0xFF1D1B20)
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
    }
}

@Composable
private fun SixVectorAuditSection(consumerCard: ConsumerCard) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "6-VECTOR DIAGNOSTIC AUDIT",
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF5E5970),
            letterSpacing = 1.sp
        )

        // Traps Card (Lower is Better)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Color(0xFFFFCDD2), RoundedCornerShape(12.dp)),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBFB)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "↓ ▼ LOWER IS BETTER (Friction & Traps)",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFC62828)
                )
                MetricRow(title = "Financial Risk", score = consumerCard.metrics.financialRisk, note = consumerCard.metricAnnotations.financialRiskNote, isTrap = true)
                MetricRow(title = "Personal Data Exposure", score = consumerCard.metrics.personalDataExposure, note = consumerCard.metricAnnotations.personalDataNote, isTrap = true)
                MetricRow(title = "Wasted Time & Ads", score = consumerCard.metrics.wastedTimeAndAds, note = consumerCard.metricAnnotations.wastedTimeNote, isTrap = true)
            }
        }

        // Quality Card (Higher is Better)
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Color(0xFFC8E6C9), RoundedCornerShape(12.dp)),
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFBFFFB)),
            shape = RoundedCornerShape(12.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "↑ ▲ HIGHER IS BETTER (Quality & Authenticity)",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF2E7D32)
                )
                MetricRow(title = "Real Substance", score = consumerCard.metrics.realSubstance, note = consumerCard.metricAnnotations.realSubstanceNote, isTrap = false)
                MetricRow(title = "Offline Independence", score = consumerCard.metrics.offlineIndependence, note = consumerCard.metricAnnotations.offlineIndependenceNote, isTrap = false)
                MetricRow(title = "Honest Pricing", score = consumerCard.metrics.honestPricing, note = consumerCard.metricAnnotations.honestPricingNote, isTrap = false)
            }
        }
    }
}

@Composable
private fun MetricRow(title: String, score: Int, note: String, isTrap: Boolean) {
    val badgeColor = if (isTrap) {
        when {
            score <= 3 -> Color(0xFF2E7D32)
            score <= 6 -> Color(0xFFEF6C00)
            else -> Color(0xFFC62828)
        }
    } else {
        when {
            score >= 7 -> Color(0xFF2E7D32)
            score >= 4 -> Color(0xFFEF6C00)
            else -> Color(0xFFC62828)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E1B2E))
                Box(
                    modifier = Modifier
                        .background(badgeColor, RoundedCornerShape(4.dp))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(text = "$score / 10", fontSize = 11.sp, fontWeight = FontWeight.Black, color = Color.White)
                }
            }
            if (note.isNotBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(text = note, fontSize = 11.sp, lineHeight = 15.sp, color = Color(0xFF49454F))
            }
        }
    }
}

@Composable
private fun SpectrumChip(label: String, active: Boolean, color: Color) {
    Text(
        text = label,
        fontSize = 10.sp,
        fontWeight = if (active) FontWeight.Black else FontWeight.Normal,
        color = if (active) color else Color.Gray.copy(alpha = 0.6f)
    )
}

private fun getActionMeterColors(score: Double): Triple<Color, Color, Color> {
    return when {
        score < 3.0 -> Triple(Color(0xFF2E7D32), Color(0xFFF1F8E9), Color(0xFFA5D6A7))
        score < 5.0 -> Triple(Color(0xFF5A5A5A), Color(0xFFF5F5F5), Color(0xFFCCCCCC))
        score < 6.0 -> Triple(Color(0xFFE65100), Color(0xFFFFF8E1), Color(0xFFFFE082))
        score < 7.0 -> Triple(Color(0xFFEF6C00), Color(0xFFFFF3E0), Color(0xFFFFCC80))
        score < 8.0 -> Triple(Color(0xFFD84315), Color(0xFFFBE9E7), Color(0xFFFFAB91))
        score < 9.0 -> Triple(Color(0xFFC62828), Color(0xFFFFEBEE), Color(0xFFEF9A9A))
        score < 10.0 -> Triple(Color(0xFFB71C1C), Color(0xFFFFCDD2), Color(0xFFE57373))
        else -> Triple(Color(0xFF4A148C), Color(0xFFF3E5F5), Color(0xFFCE93D8))
    }
}