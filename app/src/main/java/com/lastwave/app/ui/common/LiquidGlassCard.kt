package com.lastwave.app.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.lastwave.app.ui.theme.LocalAppearance
import com.lastwave.app.ui.theme.LocalLiquidGlass
import com.lastwave.app.ui.theme.LocalLiquidGlassBackdrop
import com.lastwave.app.ui.theme.isLiquidGlassBackdropSupported
import com.lastwave.app.ui.theme.liquidGlass


/**
 * Keeps content composition stable when Liquid Glass is toggled.
 */
@Composable
fun LiquidGlassCard(
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(LocalAppearance.current.profile.roundness.dp),
    enabled: Boolean = LocalLiquidGlass.current,
    tintColor: Color = Color.Unspecified,
    contentColor: Color = Color.Unspecified,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val resolvedContentColor = if (contentColor.isSpecified) {
        contentColor
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    val baseColor = if (tintColor.isSpecified) tintColor else MaterialTheme.colorScheme.surfaceContainer
    val appearance = LocalAppearance.current
    val backdrop = LocalLiquidGlassBackdrop.current
    val useGlass = enabled && appearance.glassCards && backdrop != null && isLiquidGlassBackdropSupported()
    val clickModifier = if (onClick != null) {
        Modifier.clickable(
            role = Role.Button,
            onClick = onClick,
        )
    } else Modifier

    Card(
        modifier = modifier.then(if (useGlass) Modifier.liquidGlass(backdrop!!, shape, interactive = false) else Modifier).then(clickModifier),
        shape = shape,
        colors = CardDefaults.cardColors(
            containerColor = if (useGlass) Color.Transparent else baseColor.copy(alpha = 1f),
            contentColor = resolvedContentColor,
        ),
    ) {
        Column(Modifier.padding(appearance.spacing.padding.dp), content = content)
    }
}
