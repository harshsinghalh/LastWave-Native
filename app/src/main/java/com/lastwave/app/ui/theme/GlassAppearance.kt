package com.lastwave.app.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CornerBasedShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.kyant.backdrop.BackdropEffectScope
import com.kyant.backdrop.effects.runtimeShaderEffect
import com.lastwave.app.data.local.AppearanceBackground
import com.lastwave.app.data.local.AppearancePrefs

val LocalAppearance = staticCompositionLocalOf { AppearancePrefs() }

/** Background-only source: glass cards never sample themselves or blur their foreground text. */
@Composable
fun AppearanceBackdrop(modifier: Modifier = Modifier) {
    val prefs = LocalAppearance.current
    val background = MaterialTheme.colorScheme.background
    val primary = MaterialTheme.colorScheme.primary
    val tertiary = MaterialTheme.colorScheme.tertiary
    val dark = LocalIsDarkTheme.current
    Canvas(modifier.fillMaxSize()) {
        drawRect(background)
        if (prefs.background == AppearanceBackground.PLAIN) return@Canvas
        val colors = when (prefs.background) {
            AppearanceBackground.PRISM -> listOf(Color(0xFF458AFF), Color(0xFFDA8FF0), Color(0xFF61D5CE))
            AppearanceBackground.SUNSET -> listOf(Color(0xFFED985A), Color(0xFFDD6E9B), Color(0xFF9888DF))
            else -> listOf(primary, tertiary, Color(0xFF50B9B4))
        }
        val alpha = if (dark) 0.28f else 0.22f
        val radius = size.maxDimension * 0.75f
        listOf(Offset(size.width * 0.05f, size.height * 0.12f),
            Offset(size.width * 0.95f, size.height * 0.38f),
            Offset(size.width * 0.2f, size.height * 0.9f)).forEachIndexed { i, center ->
            drawRect(Brush.radialGradient(listOf(colors[i].copy(alpha = alpha), Color.Transparent), center, radius))
        }
    }
}

/**
 * Native adaptation of Vaso's convex squircle/Snell-law bezel and spectral edge sampling.
 * Reference: user-supplied vaso-main.zip, huozhi/vaso (MIT). No WebView or DOM copy.
 * Backdrop's public API caches the compiled shader; Android 31/32 retain blur and rim.
 */
internal fun BackdropEffectScope.vasoLens(depth: Float, dispersion: Float) {
    if (depth == 0f) return
    val corners = shape as? CornerBasedShape ?: return
    val extent = size.minDimension / 2f
    val radii = floatArrayOf(corners.topStart.toPx(size, this), corners.topEnd.toPx(size, this),
        corners.bottomEnd.toPx(size, this), corners.bottomStart.toPx(size, this))
        .map { it.coerceIn(0f, extent) }.toFloatArray()
    // Resolve logical start/end corners for RTL just as the original outline does.
    if (layoutDirection == androidx.compose.ui.unit.LayoutDirection.Rtl) {
        val a = radii[0]; radii[0] = radii[1]; radii[1] = a
        val b = radii[2]; radii[2] = radii[3]; radii[3] = b
    }
    val bezel = (size.minDimension * 0.3f).coerceAtLeast(1f)
    runtimeShaderEffect("VasoBezel", VASO_SHADER, "content") {
        setFloatUniform("lensSize", size.width, size.height)
        setFloatUniform("lensOffset", -padding, -padding)
        setFloatUniform("radii", radii)
        setFloatUniform("bezel", bezel)
        setFloatUniform("depth", depth)
        setFloatUniform("dispersion", dispersion)
    }
}

private const val VASO_SHADER = """
uniform shader content;
uniform float2 lensSize;
uniform float2 lensOffset;
uniform float4 radii;
uniform float bezel;
uniform float depth;
uniform float dispersion;
half4 main(float2 coord) {
    float2 p = coord + lensOffset - lensSize * 0.5;
    float radius = p.y < 0.0 ? (p.x < 0.0 ? radii.x : radii.y) : (p.x < 0.0 ? radii.w : radii.z);
    radius = max(radius, bezel);
    radius = min(radius, min(lensSize.x, lensSize.y) * 0.5);
    float2 q = abs(p) - (lensSize * 0.5 - radius);
    float2 outside = max(q, float2(0.0));
    float dist = radius - (length(outside) + min(max(q.x, q.y), 0.0));
    float2 normal = q.x > 0.0 && q.y > 0.0 ? outside / max(length(outside), 0.001) : (q.x > q.y ? float2(1.0, 0.0) : float2(0.0, 1.0));
    float u = 1.0 - clamp(dist / bezel, 0.0, 1.0);
    float slope = u * u * u / pow(max(1.0 - u*u*u*u, 0.000000001), 0.75);
    float incident = atan(slope);
    float refracted = asin(sin(incident) / 1.5);
    float magnitude = tan(incident - refracted) / 1.118034;
    float2 shift = -sign(p) * normal * magnitude * depth * bezel * 0.35;
    float spread = dispersion * 0.16;
    half4 center = content.eval(coord + shift);
    if (dispersion <= 0.001) return center;
    half4 red = content.eval(coord + shift * (1.0 - spread));
    half4 blue = content.eval(coord + shift * (1.0 + spread));
    return half4(red.r, center.g, blue.b, center.a);
}
"""
