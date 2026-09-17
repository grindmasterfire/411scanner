/**
 * @file: SixVectorGrid.kt
 * @class: Class 2 (Standard UI/Data Component)
 * @cap: 250 Lines
 * @responsibility: Render the six diagnostic vectors and their evidence annotations for the Consumer Card.
 * @dependencies: Jetpack Compose Material 3, Metrics, MetricAnnotations
 * @security_gate: Presentation only. No scoring, network access, persistence, or evidence mutation.
 * @owner_context: 411 Scanner Consumer Card six-vector diagnostic surface.
 */

package com.fouroneone.scanner

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Renders the six-vector diagnostic.
 * Practical Utility is the Android-facing meaning of the
 * V1 compatibility wire field offline_independence.
 */
@Composable
fun SixVectorGrid(
    metrics: Metrics,
    annotations: MetricAnnotations,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = "6-VECTOR DIAGNOSTIC AUDIT",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.outline
        )

        Spacer(modifier = Modifier.height(10.dp))

        MatrixSection(
            headerTitle = "▼ LOWER IS BETTER (Friction & Traps)",
            headerColor = Color(0xFFC62828),
            containerColor = Color(0xFFC62828).copy(alpha = 0.05f),
            borderColor = Color(0xFFC62828).copy(alpha = 0.3f),
            isDownward = true
        ) {
            VectorMetricCard(
                "Financial Risk",
                metrics.financialRisk,
                annotations.financialRiskNote,
                true
            )
            Spacer(modifier = Modifier.height(8.dp))
            VectorMetricCard(
                "Personal Data Exposure",
                metrics.personalDataExposure,
                annotations.personalDataNote,
                true
            )
            Spacer(modifier = Modifier.height(8.dp))
            VectorMetricCard(
                "Wasted Time & Ads",
                metrics.wastedTimeAndAds,
                annotations.wastedTimeNote,
                true
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        MatrixSection(
            headerTitle = "▲ HIGHER IS BETTER (Quality & Authenticity)",
            headerColor = Color(0xFF2E7D32),
            containerColor = Color(0xFF2E7D32).copy(alpha = 0.05f),
            borderColor = Color(0xFF2E7D32).copy(alpha = 0.3f),
            isDownward = false
        ) {
            VectorMetricCard(
                "Real Substance",
                metrics.realSubstance,
                annotations.realSubstanceNote,
                false
            )
            Spacer(modifier = Modifier.height(8.dp))
            VectorMetricCard(
                "Practical Utility",
                metrics.practicalUtility,
                annotations.practicalUtilityNote,
                false
            )
            Spacer(modifier = Modifier.height(8.dp))
            VectorMetricCard(
                "Honest Business Model",
                metrics.honestBusinessModel,
                annotations.honestBusinessModelNote,
                false
            )
        }
    }
}

/**
 * Groups one directional family of diagnostic vectors.
 */
@Composable
private fun MatrixSection(
    headerTitle: String,
    headerColor: Color,
    containerColor: Color,
    borderColor: Color,
    isDownward: Boolean,
    content: @Composable () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor),
        border = BorderStroke(1.dp, borderColor)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector =
                        if (isDownward) {
                            Icons.Default.ArrowDownward
                        } else {
                            Icons.Default.ArrowUpward
                        },
                    contentDescription = null,
                    tint = headerColor,
                    modifier = Modifier.size(16.dp)
                )
                Text(
                    text = headerTitle,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.ExtraBold,
                    color = headerColor
                )
            }

            Spacer(modifier = Modifier.height(10.dp))
            content()
        }
    }
}

/**
 * Renders one diagnostic factor and its evidence annotation.
 * isFriction affects display color only.
 */
@Composable
private fun VectorMetricCard(
    title: String,
    score: Int,
    note: String,
    isFriction: Boolean
) {
    val chipColor =
        if (isFriction) {
            when {
                score >= 7 -> Color(0xFFD32F2F)
                score >= 4 -> Color(0xFFF57C00)
                else -> Color(0xFF2E7D32)
            }
        } else {
            when {
                score >= 7 -> Color(0xFF2E7D32)
                score >= 4 -> Color(0xFFF57C00)
                else -> Color(0xFFD32F2F)
            }
        }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            MaterialTheme.colorScheme.surface
        ),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(
            1.dp,
            MaterialTheme.colorScheme.outlineVariant
        )
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = chipColor,
                    modifier = Modifier.padding(start = 8.dp)
                ) {
                    Text(
                        text = "$score / 10",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                        modifier = Modifier.padding(
                            horizontal = 8.dp,
                            vertical = 2.dp
                        )
                    )
                }
            }

            if (note.isNotBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = note,
                    style = MaterialTheme.typography.bodySmall,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 15.sp
                )
            }
        }
    }
}