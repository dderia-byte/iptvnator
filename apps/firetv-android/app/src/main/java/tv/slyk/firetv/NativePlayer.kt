package tv.slyk.firetv

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import okhttp3.OkHttpClient
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * The device's own player (ExoPlayer on MediaCodec): hardware HEVC/4K and
 * Dolby AC-3/E-AC-3, which the WebView cannot decode. Slyk Q tells it what to
 * play and where the picture goes (the full screen or a PiG frame).
 */
@OptIn(UnstableApi::class)
class NativePlayer(context: Context, private val view: PlayerView) {
    private val http = OkHttpClient.Builder().followRedirects(true).build()
    private val dataSource = OkHttpDataSource.Factory(http)
    private val exo: ExoPlayer = ExoPlayer.Builder(
        context,
        DefaultRenderersFactory(context).setEnableDecoderFallback(true)
    )
        .setMediaSourceFactory(DefaultMediaSourceFactory(context).setDataSourceFactory(dataSource))
        .build()
    private var currentUrl: String? = null
    private var retries = 0

    init {
        view.player = exo
        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                // Live IPTV drops connections now and then: reconnect a few
                // times before giving up, like a receiver retuning.
                if (retries++ < 3 && currentUrl != null) {
                    exo.prepare()
                    exo.play()
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) retries = 0
            }
        })
    }

    fun play(requestJson: String) {
        val request = JSONObject(requestJson)
        val url = request.getString("url")
        if (url == currentUrl && exo.playbackState != Player.STATE_IDLE) {
            return
        }
        currentUrl = url
        retries = 0
        val headers = mutableMapOf<String, String>()
        request.optJSONObject("headers")?.let { json ->
            json.keys().forEach { name -> headers[name] = json.getString(name) }
        }
        headers["User-Agent"]?.let { dataSource.setUserAgent(it) }
        dataSource.setDefaultRequestProperties(headers - "User-Agent")

        val item = MediaItem.Builder().setUri(url)
        // Xtream live URLs end in .ts; HLS needs its MIME type when the URL
        // does not end in .m3u8 (some panels add query strings).
        if (url.contains(".m3u8", ignoreCase = true)) {
            item.setMimeType(MimeTypes.APPLICATION_M3U8)
        }
        exo.setMediaItem(item.build())
        exo.prepare()
        exo.playWhenReady = true
    }

    fun stop() {
        currentUrl = null
        exo.stop()
        exo.clearMediaItems()
        view.visibility = View.INVISIBLE
    }

    /** CSS-pixel rectangle from the page, converted with the screen density. */
    fun setFrame(x: Double, y: Double, width: Double, height: Double, density: Float) {
        if (width <= 0 || height <= 0) {
            view.visibility = View.INVISIBLE
            return
        }
        val params = view.layoutParams as FrameLayout.LayoutParams
        params.leftMargin = (x * density).roundToInt()
        params.topMargin = (y * density).roundToInt()
        params.width = (width * density).roundToInt()
        params.height = (height * density).roundToInt()
        view.layoutParams = params
        view.visibility = View.VISIBLE
    }

    fun pause() = exo.pause()

    fun resume() {
        if (currentUrl != null) exo.play()
    }

    fun release() = exo.release()
}
