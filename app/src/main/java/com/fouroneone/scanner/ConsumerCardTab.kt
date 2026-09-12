/**

* @file: ConsumerCardTab.kt
* @class: Class 3 (Feature Component)
* @cap: 400 Lines
* @responsibility: Render the primary consumer-facing diagnostic card, calibration telemetry, and on-demand Deep Dive.
* @dependencies: Jetpack Compose, ConsumerCard, ScanTelemetry, ActionMeter, SixVectorGrid, ScanTelemetryReadout
* @security_gate: Presentation-only component. Deep Dive execution is supplied by the parent callback and is never pre-generated.
* @owner_context: 411 Scanner Consumer Card result surface.
  */

package com.fouroneone.scanner

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**

* Primary consumer-facing report surface.
*
* The component owns presentation state only. Report data remains immutable,
* while telemetry is displayed as read-only calibration information and
* Deep Dive state exists solely for the on-demand interaction.
  */
  @Composable
  fun ConsumerCardTab(
  consumerCard: ConsumerCard?,
  telemetry: ScanTelemetry? = null,
  onRequestDeepDive: (suspend () -> String?)? = null
  ) {
  if (consumerCard == null) {
  // A missing report is rendered as an explicit empty state rather than
  // allowing downstream composables to dereference absent diagnostic data.
  Box(
  modifier = Modifier.fillMaxSize(),
  contentAlignment = Alignment.Center
  ) {
  Text(
  "No diagnostic data available.",
  color = Color.Gray
  )
  }
  return
  }

  var isExpanded by remember { mutableStateOf(false) }
  var deepDiveText by remember { mutableStateOf<String?>(null) }
  var isLoadingDeepDive by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  Column(
  modifier = Modifier
  .fillMaxSize()
  .verticalScroll(rememberScrollState())
  .padding(horizontal = 16.dp, vertical = 12.dp)
  .navigationBarsPadding(),
  verticalArrangement = Arrangement.spacedBy(16.dp)
  ) {
  // Target Header establishes identity before the consumer evaluates the report.
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
  if (consumerCard.interfaceSurface.isNotBlank()) {
  Spacer(modifier = Modifier.height(2.dp))
  Text(
  text = consumerCard.interfaceSurface,
  fontSize = 12.sp,
  color = Color(0xFF79747E)
  )
  }
  }
  }

   // Action Meter exposes the synthesized decision signal before detailed vectors.
   ActionMeter(
       score = consumerCard.actionMeterScore,
       verdictBadge = consumerCard.actionVerdictBadge
   )

   // 6-Vector Grid exposes the evidence dimensions and their explanatory annotations.
   SixVectorGrid(
       metrics = consumerCard.metrics,
       annotations = consumerCard.metricAnnotations
   )

   // Telemetry is isolated from diagnostic content so calibration data cannot
   // alter the consumer-facing scoring or evidence presentation.
   if (telemetry != null) {
       ScanTelemetryReadout(telemetry = telemetry)
   }

   // Essential 411 gives the consumer the concise evidence-based takeaway.
   Card(
       modifier = Modifier.fillMaxWidth(),
       colors = CardDefaults.cardColors(containerColor = Color(0xFFF3EDF7)),
       shape = RoundedCornerShape(16.dp)
   ) {
       Column(modifier = Modifier.padding(16.dp)) {
           Text(
               text = "THE ESSENTIAL 411",
               fontSize = 11.sp,
               fontWeight = FontWeight.Black,
               color = Color(0xFF6750A4),
               letterSpacing = 0.8.sp
           )
           Spacer(modifier = Modifier.height(6.dp))
           Text(
               text = consumerCard.essential411.ifBlank { consumerCard.tagline },
               fontSize = 13.sp,
               lineHeight = 19.sp,
               color = Color(0xFF1D1B20)
           )
           if (consumerCard.secondaryTargetsNote.isNotBlank()) {
               Spacer(modifier = Modifier.height(8.dp))
               Text(
                   text = consumerCard.secondaryTargetsNote,
                   fontSize = 12.sp,
                   color = Color(0xFF79747E),
                   fontWeight = FontWeight.Medium
               )
           }
       }
   }

   // Deep Dive remains collapsed and ungenerated until the consumer explicitly asks.
   Card(
       modifier = Modifier.fillMaxWidth(),
       colors = CardDefaults.cardColors(containerColor = Color.White),
       shape = RoundedCornerShape(14.dp),
       border = BorderStroke(1.dp, Color(0xFFE0E0E0))
   ) {
       Column(modifier = Modifier.padding(12.dp)) {
           OutlinedButton(
               onClick = {
                   if (!isExpanded) {
                       if (deepDiveText == null && onRequestDeepDive != null) {
                           isLoadingDeepDive = true
                           scope.launch {
                               deepDiveText = onRequestDeepDive()
                               isLoadingDeepDive = false
                               isExpanded = true
                           }
                       } else {
                           isExpanded = true
                       }
                   } else {
                       isExpanded = false
                   }
               },
               modifier = Modifier.fillMaxWidth(),
               shape = RoundedCornerShape(8.dp),
               colors = ButtonDefaults.outlinedButtonColors(
                   contentColor = Color(0xFF6750A4)
               )
           ) {
               if (isLoadingDeepDive) {
                   CircularProgressIndicator(
                       modifier = Modifier
                           .width(16.dp)
                           .height(16.dp),
                       color = Color(0xFF6750A4),
                       strokeWidth = 2.dp
                   )
                   Spacer(modifier = Modifier.width(8.dp))
                   Text(
                       "Loading Deep Dive...",
                       fontSize = 13.sp,
                       fontWeight = FontWeight.Bold
                   )
               } else {
                   Icon(
                       Icons.Default.Info,
                       contentDescription = null,
                       tint = Color(0xFF6750A4)
                   )
                   Spacer(modifier = Modifier.width(8.dp))
                   Text(
                       text = if (isExpanded) {
                           "Hide Deep Dive"
                       } else {
                           "Would You Like To Know More?"
                       },
                       fontSize = 13.sp,
                       fontWeight = FontWeight.Bold
                   )
                   Spacer(modifier = Modifier.weight(1f))
                   Icon(
                       imageVector = if (isExpanded) {
                           Icons.Default.KeyboardArrowUp
                       } else {
                           Icons.Default.KeyboardArrowDown
                       },
                       contentDescription = null,
                       tint = Color(0xFF6750A4)
                   )
               }
           }

           AnimatedVisibility(
               visible = isExpanded && !deepDiveText.isNullOrBlank()
           ) {
               Column(
                   modifier = Modifier
                       .fillMaxWidth()
                       .padding(top = 12.dp, start = 4.dp, end = 4.dp),
                   verticalArrangement = Arrangement.spacedBy(8.dp)
               ) {
                   Text(
                       text = "DEEP DIVE 411",
                       fontSize = 11.sp,
                       fontWeight = FontWeight.Bold,
                       color = Color(0xFF5E5970)
                   )
                   Text(
                       text = deepDiveText ?: "",
                       fontSize = 12.sp,
                       lineHeight = 18.sp,
                       color = Color(0xFF49454F)
                   )
               }
           }
       }
   }

   Spacer(modifier = Modifier.height(16.dp))

  }
  }
