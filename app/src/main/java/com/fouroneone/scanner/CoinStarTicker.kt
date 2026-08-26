package com.fouroneone.scanner

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

data class TickerStep(
    val stepNumber: String,
    val title: String,
    val subtitle: String
)

@Composable
fun CoinStarTicker(
    modifier: Modifier = Modifier
) {
    val steps = remember {
        listOf(
            TickerStep(
                "[01/05]",
                "OPTICAL OCR & TARGET IDENTIFICATION",
                "Extracting package IDs, domains, fine print, and store metadata..."
            ),
            TickerStep(
                "[02/05]",
                "REAL-TIME SEARCH GROUNDING",
                "Querying SEC EDGAR, WHOIS registries, FTC alerts, and Play Store telemetry..."
            ),
            TickerStep(
                "[03/05]",
                "MONETIZATION & RETENTION AUDIT",
                "Evaluating ad-load density, payout milestones, and decay mechanics..."
            ),
            TickerStep(
                "[04/05]",
                "6-VECTOR FRICTION & AUTHENTICITY MATH",
                "Computing financial risk, exposure, offline depth, and pricing transparency..."
            ),
            TickerStep(
                "[05/05]",
                "FINALIZING DOSSIER & ACTION METER",
                "Compiling bottom-line analysis and generating regulatory cross-references..."
            )
        )
    }

    var currentStepIndex by remember { mutableIntStateOf(0) }
    var progress by remember { mutableFloatStateOf(0.15f) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(5000)
            if (currentStepIndex < steps.size - 1) {
                currentStepIndex++
                progress = (currentStepIndex + 1).toFloat() / steps.size.toFloat()
            }
        }
    }

    val currentStep = steps[currentStepIndex]

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFF1B1924))
            .border(1.5.dp, Color(0xFF6750A4).copy(alpha = 0.5f), RoundedCornerShape(16.dp))
            .padding(18.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFFD0BCFF)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "DIAGNOSTIC PIPELINE ACTIVE",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFFD0BCFF),
                        letterSpacing = 1.sp
                    )
                }

                Text(
                    text = currentStep.stepNumber,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFFFFB59D)
                )
            }

            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp)),
                color = Color(0xFFD0BCFF),
                trackColor = Color(0xFF332D41)
            )

            AnimatedContent(
                targetState = currentStep,
                transitionSpec = {
                    (slideInVertically { height -> height } + fadeIn()) togetherWith
                            (slideOutVertically { height -> -height } + fadeOut())
                },
                label = "CoinStarStepTransition"
            ) { step ->
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = step.title,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = step.subtitle,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.Normal,
                        color = Color(0xFFCAC4D0)
                    )
                }
            }
        }
    }
}